import fs from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import type { Workspace } from "../guard.js";
import { boundedJobText, hashWorkerNonce, type JobKind, type JobRecord } from "./types.js";
import type { JobStore } from "./store.js";

export interface StructuredJobProducerRegistration {
  kind: JobKind;
  workerEntrypoint: string;
  resumable: boolean;
}

export interface JobRunnerDeps {
  processStartIdentity?: (pid: number) => string | null;
  processAlive?: (pid: number) => boolean;
  signalProcess?: (pid: number) => boolean;
  spawnWorker?: (entrypoint: string, args: string[], env: NodeJS.ProcessEnv) => ChildProcess;
}

const producers = new Map<JobKind, StructuredJobProducerRegistration>();
export const STRUCTURED_JOB_ATTESTATION_GRACE_MS = 30_000;

export function registerStructuredJobProducer(input: StructuredJobProducerRegistration): () => void {
  if (input.kind !== "verification") throw new Error(`Unsupported structured job kind: ${String(input.kind)}`);
  const workerEntrypoint = path.resolve(input.workerEntrypoint);
  if (!fs.existsSync(workerEntrypoint) || !fs.statSync(workerEntrypoint).isFile()) throw new Error(`Structured job worker entrypoint is unavailable: ${workerEntrypoint}`);
  const current = producers.get(input.kind);
  if (current && current.workerEntrypoint !== workerEntrypoint) throw new Error(`Structured job producer already registered for ${input.kind}.`);
  producers.set(input.kind, { kind: input.kind, workerEntrypoint, resumable: Boolean(input.resumable) });
  return () => { if (producers.get(input.kind)?.workerEntrypoint === workerEntrypoint) producers.delete(input.kind); };
}export function registeredStructuredJobKinds(): JobKind[] { return [...producers.keys()]; }

export function processStartIdentity(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === "win32") {
    const command = `$p=Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`;
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", timeout: 3_000, windowsHide: true });
    const value = String(result.stdout ?? "").trim();
    return result.status === 0 && /^\d+$/.test(value) ? `win:${value}` : null;
  }
  if (process.platform === "linux") {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const rest = stat.slice(close + 2).trim().split(/\s+/);
      const startTicks = rest[19];
      return startTicks && /^\d+$/.test(startTicks) ? `linux:${startTicks}` : null;
    } catch { return null; }
  }
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8", timeout: 3_000 });
  const value = String(result.stdout ?? "").trim();
  return result.status === 0 && value ? `${process.platform}:${value}` : null;
}

function jobProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export function signalJobProcessTree(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", timeout: 5_000, windowsHide: true });
    return result.status === 0;
  }
  try { process.kill(-pid, "SIGTERM"); return true; }
  catch {
    try { process.kill(pid, "SIGTERM"); return true; } catch { return false; }
  }
}function workerEnv(nonce: string): NodeJS.ProcessEnv {
  const allow = new Set(["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"]);
  const env: NodeJS.ProcessEnv = { NO_COLOR: "1", CODEXPRO_JOB_WORKER_NONCE: nonce };
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined && allow.has(key)) env[key] = value;
  return env;
}

function defaultSpawnWorker(entrypoint: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [entrypoint, ...args], { detached: true, stdio: "ignore", windowsHide: true, env });
}

export async function waitForProcessStartIdentity(
  pid: number,
  lookup: (pid: number) => string | null = processStartIdentity
): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const identity = lookup(pid);
    if (identity) return identity;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return null;
}

