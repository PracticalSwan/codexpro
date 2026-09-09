import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Workspace } from "../guard.js";
import {
  TERMINAL_CONTINUATION_STATES,
  assertContinuationTransition,
  validateContinuationRecord,
  type ContinuationRecord
} from "./types.js";

const MAX_RECORD_BYTES = 128 * 1024;

function safeId(id: string): string {
  if (!/^continuation_[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid continuation id.");
  return id;
}

function samePath(a: string, b: string): boolean {
  const left = path.resolve(a); const right = path.resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export interface ContinuationBinding {
  workspace: Pick<Workspace, "id" | "root">;
  sessionId?: string;
}

export class ContinuationStore {
  constructor(public readonly baseDir: string, private readonly maxRecords = 128) {}

  private recordsDir(): string { return path.join(this.baseDir, "records"); }
  private locksDir(): string { return path.join(this.baseDir, "locks"); }
  private recordFile(id: string): string { return path.join(this.recordsDir(), `${safeId(id)}.json`); }
  private lockDir(id: string): string { return path.join(this.locksDir(), `${safeId(id)}.lock`); }
  private namedLockDir(name: string): string { if (!/^[A-Za-z0-9_-]{1,96}$/.test(name)) throw new Error("Invalid continuation lock name."); return path.join(this.locksDir(), `${name}.lock`); }
  private bindingLockName(binding: ContinuationBinding): string { const resolved = path.resolve(binding.workspace.root); const root = process.platform === "win32" ? resolved.toLowerCase() : resolved; const key = `${binding.workspace.id}\0${root}\0${binding.sessionId?.trim() || ""}`; return `binding_${createHash("sha256").update(key).digest("hex").slice(0, 40)}`; }

  private async ensureDirs(): Promise<void> {
    await Promise.all([
      fsp.mkdir(this.recordsDir(), { recursive: true, mode: 0o700 }),
      fsp.mkdir(this.locksDir(), { recursive: true, mode: 0o700 })
    ]);
  }

  private async atomicWrite(record: ContinuationRecord): Promise<void> {
    const validated = validateContinuationRecord(record);
    const text = `${JSON.stringify(validated)}\n`;
    if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) throw new Error("Continuation record exceeds bounded storage limit.");
    await this.ensureDirs();
    const file = this.recordFile(validated.id);
    const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    await fsp.writeFile(temp, text, { encoding: "utf8", mode: 0o600 });
    try { await fsp.rename(temp, file); }
    catch (error) { await fsp.rm(temp, { force: true }).catch(() => undefined); throw error; }
  }

  async require(id: string): Promise<ContinuationRecord> {
    const file = this.recordFile(id);
    let text: string;
    try { text = await fsp.readFile(file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`Unknown continuation id: ${safeId(id)}`);
      throw error;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) throw new Error("Continuation record exceeds bounded storage limit.");
    try { return validateContinuationRecord(JSON.parse(text)); }
    catch (error) { throw new Error(`Malformed continuation record ${safeId(id)}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async requireForBinding(id: string, binding: ContinuationBinding): Promise<ContinuationRecord> {
    const record = await this.require(id);
    this.assertBinding(record, binding);
    return record;
  }

  private assertBinding(record: ContinuationRecord, binding: ContinuationBinding): void {
    if (record.workspaceId !== binding.workspace.id || !samePath(record.workspaceRoot, binding.workspace.root)) {
      throw new Error("Continuation does not belong to the selected workspace.");
    }
    const expectedSession = binding.sessionId?.trim() || undefined;
    if (record.mcpSessionId !== expectedSession) throw new Error("Continuation does not belong to the selected MCP session.");
  }

  async list(filter: { workspaceId?: string; sessionId?: string } = {}): Promise<ContinuationRecord[]> {
    await this.ensureDirs();
    const names = await fsp.readdir(this.recordsDir()).catch(() => [] as string[]);
    const records: ContinuationRecord[] = [];
    for (const name of names.filter((entry) => entry.endsWith(".json")).slice(0, this.maxRecords * 4)) {
      try {
        const record = await this.require(name.slice(0, -5));
        if (filter.workspaceId && record.workspaceId !== filter.workspaceId) continue;
        if (filter.sessionId !== undefined && record.mcpSessionId !== (filter.sessionId || undefined)) continue;
        records.push(record);
      } catch {}
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.maxRecords);
  }

  async createActive(input: ContinuationBinding & { title: string; id?: string }): Promise<ContinuationRecord> {
    return this.withNamedLock(this.bindingLockName(input), async () => {
      const sessionId = input.sessionId?.trim() || undefined;
      const active = (await this.list({ workspaceId: input.workspace.id })).filter((record) => record.mcpSessionId === sessionId && !TERMINAL_CONTINUATION_STATES.has(record.state));
      if (active.length) throw new Error(`continuation_active_exists: ${active[0].id}`);
      return this.create(input);
    });
  }

  async create(input: ContinuationBinding & { title: string; id?: string }): Promise<ContinuationRecord> {
    await this.prune();
    const id = input.id ? safeId(input.id) : `continuation_${randomUUID()}`;
    return this.withNamedLock(safeId(id), async () => {
      try { await fsp.access(this.recordFile(id)); throw new Error(`Continuation id already exists: ${id}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const now = new Date().toISOString();
      const record = validateContinuationRecord({
        schemaVersion: 1, id, workspaceId: input.workspace.id, workspaceRoot: path.resolve(input.workspace.root),
        ...(input.sessionId?.trim() ? { mcpSessionId: input.sessionId.trim() } : {}), revision: 1, state: "armed",
        title: input.title, completedEvidence: [], remainingWork: [], continuationIntents: [], continuationCount: 0,
        createdAt: now, updatedAt: now
      });
      await this.atomicWrite(record);
      return record;
    });
  }

  async update(
    id: string,
    binding: ContinuationBinding,
    options: { expectedRevision?: number } = {},
    mutate: (record: ContinuationRecord) => ContinuationRecord | void
  ): Promise<ContinuationRecord> {
    return this.withLock(id, async () => {
      const current = await this.requireForBinding(id, binding);
      if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) {
        throw new Error(`stale_continuation_revision: expected ${options.expectedRevision}, current ${current.revision}`);
      }
      if (TERMINAL_CONTINUATION_STATES.has(current.state)) throw new Error(`Continuation is terminal: ${current.state}.`);
      const draft = structuredClone(current);
      const candidate = mutate(draft) ?? draft;
      assertContinuationTransition(current.state, candidate.state);
      candidate.revision = current.revision + 1;
      candidate.updatedAt = new Date().toISOString();
      const validated = validateContinuationRecord(candidate);
      await this.atomicWrite(validated);
      return validated;
    });
  }

  async touchHeartbeat(id: string, binding: ContinuationBinding, options: { expectedRevision?: number; at?: string } = {}): Promise<ContinuationRecord> {
    return this.withLock(id, async () => {
      const current = await this.requireForBinding(id, binding);
      if (options.expectedRevision !== undefined && current.revision !== options.expectedRevision) {
        throw new Error(`stale_continuation_revision: expected ${options.expectedRevision}, current ${current.revision}`);
      }
      if (TERMINAL_CONTINUATION_STATES.has(current.state)) return current;
      const draft = structuredClone(current);
      draft.lastHeartbeatAt = options.at ?? new Date().toISOString();
      const validated = validateContinuationRecord(draft);
      await this.atomicWrite(validated);
      return validated;
    });
  }

  async reassociateSession(id: string, workspace: Pick<Workspace, "id" | "root">, sessionId: string): Promise<ContinuationRecord> {
    const targetSession = sessionId.trim();
    if (!targetSession || targetSession.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(targetSession)) throw new Error("Invalid continuation MCP session id.");
    const targetBinding: ContinuationBinding = { workspace, sessionId: targetSession };
    return this.withNamedLock(this.bindingLockName(targetBinding), async () => {
      const existing = (await this.list({ workspaceId: workspace.id, sessionId: targetSession }))
        .find((record) => record.id !== id && !TERMINAL_CONTINUATION_STATES.has(record.state));
      if (existing) throw new Error(`continuation_active_exists: ${existing.id}`);
      return this.withLock(id, async () => {
        const current = await this.require(id);
        if (current.workspaceId !== workspace.id || !samePath(current.workspaceRoot, workspace.root)) {
          throw new Error("Continuation does not belong to the selected workspace.");
        }
        if (TERMINAL_CONTINUATION_STATES.has(current.state)) throw new Error(`Continuation is terminal: ${current.state}.`);
        if (current.mcpSessionId === targetSession) return current;
        const draft = structuredClone(current);
        draft.mcpSessionId = targetSession;
        draft.revision = current.revision + 1;
        draft.updatedAt = new Date().toISOString();
        const validated = validateContinuationRecord(draft);
        await this.atomicWrite(validated);
        return validated;
      });
    });
  }

  private async withLock<T>(id: string, task: () => Promise<T>): Promise<T> { return this.withNamedLock(safeId(id), task); }

  private async withNamedLock<T>(name: string, task: () => Promise<T>): Promise<T> {
    await this.ensureDirs();
    const lock = this.namedLockDir(name);
    const deadline = Date.now() + 10_000;
    while (true) {
      try {
        await fsp.mkdir(lock, { mode: 0o700 });
        await fsp.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, createdAt: Date.now() }), { mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let ownerPid = 0;
        try { ownerPid = Number(JSON.parse(await fsp.readFile(path.join(lock, "owner.json"), "utf8")).pid); } catch {}
        if (ownerPid && !pidAlive(ownerPid)) { await fsp.rm(lock, { recursive: true, force: true }).catch(() => undefined); continue; }
        if (!ownerPid) { try { const stat = await fsp.stat(lock); if (Date.now() - stat.mtimeMs > 2_000) { await fsp.rm(lock, { recursive: true, force: true }).catch(() => undefined); continue; } } catch {} }
        if (Date.now() >= deadline) throw new Error(`Continuation state lock is busy: ${name}`);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try { return await task(); }
    finally { await fsp.rm(lock, { recursive: true, force: true, maxRetries: 3, retryDelay: 25 }).catch(() => undefined); }
  }

  private async prune(): Promise<void> {
    await this.ensureDirs();
    const records = await this.list();
    if (records.length < this.maxRecords) return;
    const removable = records.filter((record) => TERMINAL_CONTINUATION_STATES.has(record.state)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    let count = records.length;
    while (count >= this.maxRecords && removable.length) {
      const record = removable.shift(); if (!record) break;
      await fsp.rm(this.recordFile(record.id), { force: true }).catch(() => undefined);
      await fsp.rm(this.lockDir(record.id), { recursive: true, force: true }).catch(() => undefined);
      count -= 1;
    }
    if (count >= this.maxRecords) throw new Error("Continuation store is full of active records.");
  }
}
