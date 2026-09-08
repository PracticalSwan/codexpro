import { createHash } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import { currentSyncCallDeadline, type DeadlineBudget } from "../deadline.js";
import type { PathGuard, Workspace } from "../guard.js";
import { BatchStore } from "../batches/store.js";
import type { BatchRecord } from "../batches/types.js";
import { detectProjectTypes } from "./classify.js";
import { extractWorkspaceFiles, isAnalyzableInventoryFile, type ExtractedFile } from "./extract.js";
import { buildRelationships } from "./graph.js";
import { inventoryWorkspace } from "./inventory.js";
import type { WorkspaceAnalysis } from "./types.js";
import { getCachedWorkspaceAnalysis, setCachedWorkspaceAnalysis } from "./cache.js";

interface InspectBatchPrivate {
  cursor: number;
  extracted: Array<Omit<ExtractedFile, "text">>;
  scannedBytes: number;
  warnings: string[];
  truncated: boolean;
}

export interface ResumableInspectResult {
  analysis: WorkspaceAnalysis;
  complete: boolean;
  continuationToken?: string;
  batch?: BatchRecord;
}
function requestFingerprint(config: CodexProConfig, supplied?: string): string {
  if (supplied) return supplied;
  return createHash("sha256").update(JSON.stringify({ kind: "inspect_workspace", limits: config.analysisLimits })).digest("hex");
}

function areasFor(files: WorkspaceAnalysis["files"]): WorkspaceAnalysis["areas"] {
  const counts = new Map<string, { role: WorkspaceAnalysis["files"][number]["role"]; files: number }>();
  for (const file of files) {
    const top = file.path.includes("/") ? file.path.split("/")[0] : ".";
    const current = counts.get(top) ?? { role: file.role, files: 0 };
    current.files += 1;
    if (current.role === "other" && file.role !== "other") current.role = file.role;
    counts.set(top, current);
  }
  return [...counts.entries()].map(([areaPath, value]) => ({ path: areaPath, ...value })).sort((a, b) => b.files - a.files || a.path.localeCompare(b.path));
}

