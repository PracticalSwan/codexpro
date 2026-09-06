import { createHash } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import type { PathGuard, Workspace } from "./guard.js";
import { readTextFile } from "./fsOps.js";
import { searchWorkspace } from "./searchOps.js";
import { gitRecentCommits, gitStatus } from "./gitOps.js";
import { instructionsForPath } from "./instructionOps.js";
import { redactSensitiveText } from "./redact.js";
import { inspectWorkspace } from "./analysis/index.js";
import { rankContextWithDependencies } from "./analysis/rank.js";
import { ContextCache } from "./contextCache.js";
import { rankContextCandidates, type ContextStrategy, type ContextItemKind } from "./contextRanking.js";

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

export async function readMany(request: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace;
  items: Array<{ path: string; startLine?: number; endLine?: number }>;
  maxTotalBytes?: number;
}) {
  const maxTotalBytes = Math.max(1, Math.min(request.maxTotalBytes ?? request.config.maxReadBytes, request.config.maxReadBytes * 4));
  let remaining = maxTotalBytes;
  const items: any[] = [];
  for (const item of request.items.slice(0, 64)) {
    if (remaining <= 0) { items.push({ ok: false, path: item.path, error: "aggregate byte budget exhausted" }); continue; }
    try {
      const read = await readTextFile(request.config, request.guard, request.workspace, item.path, { startLine: item.startLine, endLine: item.endLine, maxBytes: Math.min(remaining, request.config.maxReadBytes) });
      const text = utf8Prefix(read.text, remaining);
      remaining -= Buffer.byteLength(text, "utf8");
      items.push({ ok: true, ...read, text });
    } catch (error) {
      items.push({ ok: false, path: item.path, error: redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 480) });
    }
  }
  return { items, totalBytes: maxTotalBytes - remaining, truncated: remaining <= 0 };
}
export async function searchMany(request: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace;
  items: Array<{ query: string; root?: string; regex?: boolean; glob?: string }>;
  maxTotalResults?: number; maxTotalBytes?: number;
}) {
  const resultBudget = Math.max(1, Math.min(request.maxTotalResults ?? request.config.maxSearchResults, request.config.maxSearchResults * 4));
  const byteBudget = Math.max(1, Math.min(request.maxTotalBytes ?? request.config.maxOutputBytes, request.config.maxOutputBytes * 4));
  let resultsLeft = resultBudget, bytesLeft = byteBudget, totalResults = 0;
  const items: any[] = [];
  for (const item of request.items.slice(0, 32)) {
    if (resultsLeft <= 0 || bytesLeft <= 0) { items.push({ ok: false, query: item.query, error: "aggregate search budget exhausted" }); continue; }
    try {
      const result = await searchWorkspace(request.config, request.guard, request.workspace, {
        query: item.query, root: item.root, regex: item.regex, glob: item.glob,
        maxResults: Math.min(resultsLeft, request.config.maxSearchResults), includeHidden: false
      });
      const matches = result.matches.slice(0, resultsLeft);
      let text = utf8Prefix(result.text, bytesLeft);
      bytesLeft -= Buffer.byteLength(text, "utf8");
      resultsLeft -= matches.length;
      totalResults += matches.length;
      items.push({ ok: true, query: item.query, text, matches, truncated: result.truncated || text.length < result.text.length, used: result.used });
    } catch (error) {
      items.push({ ok: false, query: item.query, error: redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 480) });
    }
  }
  return { items, totalResults, totalBytes: byteBudget - bytesLeft, truncated: resultsLeft <= 0 || bytesLeft <= 0 };
}

export interface GatheredContextSection { kind: ContextItemKind | "commits"; source: string; text: string; }
export interface RankedContextItem { path: string; kind: ContextItemKind; score: number; reasons: string[]; bytes: number; }
export interface GatheredContextV2 {
  targetPath: string;
  strategy: ContextStrategy;
  sections: GatheredContextSection[];
  selectedItems: RankedContextItem[];
  text: string;
  bytes: number;
  truncated: boolean;
  omittedCandidates: number;
  estimatedTokens: number;
  targetTokens?: number;
  cache: { hit: boolean; key: string; fingerprint: string };
}

export interface ContextRequestV2 {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace; cache?: ContextCache<GatheredContextV2>;
  strategy?: ContextStrategy; targetPath?: string; targetSymbol?: string; changedPaths?: string[];
  includeTests?: boolean; includeRecentChanges?: boolean; maxBytes?: number; targetTokens?: number;
}

function requestKey(request: ContextRequestV2, targetPath: string, changedPaths: string[]): string {
  const normalized = JSON.stringify({
    strategy: request.strategy ?? "task", targetPath, targetSymbol: request.targetSymbol ?? "",
    changedPaths: [...changedPaths].sort(), includeTests: request.includeTests !== false,
    includeRecentChanges: request.includeRecentChanges !== false,
    maxBytes: request.maxBytes ?? null, targetTokens: request.targetTokens ?? null
  });
  return createHash("sha256").update(normalized).digest("hex").slice(0, 24);
}

