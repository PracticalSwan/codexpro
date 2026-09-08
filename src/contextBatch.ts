import { createHash } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import { currentSyncCallDeadline, type DeadlineBudget } from "./deadline.js";
import type { PathGuard, Workspace } from "./guard.js";
import { readTextFile } from "./fsOps.js";
import { gitRecentCommits, gitStatus } from "./gitOps.js";
import { instructionsForPath } from "./instructionOps.js";
import { redactSensitiveText } from "./redact.js";
import { inspectWorkspace } from "./analysis/index.js";
import { rankContextCandidates, type ContextItemKind, type ContextStrategy } from "./contextRanking.js";
import { BatchStore } from "./batches/store.js";
import type { BatchRecord } from "./batches/types.js";
import type { GatheredContextSection, GatheredContextV2, RankedContextItem } from "./contextOps.js";
import type { ContextCache } from "./contextCache.js";

interface StoredUnit {
  kind: GatheredContextSection["kind"];
  source: string;
  path?: string;
  bytes: number;
  item?: RankedContextItem;
}

interface ContextBatchPrivate {
  phase: "instructions" | "target" | "candidates" | "git" | "commits" | "done";
  candidateCursor: number;
  remainingBytes: number;
  omittedCandidates: number;
  units: StoredUnit[];
}
function utf8Prefix(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0, end = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size; end += char.length;
  }
  return value.slice(0, end);
}

function requestFingerprint(input: {
  strategy: ContextStrategy; targetPath: string; targetSymbol?: string; changedPaths: string[];
  includeTests: boolean; includeRecentChanges: boolean; maxBytes: number; targetTokens?: number;
}): string {
  return createHash("sha256").update(JSON.stringify({ ...input, changedPaths: [...input.changedPaths].sort() })).digest("hex");
}

function sectionFrom(unit: StoredUnit, text: string): GatheredContextSection {
  return { kind: unit.kind, source: unit.source, text: utf8Prefix(redactSensitiveText(text), unit.bytes) };
}

function addUnit(state: ContextBatchPrivate, unit: Omit<StoredUnit, "bytes">, text: string): StoredUnit | undefined {
  if (state.remainingBytes <= 0 || !text) return undefined;
  const bounded = utf8Prefix(redactSensitiveText(text), state.remainingBytes);
  const bytes = Buffer.byteLength(bounded, "utf8");
  if (!bytes) return undefined;
  const stored: StoredUnit = { ...unit, ...(unit.item ? { item: { ...unit.item, bytes } } : {}), bytes };
  state.units.push(stored);
  state.remainingBytes -= bytes;
  return stored;
}
async function rebuildSections(input: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace; targetPath: string;
  units: StoredUnit[]; status: string; commitsText: string;
}): Promise<GatheredContextSection[]> {
  const sections: GatheredContextSection[] = [];
  for (const unit of input.units) {
    try {
      if (unit.kind === "instructions") {
        const instructions = await instructionsForPath(input.config, input.guard, input.workspace, input.targetPath);
        sections.push(sectionFrom(unit, instructions.text));
      } else if (unit.kind === "git") sections.push(sectionFrom(unit, input.status));
      else if (unit.kind === "commits") sections.push(sectionFrom(unit, input.commitsText));
      else if (unit.path) {
        const read = await readTextFile(input.config, input.guard, input.workspace, unit.path, { maxBytes: input.config.maxReadBytes });
        sections.push(sectionFrom(unit, read.text));
      }
    } catch {
      throw new Error(`Batch source changed or became unreadable while rebuilding ${unit.source}. Start a fresh gather_context batch.`);
    }
  }
  return sections;
}

