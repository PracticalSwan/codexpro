import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import type { Workspace } from "../guard.js";
import { redactSensitiveText } from "../redact.js";
import {
  boundedJobText,
  normalizeJobProgress,
  publicJobRecord,
  safeJobId,
  sanitizeJobResult,
  validateJobRecord,
  type JobCreateInput,
  type JobOwnerAttestation,
  type JobRecord,
  type JobTerminalResult
} from "./types.js";

const MAX_JOB_RECORD_BYTES = 256 * 1024;
const MAX_JOB_PAYLOAD_BYTES = 128 * 1024;
const TERMINAL_STATES = new Set(["completed", "failed", "canceled"]);

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a);
  const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}async function delay(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

export interface JobStoreOptions {
  baseDir: string;
  maxJobs?: number;
  maxOutputBytes?: number;
  maxReadBytes?: number;
}

export class JobStore {
  readonly baseDir: string;
  readonly maxJobs: number;
  readonly maxOutputBytes: number;
  readonly maxReadBytes: number;

  constructor(options: JobStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
    this.maxJobs = Math.max(1, Math.min(1024, Math.floor(options.maxJobs ?? 128)));
    this.maxOutputBytes = Math.max(4_096, Math.min(50_000_000, Math.floor(options.maxOutputBytes ?? 1_000_000)));
    this.maxReadBytes = Math.max(1_024, Math.min(this.maxOutputBytes, Math.floor(options.maxReadBytes ?? 64_000)));
  }

  private dir(name: string): string { return path.join(this.baseDir, name); }
  private recordPath(id: string): string { return path.join(this.dir("records"), `${safeJobId(id)}.json`); }
  private outputPath(id: string): string { return path.join(this.dir("output"), `${safeJobId(id)}.log`); }
  private runtimePath(id: string): string { return path.join(this.dir("runtime"), `${safeJobId(id)}.json`); }
  private ownerPath(id: string): string { return path.join(this.dir("owners"), `${safeJobId(id)}.json`); }
  private resultPath(id: string): string { return path.join(this.dir("results"), `${safeJobId(id)}.json`); }
  private payloadPath(id: string): string { return path.join(this.dir("payload"), `${safeJobId(id)}.json`); }
  private cancelPath(id: string): string { return path.join(this.dir("control"), `${safeJobId(id)}.cancel`); }
  private lockDir(id: string): string { return path.join(this.dir("locks"), `${safeJobId(id)}.edit.lock`); }  private async ensureDirs(): Promise<void> {
    await Promise.all(["records", "output", "runtime", "owners", "results", "payload", "control", "locks"].map((name) =>
      fsp.mkdir(this.dir(name), { recursive: true, mode: 0o700 })
    ));
  }

  private async writeAtomic(filePath: string, value: unknown, maxBytes = MAX_JOB_RECORD_BYTES): Promise<void> {
    await this.ensureDirs();
    const json = `${JSON.stringify(value)}\n`;
    if (Buffer.byteLength(json, "utf8") > maxBytes) throw new Error("Job state exceeded bounded storage limit.");
    const temp = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, json, { encoding: "utf8", mode: 0o600 });
    try { await fsp.rename(temp, filePath); }
    catch (error) { await fsp.rm(temp, { force: true }).catch(() => undefined); throw error; }
  }

  async create(input: JobCreateInput): Promise<JobRecord> {
    const now = new Date().toISOString();
    const record: JobRecord = {
      schemaVersion: 1,
      id: `job_${randomUUID()}`,
      workspaceId: boundedJobText(input.workspace.id, "Job workspace id", 160)!,
      workspaceRoot: path.resolve(input.workspace.root),
      kind: input.kind,
      state: "queued",
      createdAt: now,
      updatedAt: now,
      progress: normalizeJobProgress(input.progress ?? {}, now)
    };
    await this.save(record);
    return record;
  }  async save(record: JobRecord): Promise<JobRecord> {
    const validated = validateJobRecord(record);
    await this.writeAtomic(this.recordPath(validated.id), validated);
    await this.prune();
    return validated;
  }

  async get(id: string): Promise<JobRecord | null> {
    const filePath = this.recordPath(id);
    try {
      const text = await fsp.readFile(filePath, "utf8");
      return validateJobRecord(JSON.parse(text));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`Malformed job record ${safeJobId(id)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async require(id: string): Promise<JobRecord> {
    const record = await this.get(id);
    if (!record) throw new Error(`Unknown job id: ${safeJobId(id)}`);
    return record;
  }

  async requireForWorkspace(id: string, workspace: Pick<Workspace, "id" | "root">): Promise<JobRecord> {
    const record = await this.require(id);
    if (record.workspaceId !== workspace.id || !samePath(record.workspaceRoot, workspace.root)) {
      throw new Error("Job does not belong to this workspace.");
    }
    return record;
  }

  async list(workspaceId?: string): Promise<JobRecord[]> {
    await this.ensureDirs();
    const names = await fsp.readdir(this.dir("records")).catch(() => [] as string[]);
    const records: JobRecord[] = [];
    for (const name of names.filter((item) => item.endsWith(".json")).slice(0, this.maxJobs * 4)) {
      try {
        const record = validateJobRecord(JSON.parse(await fsp.readFile(path.join(this.dir("records"), name), "utf8")));
        if (!workspaceId || record.workspaceId === workspaceId) records.push(record);
      } catch {}
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.maxJobs);
  }  async update(id: string, mutate: (record: JobRecord) => JobRecord | Promise<JobRecord>): Promise<JobRecord> {
    return this.withLock(id, async () => {
      const current = await this.require(id);
      const next = await mutate(structuredClone(current));
      next.updatedAt = new Date().toISOString();
      return this.save(next);
    });
  }

  private async withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    await this.ensureDirs();
    const lockDir = this.lockDir(id);
    const deadline = Date.now() + 10_000;
    while (true) {
      try {
        await fsp.mkdir(lockDir, { mode: 0o700 });
        await fsp.writeFile(path.join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let ownerPid = 0;
        try { ownerPid = Number(JSON.parse(await fsp.readFile(path.join(lockDir, "owner.json"), "utf8")).pid); } catch {}
        if (ownerPid && !pidAlive(ownerPid)) { await fsp.rm(lockDir, { recursive: true, force: true }).catch(() => undefined); continue; }
        if (Date.now() >= deadline) throw new Error(`Job record lock is busy: ${safeJobId(id)}`);
        await delay(25);
      }
    }
    try { return await task(); }
    finally { await fsp.rm(lockDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }).catch(() => undefined); }
  }

  async saveRuntime(id: string, config: CodexProConfig): Promise<void> {
    const safe: CodexProConfig = { ...config, authToken: undefined, requireHttpToken: false, bashSessionId: undefined, requireBashSession: false, toolCards: false, connectionTest: false, allowGitPush: false, codeGraphEnabled: false, lspEnabled: false, artifactExportEnabled: false, codexSessions: "off", inheritEnv: false };
    await this.writeAtomic(this.runtimePath(id), safe);
  }

  async readRuntime(id: string): Promise<CodexProConfig> {
    return JSON.parse(await fsp.readFile(this.runtimePath(id), "utf8")) as CodexProConfig;
  }  async savePayload(id: string, payload: Record<string, unknown>): Promise<void> {
    await this.writeAtomic(this.payloadPath(id), sanitizeJobResult(payload), MAX_JOB_PAYLOAD_BYTES);
  }

  async readPayload(id: string): Promise<Record<string, unknown>> {
    const value = JSON.parse(await fsp.readFile(this.payloadPath(id), "utf8"));
    return sanitizeJobResult(value);
  }

  async saveOwner(id: string, owner: JobOwnerAttestation): Promise<void> {
    const safe: JobOwnerAttestation = {
      pid: Number(owner.pid),
      startedAt: String(owner.startedAt),
      nonceHash: String(owner.nonceHash).toLowerCase(),
      startKey: boundedJobText(owner.startKey, "Job owner start key", 256)!,
      attestedAt: String(owner.attestedAt)
    };
    if (!Number.isInteger(safe.pid) || safe.pid <= 0 || !/^[a-f0-9]{64}$/.test(safe.nonceHash)) throw new Error("Invalid job owner attestation.");
    await this.writeAtomic(this.ownerPath(id), safe, 16_384);
  }

  async readOwner(id: string): Promise<JobOwnerAttestation | null> {
    try {
      const value = JSON.parse(await fsp.readFile(this.ownerPath(id), "utf8")) as JobOwnerAttestation;
      if (!Number.isInteger(value.pid) || value.pid <= 0 || !/^[a-f0-9]{64}$/i.test(String(value.nonceHash))) throw new Error("Malformed job owner attestation.");
      return { ...value, nonceHash: String(value.nonceHash).toLowerCase() };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async clearOwner(id: string): Promise<void> { await fsp.rm(this.ownerPath(id), { force: true }).catch(() => undefined); }

  async saveTerminal(id: string, terminal: JobTerminalResult): Promise<void> {
    const safe: JobTerminalResult = { schemaVersion: 1, state: terminal.state, at: String(terminal.at), ...(terminal.result ? { result: sanitizeJobResult(terminal.result) } : {}), ...(terminal.error ? { error: boundedJobText(terminal.error, "Job terminal error", 480)! } : {}) };
    await this.writeAtomic(this.resultPath(id), safe, MAX_JOB_PAYLOAD_BYTES);
  }  async readTerminal(id: string): Promise<JobTerminalResult | null> {
    try {
      const value = JSON.parse(await fsp.readFile(this.resultPath(id), "utf8")) as JobTerminalResult;
      if (value.schemaVersion !== 1 || !["completed", "failed", "canceled"].includes(value.state)) throw new Error("Malformed job terminal result.");
      return { schemaVersion: 1, state: value.state, at: String(value.at), ...(value.result ? { result: sanitizeJobResult(value.result) } : {}), ...(value.error ? { error: boundedJobText(value.error, "Job terminal error", 480)! } : {}) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async requestCancel(id: string): Promise<void> {
    await this.ensureDirs();
    await fsp.writeFile(this.cancelPath(id), `${new Date().toISOString()}\n`, { encoding: "utf8", mode: 0o600 });
  }

  async cancelRequested(id: string): Promise<boolean> {
    try { await fsp.access(this.cancelPath(id), fs.constants.F_OK); return true; }
    catch { return false; }
  }

  async clearCancel(id: string): Promise<void> { await fsp.rm(this.cancelPath(id), { force: true }).catch(() => undefined); }

  async appendOutput(id: string, value: unknown): Promise<{ appendedBytes: number; totalBytes: number; truncated: boolean }> {
    await this.ensureDirs();
    const filePath = this.outputPath(id);
    const current = await fsp.stat(filePath).then((stat) => stat.size).catch(() => 0);
    if (current >= this.maxOutputBytes) return { appendedBytes: 0, totalBytes: current, truncated: true };
    const sanitized = redactSensitiveText(String(value ?? "")).replace(/\0/g, "");
    const remaining = this.maxOutputBytes - current;
    const text = utf8Prefix(sanitized, remaining);
    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > 0) await fsp.appendFile(filePath, text, { encoding: "utf8", mode: 0o600 });
    const total = current + bytes;
    return { appendedBytes: bytes, totalBytes: total, truncated: bytes < Buffer.byteLength(sanitized, "utf8") || total >= this.maxOutputBytes };
  }  async readOutput(id: string, cursor = 0, maxBytes = this.maxReadBytes): Promise<{ text: string; cursor: number; nextCursor: number; eof: boolean; truncated: boolean }> {
    safeJobId(id);
    if (!Number.isInteger(cursor) || cursor < 0) throw new Error("Job output cursor is out of range.");
    const filePath = this.outputPath(id);
    const handle = await fsp.open(filePath, "r").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (!handle) return { text: "", cursor, nextCursor: cursor, eof: true, truncated: false };
    try {
      const stat = await handle.stat();
      if (cursor > stat.size) throw new Error("Job output cursor is out of range.");
      if (cursor < stat.size) {
        const marker = Buffer.alloc(1);
        await handle.read(marker, 0, 1, cursor);
        if ((marker[0] & 0xc0) === 0x80) throw new Error("Job output cursor is not on a UTF-8 boundary.");
      }
      const limit = Math.max(1, Math.min(this.maxReadBytes, Math.floor(maxBytes)));
      const wanted = Math.min(limit, stat.size - cursor);
      const buffer = Buffer.alloc(wanted);
      if (wanted > 0) await handle.read(buffer, 0, wanted, cursor);
      let end = buffer.length;
      while (end > 0 && !isUtf8Slice(buffer, 0, end)) end -= 1;
      const text = buffer.subarray(0, end).toString("utf8");
      const nextCursor = cursor + end;
      return { text, cursor, nextCursor, eof: nextCursor >= stat.size, truncated: stat.size >= this.maxOutputBytes };
    } finally { await handle.close(); }
  }

  private async prune(): Promise<void> {
    const names = await fsp.readdir(this.dir("records")).catch(() => [] as string[]);
    const records: JobRecord[] = [];
    for (const name of names.filter((item) => item.endsWith(".json"))) {
      try { records.push(validateJobRecord(JSON.parse(await fsp.readFile(path.join(this.dir("records"), name), "utf8")))); } catch {}
    }
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let retained = 0;
    for (const record of records) {
      const protectedState = !TERMINAL_STATES.has(record.state);
      if (protectedState || retained < this.maxJobs) { retained += 1; continue; }
      await Promise.all([this.recordPath(record.id), this.outputPath(record.id), this.runtimePath(record.id), this.ownerPath(record.id), this.resultPath(record.id), this.payloadPath(record.id), this.cancelPath(record.id)]
        .map((filePath) => fsp.rm(filePath, { force: true }).catch(() => undefined)));
    }
  }
}

export { publicJobRecord };
function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let used = 0;
  let out = "";
  for (const char of value) {
    const bytes = Buffer.byteLength(char, "utf8");
    if (used + bytes > maxBytes) break;
    out += char;
    used += bytes;
  }
  return out;
}

function isUtf8Slice(buffer: Buffer, start: number, end: number): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(start, end));
    return true;
  } catch { return false; }
}

function isUtf8Boundary(buffer: Buffer, cursor: number): boolean {
  if (cursor === 0 || cursor === buffer.length) return true;
  return isUtf8Slice(buffer, 0, cursor);
}