export async function gatherContextV2(request: ContextRequestV2): Promise<GatheredContextV2> {
  const strategy = request.strategy ?? "task";
  const maxBytes = Math.max(1000, Math.min(request.maxBytes ?? request.config.maxReadBytes, request.config.maxReadBytes * 4));
  const targetPath = request.targetPath ? request.guard.resolve(request.workspace, request.targetPath).relPath : (request.changedPaths?.[0] ? request.guard.resolve(request.workspace, request.changedPaths[0]).relPath : ".");
  const changedPaths = [...new Set((request.changedPaths ?? []).map((item) => request.guard.resolve(request.workspace, item).relPath))];
  const analysis = await inspectWorkspace(request.config, request.guard, request.workspace);
  const status = gitStatus(request.config, request.workspace);
  const commits = request.includeRecentChanges === false ? [] : gitRecentCommits(request.config, request.workspace, 5);
  const fingerprint = createHash("sha256").update(analysis.fingerprint).update("\0").update(status).update("\0").update(commits[0]?.shortSha ?? "no-head").digest("hex");
  const key = requestKey(request, targetPath, changedPaths);
  const cached = request.cache?.get(key, fingerprint);
  if (cached) return { ...cached, cache: { hit: true, key, fingerprint } };

  let remaining = maxBytes;
  const sections: GatheredContextSection[] = [];
  const selectedItems: RankedContextItem[] = [];
  const add = (kind: GatheredContextSection["kind"], source: string, text: string, item?: Omit<RankedContextItem, "bytes">) => {
    if (remaining <= 0 || !text) return false;
    const bounded = utf8Prefix(redactSensitiveText(text), remaining);
    const bytes = Buffer.byteLength(bounded, "utf8");
    if (!bytes) return false;
    remaining -= bytes;
    sections.push({ kind, source: source.slice(0, 512), text: bounded });
    if (item) selectedItems.push({ ...item, reasons: item.reasons.slice(0, 6).map((reason) => reason.slice(0, 160)), score: Math.max(0, Math.min(1000, item.score)), bytes });
    return true;
  };

  const instructions = await instructionsForPath(request.config, request.guard, request.workspace, targetPath);
  add("instructions", instructions.sources.join(", ") || "none", instructions.text, { path: instructions.sources[0] ?? "AGENTS.md", kind: "instructions", score: 1000, reasons: ["applicable project instructions"] });
  try {
    const read = await readTextFile(request.config, request.guard, request.workspace, targetPath, { maxBytes: Math.min(remaining, request.config.maxReadBytes) });
    const reasons = strategy === "symbol" && request.targetSymbol ? [`explicit target for symbol ${request.targetSymbol}`] : strategy === "change" ? ["explicit changed target"] : ["explicit requested target"];
    add("target", read.path, read.text, { path: read.path, kind: "target", score: 980, reasons });
  } catch {}

  const candidates = rankContextCandidates({ analysis, strategy, targetPath, targetSymbol: request.targetSymbol, changedPaths, includeTests: request.includeTests });
  let omittedCandidates = 0;
  for (const candidate of candidates) {
    if (remaining <= 0) { omittedCandidates += 1; continue; }
    try {
      const read = await readTextFile(request.config, request.guard, request.workspace, candidate.path, { maxBytes: Math.min(remaining, Math.max(1000, Math.floor(maxBytes / 5))) });
      if (!add(candidate.kind, candidate.path, read.text, candidate)) omittedCandidates += 1;
    } catch { omittedCandidates += 1; }
  }
  if (request.includeRecentChanges !== false) {
    add("git", "git status", status, { path: "git:status", kind: "git", score: strategy === "change" ? 850 : 350, reasons: ["current Git change state"] });
    add("commits", "recent commits", commits.map((commit) => `${commit.shortSha} ${commit.subject}`).join("\n"));
  }
  const bytes = maxBytes - remaining;
  const result: GatheredContextV2 = {
    targetPath, strategy, sections, selectedItems,
    text: sections.map((section) => `## ${section.kind}: ${section.source}\n${section.text}`).join("\n\n"),
    bytes, truncated: remaining <= 0 || omittedCandidates > 0, omittedCandidates,
    estimatedTokens: Math.ceil(bytes / 4), ...(request.targetTokens ? { targetTokens: Math.max(1, Math.floor(request.targetTokens)) } : {}),
    cache: { hit: false, key, fingerprint }
  };
  request.cache?.set(key, fingerprint, result);
  return result;
}

export async function prepareSubtaskContext(request: ContextRequestV2): Promise<GatheredContextV2 & { bundleType: "subtask_context" }> {
  const result = await gatherContextV2(request);
  return { ...result, bundleType: "subtask_context" };
}

export async function gatherContext(request: { config: CodexProConfig; guard: PathGuard; workspace: Workspace; targetPath?: string; maxBytes?: number }) {
  return gatherContextV2({ ...request, strategy: "task" });
}