function finalize(workspace: Workspace, config: CodexProConfig, inventory: Awaited<ReturnType<typeof inventoryWorkspace>>, state: InspectBatchPrivate, complete: boolean): WorkspaceAnalysis {
  const extracted = state.extracted.map((file) => ({ ...file, text: "" }));
  const symbols = extracted.flatMap((file) => file.symbols).slice(0, config.analysisLimits.maxSymbols);
  const relationships = buildRelationships(extracted, inventory.files, config.analysisLimits.maxRelationships);
  const warnings = [...new Set([...inventory.coverage.warnings, ...state.warnings, ...(!complete ? ["Workspace analysis batch is incomplete; resume with the continuation token."] : [])])];
  const languages = [...new Set(inventory.files.map((file) => file.language).filter((language) => language !== "unknown"))].sort();
  return {
    schemaVersion: 1, workspaceId: workspace.id, root: workspace.root, languages,
    projectTypes: detectProjectTypes(inventory.files), entrypoints: inventory.files.filter((file) => file.entrypoint).map((file) => file.path),
    importantFiles: inventory.files.filter((file) => file.role === "config" || /(^|\/)(README|AGENTS)\.md$/i.test(file.path)).map((file) => file.path),
    areas: areasFor(inventory.files), files: inventory.files, symbols, relationships,
    coverage: { ...inventory.coverage, analyzedFiles: state.extracted.length, scannedBytes: state.scannedBytes, symbolCount: symbols.length, relationshipCount: relationships.length, truncated: inventory.coverage.truncated || state.truncated || !complete, warnings },
    warnings, fingerprint: inventory.fingerprint, cache: { hit: false, key: `batch:${inventory.fingerprint}` }
  };
}
export async function inspectWorkspaceResumable(input: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  store: BatchStore;
  continuationToken?: string;
  requestFingerprint?: string;
  deadline?: DeadlineBudget;
}): Promise<ResumableInspectResult> {
  const inventory = await inventoryWorkspace(input.config, input.guard, input.workspace);
  const fingerprint = requestFingerprint(input.config, input.requestFingerprint);
  const cacheKey = `${input.workspace.id}:${inventory.fingerprint}:${JSON.stringify(input.config.analysisLimits)}`;
  if (!input.continuationToken) {
    const cached = getCachedWorkspaceAnalysis(cacheKey);
    if (cached) return { analysis: { ...cached, cache: { hit: true, key: cacheKey } }, complete: true };
  }
  let batch: BatchRecord;
  let state: InspectBatchPrivate;
  if (input.continuationToken) {
    batch = await input.store.validateContinuation(input.continuationToken, input.workspace, fingerprint, inventory.fingerprint);
    state = await input.store.readPrivate<InspectBatchPrivate>(batch.id);
    if (state.cursor > batch.cursor && batch.state === "active") batch = await input.store.update(batch.id, (record) => { record.cursor = state.cursor; record.completedUnits = state.cursor; return record; });
  } else {
    batch = await input.store.create({ workspace: input.workspace, kind: "inspect_workspace", requestFingerprint: fingerprint, sourceFingerprint: inventory.fingerprint });
    state = { cursor: 0, extracted: [], scannedBytes: 0, warnings: [], truncated: false };
    await input.store.savePrivate(batch.id, state);
  }
  if (batch.kind !== "inspect_workspace") throw new Error("Batch kind does not match inspect_workspace.");
  const candidates = inventory.files.filter(isAnalyzableInventoryFile);
  if (batch.state === "completed") return { analysis: finalize(input.workspace, input.config, inventory, state, true), complete: true, batch };
  const deadline = input.deadline ?? currentSyncCallDeadline();
  let processedThisCall = 0;
  while (state.cursor < candidates.length) {
    if (state.extracted.length >= input.config.analysisLimits.maxAnalyzedFiles || state.scannedBytes + candidates[state.cursor].bytes > input.config.analysisLimits.maxScannedBytes) {
      state.truncated = true;
      state.warnings.push("Source analysis reached its file or byte limit.");
      state.cursor = candidates.length;
      break;
    }
    if (processedThisCall > 0 && deadline?.shouldYield(25)) break;
    const candidate = candidates[state.cursor];
    const remainingSymbols = Math.max(0, input.config.analysisLimits.maxSymbols - state.extracted.reduce((sum, file) => sum + file.symbols.length, 0));
    const unitConfig = { ...input.config, analysisLimits: { ...input.config.analysisLimits, maxAnalyzedFiles: 1, maxScannedBytes: Math.max(1, input.config.analysisLimits.maxScannedBytes - state.scannedBytes), maxSymbols: remainingSymbols } };
    const unit = await extractWorkspaceFiles(unitConfig, input.guard, input.workspace, [candidate], inventory.files);
    for (const file of unit.files) {
      const { text: _text, ...summary } = file;
      state.extracted.push(summary);
    }
    state.scannedBytes += unit.scannedBytes;
    state.warnings.push(...unit.warnings);
    state.truncated ||= unit.truncated;
    state.cursor += 1;
    processedThisCall += 1;
    await input.store.savePrivate(batch.id, state);
    batch = await input.store.update(batch.id, (record) => { record.cursor = state.cursor; record.completedUnits = state.cursor; return record; });
  }
  const complete = state.cursor >= candidates.length;
  if (complete) batch = await input.store.markState(batch.id, "completed");
  const analysis = finalize(input.workspace, input.config, inventory, state, complete);
  if (complete) { analysis.cache = { hit: false, key: cacheKey }; setCachedWorkspaceAnalysis(cacheKey, analysis); }
  return { analysis, complete, ...(complete ? {} : { continuationToken: batch.id }), batch };
}