function runtimeForJob(config: CodexProConfig, record: JobRecord): CodexProConfig {
  return {
    ...config,
    defaultRoot: record.workspaceRoot,
    allowedRoots: [record.workspaceRoot],
    authToken: undefined,
    requireHttpToken: false,
    bashSessionId: undefined,
    requireBashSession: false,
    writeMode: "off",
    toolMode: "full",
    connectionTest: false,
    toolCards: false,
    allowGitPush: false,
    codeGraphEnabled: false,
    lspEnabled: false,
    artifactExportEnabled: false,
    codexSessions: "off",
    inheritEnv: false,
    executionBackend: "host"
  };
}export async function launchStructuredJob(
  config: CodexProConfig,
  store: JobStore,
  workspace: Pick<Workspace, "id" | "root">,
  id: string,
  deps: JobRunnerDeps = {}
): Promise<JobRecord> {
  const current = await store.requireForWorkspace(id, workspace);
  if (!["queued", "interrupted", "paused"].includes(current.state)) throw new Error(`Job cannot launch from state ${current.state}.`);
  const registration = producers.get(current.kind);
  if (!registration) throw new Error(`No structured producer is registered for job kind ${current.kind}.`);
  await store.readPayload(id);
  await store.saveRuntime(id, runtimeForJob(config, current));
  await store.clearOwner(id);
  await store.clearCancel(id);

  const nonce = randomBytes(32).toString("hex");
  const nonceHash = hashWorkerNonce(nonce);
  const spawnWorker = deps.spawnWorker ?? defaultSpawnWorker;
  const child = spawnWorker(registration.workerEntrypoint, ["--job-dir", store.baseDir, "--job-id", id], workerEnv(nonce));
  if (!child.pid) throw new Error("Structured job worker did not provide a pid.");
  child.unref();
  const lookup = deps.processStartIdentity ?? processStartIdentity;
  const startKey = await waitForProcessStartIdentity(child.pid, lookup);
  if (!startKey) {
    (deps.signalProcess ?? signalJobProcessTree)(child.pid);
    await store.update(id, (record) => { record.state = "interrupted"; record.error = "Job worker identity could not be established."; return record; });
    throw new Error("Structured job worker identity could not be established.");
  }
  const startedAt = new Date().toISOString();
  return store.update(id, (record) => {
    if (!["queued", "interrupted", "paused"].includes(record.state)) throw new Error(`Job launch raced with state ${record.state}.`);
    record.state = "running";
    record.error = undefined;
    record.worker = { pid: child.pid!, startedAt, nonceHash, startKey };
    record.progress = { ...record.progress, phase: record.progress.phase === "queued" ? "starting" : record.progress.phase, lastProgressAt: startedAt };
    return record;
  });
}function ownerMatchesWorker(record: JobRecord, owner: Awaited<ReturnType<JobStore["readOwner"]>>): boolean {
  if (!record.worker || !owner) return false;
  return owner.pid === record.worker.pid &&
    owner.nonceHash === record.worker.nonceHash &&
    owner.startKey === record.worker.startKey;
}

function workerMatches(record: JobRecord, owner: Awaited<ReturnType<JobStore["readOwner"]>>, currentStartKey: string | null): boolean {
  return ownerMatchesWorker(record, owner) && Boolean(currentStartKey) && currentStartKey === record.worker?.startKey;
}

export async function reconcileJob(store: JobStore, id: string, deps: JobRunnerDeps = {}): Promise<JobRecord> {
  let record = await store.require(id);
  const terminal = await store.readTerminal(id);
  if (terminal) {
    if (record.state !== terminal.state || record.worker) {
      record = await store.update(id, (current) => {
        current.state = terminal.state;
        current.worker = undefined;
        current.error = terminal.error;
        current.result = terminal.result;
        current.progress = { ...current.progress, phase: terminal.state, message: terminal.error, lastProgressAt: terminal.at };
        return current;
      });
      await store.clearOwner(id);
    }
    return record;
  }
  if (record.state !== "running") return record;
  if (!record.worker) {
    return store.update(id, (current) => { current.state = "interrupted"; current.error = "Running job has no worker identity."; return current; });
  }
  const lookup = deps.processStartIdentity ?? processStartIdentity;
  const currentStartKey = lookup(record.worker.pid);
  const owner = await store.readOwner(id).catch(() => null);
  const ageMs = Math.max(0, Date.now() - Date.parse(record.worker.startedAt));
  const alive = (deps.processAlive ?? jobProcessAlive)(record.worker.pid);
  if (workerMatches(record, owner, currentStartKey)) return record;
  if (alive && currentStartKey === null && ownerMatchesWorker(record, owner)) return record;
  if (alive && ageMs < STRUCTURED_JOB_ATTESTATION_GRACE_MS && (currentStartKey === null || currentStartKey === record.worker.startKey)) return record;
  return store.update(id, (current) => {
    if (current.state === "running") {
      current.state = "interrupted";
      current.error = "Job worker is no longer live with the recorded identity.";
      current.worker = undefined;
      current.progress = { ...current.progress, phase: "interrupted", message: current.error, lastProgressAt: new Date().toISOString() };
    }
    return current;
  });
}

