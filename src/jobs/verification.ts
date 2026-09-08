import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CodexProConfig } from "../config.js";
import { PathGuard, type Workspace } from "../guard.js";
import {
  discoverTrustedChecks,
  finalizeVerificationResult,
  prepareVerification,
  runChecks,
  selectTrustedChecks,
  verificationRoutingHint,
  type CheckExecutionResult,
  type TrustedCheck
} from "../checksOps.js";
import type { ChangeAnalysis } from "../analysis/types.js";
import type { JobRecord } from "./types.js";
import type { JobStore } from "./store.js";
import { launchStructuredJob, registerStructuredJobProducer } from "./runner.js";
import { runStructuredJobWorker, type StructuredJobWorkerContext } from "./worker.js";

export type VerificationJobMode = "checks" | "verify";
interface VerificationJobPayload {
  mode: VerificationJobMode;
  selectedChecks: TrustedCheck[];
  timeoutMs?: number;
  changedPaths?: string[];
  analysis?: ChangeAnalysis;
}
function asPayload(value: Record<string, unknown>): VerificationJobPayload {
  if (value.mode !== "checks" && value.mode !== "verify") throw new Error("Invalid verification job mode.");
  if (!Array.isArray(value.selectedChecks)) throw new Error("Verification job selected checks are missing.");
  const selectedChecks = value.selectedChecks as TrustedCheck[];
  const timeoutMs = value.timeoutMs === undefined ? undefined : Number(value.timeoutMs);
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1_000)) throw new Error("Verification job timeout is invalid.");
  const changedPaths = Array.isArray(value.changedPaths) ? value.changedPaths.map(String) : undefined;
  const analysis = value.analysis && typeof value.analysis === "object" ? value.analysis as unknown as ChangeAnalysis : undefined;
  if (value.mode === "verify" && !analysis) throw new Error("Verification job analysis is missing.");
  return { mode: value.mode, selectedChecks, ...(timeoutMs ? { timeoutMs } : {}), ...(changedPaths ? { changedPaths } : {}), ...(analysis ? { analysis } : {}) };
}

function previousResults(record: JobRecord): CheckExecutionResult[] {
  const raw = record.result?.results;
  return Array.isArray(raw) ? raw as unknown as CheckExecutionResult[] : [];
}

function workspaceFor(context: StructuredJobWorkerContext): Workspace {
  return { id: context.record.workspaceId, root: context.record.workspaceRoot, openedAt: context.record.createdAt };
}

async function persistPartial(context: StructuredJobWorkerContext, payload: VerificationJobPayload, results: CheckExecutionResult[]): Promise<void> {
  await context.store.update(context.id, (record) => {
    record.result = { mode: payload.mode, selectedChecks: payload.selectedChecks, results, complete: false };
    record.progress = { ...record.progress, completed: results.length, total: payload.selectedChecks.length, lastProgressAt: new Date().toISOString() };
    return record;
  });
}
export async function executeVerificationJob(context: StructuredJobWorkerContext): Promise<Record<string, unknown>> {
  const payload = asPayload(context.payload);
  const workspace = workspaceFor(context);
  const guard = new PathGuard(context.config);
  const results = previousResults(context.record);
  const completedIds = new Set(results.map((result) => result.check.id));
  await context.setProgress({ phase: "discover", completed: results.length, total: payload.selectedChecks.length });

  for (const check of payload.selectedChecks) {
    if (completedIds.has(check.id)) continue;
    if (await context.cancelRequested()) break;
    await context.setProgress({ phase: `check:${check.id}`, completed: results.length, total: payload.selectedChecks.length });
    const executed = await runChecks({
      config: context.config,
      guard,
      workspace,
      checkIds: [check.id],
      timeoutMs: payload.timeoutMs
    });
    const result = executed.results[0];
    if (!executed.complete || !result) throw new Error(`Verification check did not complete: ${check.id}`);
    results.push(result);
    completedIds.add(check.id);
    await persistPartial(context, payload, results);
    await context.appendOutput(`${check.id}: ${result.ok ? "passed" : "failed"}\n`);
  }

  if (await context.cancelRequested()) return { mode: payload.mode, selectedChecks: payload.selectedChecks, results, complete: false };
  await context.setProgress({ phase: "summarize", completed: results.length, total: payload.selectedChecks.length });
  if (payload.mode === "verify") {
    return { ...finalizeVerificationResult(payload.analysis!, payload.selectedChecks, results, { complete: true }, verificationRoutingHint(context.config, payload.selectedChecks, payload.timeoutMs, "start_verification")) };
  }
  return {
    ok: results.every((result) => result.ok),
    complete: true,
    deadlineYielded: false,
    remainingCheckIds: [],
    selectedChecks: payload.selectedChecks,
    results,
    routing: verificationRoutingHint(context.config, payload.selectedChecks, payload.timeoutMs, "start_checks")
  };
}

export function registerVerificationJobProducer(): () => void {
  return registerStructuredJobProducer({ kind: "verification", workerEntrypoint: fileURLToPath(import.meta.url), resumable: true });
}

async function createAndLaunch(input: {
  config: CodexProConfig;
  workspace: Workspace;
  store: JobStore;
  payload: VerificationJobPayload;
}): Promise<JobRecord> {
  const job = await input.store.create({ workspace: input.workspace, kind: "verification", progress: { phase: "queued", completed: 0, total: input.payload.selectedChecks.length } });
  await input.store.savePayload(job.id, input.payload as unknown as Record<string, unknown>);
  return launchStructuredJob(input.config, input.store, input.workspace, job.id);
}
export async function startChecksJob(input: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  store: JobStore;
  checkIds: string[];
  timeoutMs?: number;
}): Promise<JobRecord> {
  const discovered = await discoverTrustedChecks(input.config, input.guard, input.workspace);
  const selectedChecks = selectTrustedChecks(discovered, input.checkIds);
  return createAndLaunch({
    config: input.config,
    workspace: input.workspace,
    store: input.store,
    payload: { mode: "checks", selectedChecks, ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}) }
  });
}

export async function startVerificationJob(input: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  store: JobStore;
  changedPaths: string[];
  timeoutMs?: number;
}): Promise<JobRecord> {
  const prepared = await prepareVerification({ config: input.config, guard: input.guard, workspace: input.workspace, changedPaths: input.changedPaths });
  return createAndLaunch({
    config: input.config,
    workspace: input.workspace,
    store: input.store,
    payload: {
      mode: "verify",
      selectedChecks: prepared.selectedChecks,
      changedPaths: [...input.changedPaths],
      analysis: prepared.analysis,
      ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {})
    }
  });
}

async function main(): Promise<void> {
  await runStructuredJobWorker(executeVerificationJob);
}

const invokedAsScript = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (invokedAsScript) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
