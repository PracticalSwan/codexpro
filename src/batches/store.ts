import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Workspace } from "../guard.js";
import { isBatchKind, type BatchKind, type BatchRecord, type BatchState } from "./types.js";

const MAX_RECORD_BYTES = 16 * 1024;
const DEFAULT_MAX_PRIVATE_BYTES = 4 * 1024 * 1024;

function assertId(id: string): void {
  if (!/^batch_[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid batch id.");
}

function normalizeRecord(value: unknown): BatchRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed batch record.");
  const record = value as Partial<BatchRecord>;
  if (record.schemaVersion !== 1 || typeof record.id !== "string" || typeof record.workspaceId !== "string" || typeof record.workspaceRoot !== "string") throw new Error("Malformed batch record.");
  if (!isBatchKind(record.kind) || !["active", "completed", "stale", "canceled"].includes(String(record.state))) throw new Error("Malformed batch record.");
  if (typeof record.requestFingerprint !== "string" || typeof record.sourceFingerprint !== "string" || !/^\w{32,128}$/.test(record.requestFingerprint) || !/^\w{32,128}$/.test(record.sourceFingerprint)) throw new Error("Malformed batch fingerprint.");
  if (!Number.isInteger(record.cursor) || Number(record.cursor) < 0 || !Number.isInteger(record.completedUnits) || Number(record.completedUnits) < 0) throw new Error("Malformed batch cursor.");
  if (typeof record.createdAt !== "string" || typeof record.updatedAt !== "string") throw new Error("Malformed batch timestamps.");
  return record as BatchRecord;
}
async function atomicJson(file: string, value: unknown, maxBytes: number): Promise<void> {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("Batch state exceeds its bounded storage limit.");
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(tmp, `${text}\n`, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(tmp, file);
}

export class BatchStore {
  constructor(public readonly baseDir: string, private readonly maxPrivateBytes = DEFAULT_MAX_PRIVATE_BYTES, private readonly maxRecords = 256) {}

  private dir(id: string): string { assertId(id); return path.join(this.baseDir, id); }
  private recordFile(id: string): string { return path.join(this.dir(id), "record.json"); }
  private privateFile(id: string): string { return path.join(this.dir(id), "state.json"); }

  private async prune(): Promise<void> {
    await fsp.mkdir(this.baseDir, { recursive: true });
    const entries = await fsp.readdir(this.baseDir, { withFileTypes: true });
    const records: BatchRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("batch_")) continue;
      try { records.push(await this.require(entry.name)); } catch {}
    }
    if (records.length < this.maxRecords) return;
    const removable = records.filter((record) => record.state !== "active").sort((a,b) => a.updatedAt.localeCompare(b.updatedAt));
    while (records.length >= this.maxRecords && removable.length) {
      const record = removable.shift(); if (!record) break;
      await fsp.rm(this.dir(record.id), { recursive: true, force: true, maxRetries: 3, retryDelay: 25 });
      records.splice(records.findIndex((item) => item.id === record.id), 1);
    }
    if (records.length >= this.maxRecords) throw new Error("Batch store is full of active continuation records.");
  }

  async create(input: { workspace: Pick<Workspace, "id" | "root">; kind: BatchKind; requestFingerprint: string; sourceFingerprint: string }): Promise<BatchRecord> {
    await this.prune();
    if (!isBatchKind(input.kind)) throw new Error(`Unsupported batch kind: ${String(input.kind)}`);
    const now = new Date().toISOString();
    const record: BatchRecord = { schemaVersion: 1, id: `batch_${randomUUID()}`, workspaceId: input.workspace.id, workspaceRoot: path.resolve(input.workspace.root), kind: input.kind, requestFingerprint: input.requestFingerprint, sourceFingerprint: input.sourceFingerprint, cursor: 0, completedUnits: 0, state: "active", createdAt: now, updatedAt: now };
    await atomicJson(this.recordFile(record.id), record, MAX_RECORD_BYTES);
    return record;
  }
  async require(id: string): Promise<BatchRecord> {
    assertId(id);
    const text = await fsp.readFile(this.recordFile(id), "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) throw new Error("Batch record exceeds its bounded storage limit.");
    return normalizeRecord(JSON.parse(text));
  }

  async requireForWorkspace(id: string, workspace: Pick<Workspace, "id" | "root">): Promise<BatchRecord> {
    const record = await this.require(id);
    if (record.workspaceId !== workspace.id || path.resolve(record.workspaceRoot) !== path.resolve(workspace.root)) throw new Error("Batch does not belong to the selected workspace.");
    return record;
  }

  async list(workspaceId?: string): Promise<BatchRecord[]> {
    const entries = await fsp.readdir(this.baseDir, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
    const records: BatchRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("batch_")) continue;
      try {
        const record = await this.require(entry.name);
        if (!workspaceId || record.workspaceId === workspaceId) records.push(record);
      } catch {}
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.maxRecords);
  }

  async update(id: string, mutate: (record: BatchRecord) => BatchRecord | void): Promise<BatchRecord> {
    const record = await this.require(id);
    const next = mutate({ ...record }) ?? record;
    next.updatedAt = new Date().toISOString();
    const normalized = normalizeRecord(next);
    await atomicJson(this.recordFile(id), normalized, MAX_RECORD_BYTES);
    return normalized;
  }

  async savePrivate(id: string, value: unknown): Promise<void> {
    await this.require(id);
    await atomicJson(this.privateFile(id), value, this.maxPrivateBytes);
  }

  async readPrivate<T = Record<string, unknown>>(id: string): Promise<T> {
    await this.require(id);
    const text = await fsp.readFile(this.privateFile(id), "utf8");
    if (Buffer.byteLength(text, "utf8") > this.maxPrivateBytes) throw new Error("Batch private state exceeds its bounded storage limit.");
    return JSON.parse(text) as T;
  }
  async complete(id: string): Promise<BatchRecord> { return this.markState(id, "completed"); }

  async markState(id: string, state: BatchState): Promise<BatchRecord> {
    return this.update(id, (record) => {
      record.state = state;
      return record;
    });
  }

  async validateContinuation(id: string, workspace: Pick<Workspace, "id" | "root">, requestFingerprint: string, sourceFingerprint: string): Promise<BatchRecord> {
    const record = await this.requireForWorkspace(id, workspace);
    if (record.requestFingerprint !== requestFingerprint || record.sourceFingerprint !== sourceFingerprint) {
      if (record.state === "active") await this.markState(id, "stale");
      throw new Error("Batch continuation is stale because the request or workspace source fingerprint changed. Start a fresh batch.");
    }
    if (record.state === "stale") throw new Error("Batch continuation is stale. Start a fresh batch.");
    if (record.state === "canceled") throw new Error("Batch continuation was canceled.");
    return record;
  }
}
