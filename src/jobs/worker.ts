import type { CodexProConfig } from "../config.js";
import { boundedJobText, hashWorkerNonce, normalizeJobProgress, sanitizeJobResult, type JobRecord } from "./types.js";
import { JobStore } from "./store.js";
import { STRUCTURED_JOB_ATTESTATION_GRACE_MS, waitForProcessStartIdentity } from "./runner.js";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export interface StructuredJobWorkerContext {
  id: string;
  store: JobStore;
  record: JobRecord;
  config: CodexProConfig;
  payload: Record<string, unknown>;
  appendOutput(value: unknown): Promise<void>;
  setProgress(progress: { phase?: string; completed?: number; total?: number; message?: string }): Promise<void>;
  cancelRequested(): Promise<boolean>;
}

export type StructuredJobWorkerExecutor = (context: StructuredJobWorkerContext) => Promise<Record<string, unknown>>;

async function waitForWorkerClaim(store: JobStore, id: string, nonceHash: string): Promise<JobRecord> {
  // Parent-side Windows StartTime attestation may require several bounded PowerShell probes on cold runners.
  // Keep this pre-claim window longer than the parent's worst-case identity probe budget; the parent still
  // terminates the worker when identity cannot be established, and the worker remains nonce/start-key gated.
  const attempts = Math.ceil(STRUCTURED_JOB_ATTESTATION_GRACE_MS / 50);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const record = await store.require(id);
    if (record.worker?.pid === process.pid && record.worker.nonceHash === nonceHash) return record;
    if (["completed", "failed", "canceled"].includes(record.state)) throw new Error(`Job became terminal before worker claim: ${record.state}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for structured job worker claim.");
}export async function runStructuredJobWorker(executor: StructuredJobWorkerExecutor): Promise<void> {
  const jobDir = arg("--job-dir");
  const id = arg("--job-id");
  const rawNonce = String(process.env.CODEXPRO_JOB_WORKER_NONCE ?? "");
  const nonceHash = hashWorkerNonce(rawNonce);
  delete process.env.CODEXPRO_JOB_WORKER_NONCE;
  const store = new JobStore({ baseDir: jobDir });
  let record = await waitForWorkerClaim(store, id, nonceHash);
  const startKey = await waitForProcessStartIdentity(process.pid);
  if (!startKey || startKey !== record.worker?.startKey) throw new Error("Structured job worker process identity does not match launch metadata.");
  const attestedAt = new Date().toISOString();
  await store.saveOwner(id, { pid: process.pid, startedAt: record.worker.startedAt, nonceHash, startKey, attestedAt });
  const config = await store.readRuntime(id);
  const payload = await store.readPayload(id);
  record = await store.update(id, (current) => {
    if (current.state !== "running") throw new Error(`Worker cannot start from job state ${current.state}.`);
    current.progress = { ...current.progress, phase: current.progress.phase === "starting" ? "running" : current.progress.phase, lastProgressAt: attestedAt };
    return current;
  });

  const context: StructuredJobWorkerContext = {
    id,
    store,
    record,
    config,
    payload,
    appendOutput: async (value) => {
      const appended = await store.appendOutput(id, value);
      if (appended.appendedBytes > 0) await store.update(id, (current) => { current.progress.lastProgressAt = new Date().toISOString(); return current; });
    },
    setProgress: async (progress) => {
      await store.update(id, (current) => {
        current.progress = normalizeJobProgress({ ...current.progress, ...progress }, new Date().toISOString());
        return current;
      });
    },
    cancelRequested: () => store.cancelRequested(id)
  };
  try {
    const result = sanitizeJobResult(await executor(context));
    const canceled = await store.cancelRequested(id);
    const at = new Date().toISOString();
    if (canceled) {
      await store.saveTerminal(id, { schemaVersion: 1, state: "canceled", at });
      await store.update(id, (current) => { current.state = "canceled"; current.worker = undefined; current.progress = { ...current.progress, phase: "canceled", lastProgressAt: at }; return current; });
    } else {
      await store.saveTerminal(id, { schemaVersion: 1, state: "completed", at, result });
      await store.update(id, (current) => { current.state = "completed"; current.worker = undefined; current.result = result; current.error = undefined; current.progress = { ...current.progress, phase: "completed", lastProgressAt: at }; return current; });
    }
  } catch (error) {
    const message = boundedJobText(error instanceof Error ? error.message : String(error), "Job error", 480) ?? "Job failed";
    const at = new Date().toISOString();
    await store.saveTerminal(id, { schemaVersion: 1, state: "failed", at, error: message }).catch(() => undefined);
    await store.update(id, (current) => {
      if (!['completed', 'canceled'].includes(current.state)) {
        current.state = "failed";
        current.worker = undefined;
        current.error = message;
        current.progress = { ...current.progress, phase: "failed", message, lastProgressAt: at };
      }
      return current;
    }).catch(() => undefined);
    throw error;
  } finally {
    await store.clearOwner(id);
    await store.clearCancel(id);
  }
}