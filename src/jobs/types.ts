import { createHash } from "node:crypto";
import path from "node:path";
import { redactSensitiveText } from "../redact.js";

export type JobState = "queued" | "running" | "paused" | "completed" | "failed" | "canceled" | "interrupted";
export type JobKind = "verification";

export interface JobProgress {
  phase: string;
  completed: number;
  total?: number;
  message?: string;
  lastProgressAt: string;
}

export interface JobWorkerIdentity {
  pid: number;
  startedAt: string;
  nonceHash: string;
  startKey: string;
}

export interface JobRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  kind: JobKind;
  state: JobState;
  createdAt: string;
  updatedAt: string;  progress: JobProgress;
  worker?: JobWorkerIdentity;
  result?: Record<string, unknown>;
  error?: string;
}

export interface JobOwnerAttestation {
  pid: number;
  startedAt: string;
  nonceHash: string;
  startKey: string;
  attestedAt: string;
}

export interface JobTerminalResult {
  schemaVersion: 1;
  state: "completed" | "failed" | "canceled";
  at: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface JobCreateInput {
  workspace: { id: string; root: string };
  kind: JobKind;
  progress?: { phase?: string; completed?: number; total?: number; message?: string };
}

const JOB_STATES = new Set<JobState>(["queued", "running", "paused", "completed", "failed", "canceled", "interrupted"]);

export function safeJobId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^job_[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid job id.");
  return id;
}function isoTime(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp.`);
  return text;
}

export function boundedJobText(value: unknown, label: string, max = 480, optional = false): string | undefined {
  const text = redactSensitiveText(String(value ?? "")).replace(/[\r\n\0]+/g, " ").trim();
  if (!text && optional) return undefined;
  if (!text || text.length > max) throw new Error(`${label} must be 1-${max} characters.`);
  return text;
}

export function hashWorkerNonce(value: string): string {
  if (!/^[a-f0-9]{32,256}$/i.test(value)) throw new Error("Invalid job worker nonce.");
  return createHash("sha256").update(value).digest("hex");
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limited]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return redactSensitiveText(value).slice(0, 8_000);
  if (Array.isArray(value)) return value.slice(0, 128).map((item) => sanitizeJsonValue(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value).slice(0, 128)) {
      const safeKey = key.replace(/[\r\n\0]+/g, " ").slice(0, 128);
      if (safeKey) out[safeKey] = sanitizeJsonValue(child, depth + 1);
    }
    return out;
  }
  return String(value ?? "").slice(0, 256);
}export function sanitizeJobResult(value: unknown): Record<string, unknown> {
  const sanitized = sanitizeJsonValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : { value: sanitized };
}

export function normalizeJobProgress(input: unknown, now = new Date().toISOString()): JobProgress {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const phase = boundedJobText(value.phase ?? "queued", "Job progress phase", 120)!;
  const completed = Number(value.completed ?? 0);
  const total = value.total === undefined ? undefined : Number(value.total);
  if (!Number.isInteger(completed) || completed < 0) throw new Error("Job progress completed must be a non-negative integer.");
  if (total !== undefined && (!Number.isInteger(total) || total < 0 || completed > total)) throw new Error("Job progress total must be an integer >= completed.");
  const message = boundedJobText(value.message, "Job progress message", 480, true);
  return { phase, completed, ...(total === undefined ? {} : { total }), ...(message ? { message } : {}), lastProgressAt: now };
}

function normalizeWorker(value: unknown): JobWorkerIdentity | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Job worker metadata is malformed.");
  const worker = value as Record<string, unknown>;
  const pid = Number(worker.pid);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Job worker pid is invalid.");
  const nonceHash = String(worker.nonceHash ?? "");
  if (!/^[a-f0-9]{64}$/i.test(nonceHash)) throw new Error("Job worker nonce hash is invalid.");
  const startKey = boundedJobText(worker.startKey, "Job worker start key", 256)!;
  return { pid, startedAt: isoTime(worker.startedAt, "Job worker startedAt"), nonceHash: nonceHash.toLowerCase(), startKey };
}export function validateJobRecord(value: unknown): JobRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Job record is malformed.");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) throw new Error("Unsupported job record schema version.");
  const id = safeJobId(input.id);
  const workspaceId = boundedJobText(input.workspaceId, "Job workspace id", 160)!;
  const workspaceRoot = path.resolve(String(input.workspaceRoot ?? ""));
  if (!path.isAbsolute(workspaceRoot)) throw new Error("Job workspace root must be absolute.");
  if (input.kind !== "verification") throw new Error("Unsupported job kind.");
  if (!JOB_STATES.has(input.state as JobState)) throw new Error("Unsupported job state.");
  const createdAt = isoTime(input.createdAt, "Job createdAt");
  const updatedAt = isoTime(input.updatedAt, "Job updatedAt");
  const progress = normalizeJobProgress(input.progress, (input.progress as any)?.lastProgressAt ?? updatedAt);
  progress.lastProgressAt = isoTime((input.progress as any)?.lastProgressAt ?? updatedAt, "Job progress lastProgressAt");
  const worker = normalizeWorker(input.worker);
  const result = input.result === undefined ? undefined : sanitizeJobResult(input.result);
  const error = boundedJobText(input.error, "Job error", 480, true);
  return { schemaVersion: 1, id, workspaceId, workspaceRoot, kind: "verification", state: input.state as JobState, createdAt, updatedAt, progress, ...(worker ? { worker } : {}), ...(result ? { result } : {}), ...(error ? { error } : {}) };
}

export function publicJobRecord(record: JobRecord): Record<string, unknown> {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    kind: record.kind,
    state: record.state,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    progress: structuredClone(record.progress),
    ...(record.worker ? { worker: { active: record.state === "running", startedAt: record.worker.startedAt } } : {}),
    ...(record.result ? { result: sanitizeJobResult(record.result) } : {}),
    ...(record.error ? { error: redactSensitiveText(record.error).slice(0, 480) } : {})
  };
}