export async function cancelJob(store: JobStore, id: string, deps: JobRunnerDeps = {}): Promise<JobRecord> {
  const before = await store.require(id);
  let record = await reconcileJob(store, id, deps);
  if (before.state === "running" && record.state === "interrupted") {
    throw new Error(record.error?.includes("identity") ? "Job worker identity mismatch; refusing to signal a possibly unrelated process." : "Job worker became interrupted before cancellation could be verified.");
  }
  if (["completed", "failed", "canceled"].includes(record.state)) return record;
  if (record.state !== "running" || !record.worker) {
    const at = new Date().toISOString();
    await store.saveTerminal(id, { schemaVersion: 1, state: "canceled", at });
    await store.clearOwner(id);
    await store.clearCancel(id);
    return store.update(id, (current) => { current.state = "canceled"; current.worker = undefined; current.error = undefined; current.progress = { ...current.progress, phase: "canceled", lastProgressAt: at }; return current; });
  }

  const owner = await store.readOwner(id).catch(() => null);
  const lookup = deps.processStartIdentity ?? processStartIdentity;
  const currentStartKey = lookup(record.worker.pid);
  if (!workerMatches(record, owner, currentStartKey)) {
    await store.update(id, (current) => { current.state = "interrupted"; current.worker = undefined; current.error = "Job worker identity mismatch; cancellation signal was refused."; return current; });
    throw new Error("Job worker identity mismatch; refusing to signal a possibly unrelated process.");
  }

  await store.requestCancel(id);
  const signaled = (deps.signalProcess ?? signalJobProcessTree)(record.worker.pid);
  if (!signaled) {
    await store.update(id, (current) => { current.state = "interrupted"; current.worker = undefined; current.error = "Job worker could not be signaled safely."; return current; });
    throw new Error("Job worker could not be signaled safely.");
  }
  const at = new Date().toISOString();
  await store.saveTerminal(id, { schemaVersion: 1, state: "canceled", at });
  await store.clearOwner(id);
  await store.clearCancel(id);
  return store.update(id, (current) => {
    current.state = "canceled";
    current.worker = undefined;
    current.error = undefined;
    current.progress = { ...current.progress, phase: "canceled", lastProgressAt: at };
    return current;
  });
}export async function resumeJob(
  config: CodexProConfig,
  store: JobStore,
  workspace: Pick<Workspace, "id" | "root">,
  id: string,
  deps: JobRunnerDeps = {}
): Promise<JobRecord> {
  let record = await store.requireForWorkspace(id, workspace);
  record = await reconcileJob(store, id, deps);
  if (!["interrupted", "paused"].includes(record.state)) throw new Error(`Job cannot resume from state ${record.state}.`);
  const registration = producers.get(record.kind);
  if (!registration) throw new Error(`No structured producer is registered for job kind ${record.kind}.`);
  if (!registration.resumable) throw new Error(`Job kind ${record.kind} does not support resume.`);
  await store.readPayload(id);
  await store.clearOwner(id);
  await store.clearCancel(id);
  await store.update(id, (current) => {
    current.state = "queued";
    current.worker = undefined;
    current.error = undefined;
    current.progress = { ...current.progress, phase: "resuming", lastProgressAt: new Date().toISOString() };
    return current;
  });
  return launchStructuredJob(config, store, workspace, id, deps);
}

export function boundedJobRunnerError(error: unknown): string {
  return boundedJobText(error instanceof Error ? error.message : String(error), "Job error", 480) ?? "Job error";
}