export async function gatherContextResumable(input: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace; store: BatchStore;
  continuationToken?: string; deadline?: DeadlineBudget; strategy?: ContextStrategy; targetPath?: string;
  targetSymbol?: string; changedPaths?: string[]; includeTests?: boolean; includeRecentChanges?: boolean;
  maxBytes?: number; targetTokens?: number;
  cache?: ContextCache<GatheredContextV2>;
}): Promise<GatheredContextV2 & { complete: boolean; continuationToken?: string; batch?: BatchRecord }> {
  const strategy = input.strategy ?? "task";
  const maxBytes = Math.max(1000, Math.min(input.maxBytes ?? input.config.maxReadBytes, input.config.maxReadBytes * 4));
  const targetPath = input.targetPath ? input.guard.resolve(input.workspace, input.targetPath).relPath : (input.changedPaths?.[0] ? input.guard.resolve(input.workspace, input.changedPaths[0]).relPath : ".");
  const changedPaths = [...new Set((input.changedPaths ?? []).map((item) => input.guard.resolve(input.workspace, item).relPath))];
  const analysis = await inspectWorkspace(input.config, input.guard, input.workspace);
  const status = gitStatus(input.config, input.workspace);
  const commits = input.includeRecentChanges === false ? [] : gitRecentCommits(input.config, input.workspace, 5);
  const commitsText = commits.map((commit) => `${commit.shortSha} ${commit.subject}`).join("\n");
  const sourceFingerprint = createHash("sha256").update(analysis.fingerprint).update("\0").update(status).update("\0").update(commits[0]?.shortSha ?? "no-head").digest("hex");
  const requestHash = requestFingerprint({ strategy, targetPath, targetSymbol: input.targetSymbol, changedPaths, includeTests: input.includeTests !== false, includeRecentChanges: input.includeRecentChanges !== false, maxBytes, targetTokens: input.targetTokens });
  const cacheKey = requestHash.slice(0, 24);
  if (!input.continuationToken) {
    const cached = input.cache?.get(cacheKey, sourceFingerprint);
    if (cached) return { ...cached, cache: { hit: true, key: cacheKey, fingerprint: sourceFingerprint }, complete: true };
  }
  const candidates = rankContextCandidates({ analysis, strategy, targetPath, targetSymbol: input.targetSymbol, changedPaths, includeTests: input.includeTests });
  let batch: BatchRecord;
  let state: ContextBatchPrivate;
  if (input.continuationToken) {
    batch = await input.store.validateContinuation(input.continuationToken, input.workspace, requestHash, sourceFingerprint);
    if (batch.kind !== "gather_context") throw new Error("Batch kind does not match gather_context.");
    state = await input.store.readPrivate<ContextBatchPrivate>(batch.id);
  } else {
    batch = await input.store.create({ workspace: input.workspace, kind: "gather_context", requestFingerprint: requestHash, sourceFingerprint });
    state = { phase: "instructions", candidateCursor: 0, remainingBytes: maxBytes, omittedCandidates: 0, units: [] };
    await input.store.savePrivate(batch.id, state);
  }
  const deadline = input.deadline ?? currentSyncCallDeadline();
  let processedThisCall = 0;
  const shouldYield = () => processedThisCall > 0 && Boolean(deadline?.shouldYield(25));
  const checkpoint = async () => {
    await input.store.savePrivate(batch.id, state);
    batch = await input.store.update(batch.id, (record) => { record.cursor = state.candidateCursor; record.completedUnits += 1; return record; });
    processedThisCall += 1;
  };

  while (state.phase !== "done") {
    if (shouldYield()) break;
    if (state.phase === "instructions") {
      const instructions = await instructionsForPath(input.config, input.guard, input.workspace, targetPath);
      const item = { path: instructions.sources[0] ?? "AGENTS.md", kind: "instructions" as const, score: 1000, reasons: ["applicable project instructions"], bytes: 0 };
      addUnit(state, { kind: "instructions", source: instructions.sources.join(", ") || "none", item }, instructions.text);
      state.phase = "target";
      await checkpoint();
      continue;
    }
    if (state.phase === "target") {
      try {
        const read = await readTextFile(input.config, input.guard, input.workspace, targetPath, { maxBytes: Math.min(Math.max(1, state.remainingBytes), input.config.maxReadBytes) });
        const reasons = strategy === "symbol" && input.targetSymbol ? [`explicit target for symbol ${input.targetSymbol}`] : strategy === "change" ? ["explicit changed target"] : ["explicit requested target"];
        const item = { path: read.path, kind: "target" as const, score: 980, reasons, bytes: 0 };
        addUnit(state, { kind: "target", source: read.path, path: read.path, item }, read.text);
      } catch {}
      state.phase = "candidates";
      await checkpoint();
      continue;
    }
    if (state.phase === "candidates") {
      if (state.candidateCursor >= candidates.length) { state.phase = "git"; continue; }
      if (state.remainingBytes <= 0) {
        state.omittedCandidates += candidates.length - state.candidateCursor;
        state.candidateCursor = candidates.length;
        state.phase = "git";
        await checkpoint();
        continue;
      }
      const candidate = candidates[state.candidateCursor];
      try {
        const read = await readTextFile(input.config, input.guard, input.workspace, candidate.path, { maxBytes: Math.min(state.remainingBytes, Math.max(1000, Math.floor(maxBytes / 5))) });
        const item = { ...candidate, bytes: 0 } as RankedContextItem;
        if (!addUnit(state, { kind: candidate.kind, source: candidate.path, path: candidate.path, item }, read.text)) state.omittedCandidates += 1;
      } catch { state.omittedCandidates += 1; }
      state.candidateCursor += 1;
      if (state.candidateCursor >= candidates.length) state.phase = "git";
      await checkpoint();
      continue;
    }
    if (state.phase === "git") {
      if (input.includeRecentChanges !== false) {
        const item = { path: "git:status", kind: "git" as const, score: strategy === "change" ? 850 : 350, reasons: ["current Git change state"], bytes: 0 };
        addUnit(state, { kind: "git", source: "git status", item }, status);
      }
      state.phase = "commits";
      await checkpoint();
      continue;
    }
    if (state.phase === "commits") {
      if (input.includeRecentChanges !== false) addUnit(state, { kind: "commits", source: "recent commits" }, commitsText);
      state.phase = "done";
      await checkpoint();
    }
  }
  const complete = state.phase === "done";
  if (complete && batch.state !== "completed") batch = await input.store.markState(batch.id, "completed");
  const sections = await rebuildSections({ config: input.config, guard: input.guard, workspace: input.workspace, targetPath, units: state.units, status, commitsText });
  const selectedItems = state.units.flatMap((unit) => unit.item ? [unit.item] : []);
  const bytes = maxBytes - state.remainingBytes;
  const result: GatheredContextV2 = {
    targetPath, strategy, sections, selectedItems,
    text: sections.map((section) => `## ${section.kind}: ${section.source}\n${section.text}`).join("\n\n"),
    bytes,
    truncated: state.remainingBytes <= 0 || state.omittedCandidates > 0 || !complete,
    omittedCandidates: state.omittedCandidates,
    estimatedTokens: Math.ceil(bytes / 4),
    ...(input.targetTokens ? { targetTokens: Math.max(1, Math.floor(input.targetTokens)) } : {}),
    cache: { hit: false, key: cacheKey, fingerprint: sourceFingerprint }
  };
  if (complete) input.cache?.set(cacheKey, sourceFingerprint, result);
  return { ...result, complete, ...(complete ? {} : { continuationToken: batch.id }), batch };
}
