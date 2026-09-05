import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { redactSensitiveText } from "../redact.js";
import type { OperationReceipt, OperationSummary } from "./types.js";

export interface OperationStoreOptions {
  baseDir?: string;
  maxReceipts?: number;
}

const DEFAULT_RECEIPTS = 256;
const MAX_RECEIPT_BYTES = 16_384;

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function safeText(value: unknown, max = 240): string {
  const raw = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  if (/(?:api[_-]?key|token|secret|password|authorization)\s*[:=]/i.test(raw)) return "[redacted detail]";
  return redactSensitiveText(raw).slice(0, max);
}

function safePaths(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  return values.slice(0, 64).map((value) => {
    const text = safeText(value, 512);
    if (path.isAbsolute(text) || path.win32.isAbsolute(text)) return "[absolute path omitted]";
    return text;
  });
}
function safeHashes(values: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!values) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values).slice(0, 64)) {
    const safeKey = safeText(key, 512);
    if (path.isAbsolute(safeKey) || path.win32.isAbsolute(safeKey)) continue;
    if (/^[a-f0-9]{64}$/i.test(value)) out[safeKey] = value.toLowerCase();
  }
  return Object.keys(out).length ? out : undefined;
}

export function sanitizeOperationSummary(summary: OperationSummary | undefined): OperationSummary | undefined {
  if (!summary) return undefined;
  return {
    ...(safePaths(summary.paths) ? { paths: safePaths(summary.paths) } : {}),
    ...(Number.isFinite(summary.bytes) ? { bytes: Math.max(0, Math.floor(summary.bytes!)) } : {}),
    ...(Number.isFinite(summary.items) ? { items: Math.max(0, Math.floor(summary.items!)) } : {}),
    ...(Number.isFinite(summary.additions) ? { additions: Math.max(0, Math.floor(summary.additions!)) } : {}),
    ...(Number.isFinite(summary.deletions) ? { deletions: Math.max(0, Math.floor(summary.deletions!)) } : {}),
    ...(Number.isFinite(summary.durationMs) ? { durationMs: Math.max(0, Math.floor(summary.durationMs!)) } : {}),
    ...(summary.exitCode === null || Number.isInteger(summary.exitCode) ? { exitCode: summary.exitCode } : {}),
    ...(safeHashes(summary.beforeHashes) ? { beforeHashes: safeHashes(summary.beforeHashes) } : {}),
    ...(safeHashes(summary.afterHashes) ? { afterHashes: safeHashes(summary.afterHashes) } : {}),
    ...(summary.note ? { note: safeText(summary.note) } : {}),
    ...(summary.reason ? { reason: safeText(summary.reason, 120) } : {})
  };
}

function sanitizeReceipt(receipt: OperationReceipt): OperationReceipt {
  return {
    schemaVersion: 1,
    id: safeSegment(receipt.id, "operation id"),
    workspaceId: safeSegment(receipt.workspaceId, "workspace id"),
    kind: safeText(receipt.kind, 80),
    state: receipt.state,
    ...(receipt.idempotencyKeyHash && /^[a-f0-9]{64}$/i.test(receipt.idempotencyKeyHash) ? { idempotencyKeyHash: receipt.idempotencyKeyHash.toLowerCase() } : {}),
    startedAt: receipt.startedAt,
    updatedAt: receipt.updatedAt,
    ...(receipt.summary ? { summary: sanitizeOperationSummary(receipt.summary) } : {}),
    ...(receipt.error ? { error: { code: safeText(receipt.error.code, 80), message: safeText(receipt.error.message, 480) } } : {})
  };
}
export class OperationStore {
  readonly baseDir: string;
  readonly maxReceipts: number;

  constructor(options: OperationStoreOptions = {}) {
    this.baseDir = path.resolve(options.baseDir ?? path.join(os.homedir(), ".codexpro", "operations"));
    this.maxReceipts = Math.max(8, Math.min(2048, Math.floor(options.maxReceipts ?? DEFAULT_RECEIPTS)));
  }

  private workspaceDir(workspaceId: string): string {
    return path.join(this.baseDir, safeSegment(workspaceId, "workspace id"));
  }

  private receiptPath(workspaceId: string, id: string): string {
    return path.join(this.workspaceDir(workspaceId), `${safeSegment(id, "operation id")}.json`);
  }

  async save(receipt: OperationReceipt): Promise<OperationReceipt> {
    const safe = sanitizeReceipt(receipt);
    const dir = this.workspaceDir(safe.workspaceId);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const target = this.receiptPath(safe.workspaceId, safe.id);
    const json = `${JSON.stringify(safe)}\n`;
    if (Buffer.byteLength(json, "utf8") > MAX_RECEIPT_BYTES) throw new Error("Operation receipt exceeded bounded storage limit.");
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, json, { encoding: "utf8", mode: 0o600 });
    try {
      await fsp.rename(temp, target);
    } catch (error) {
      try { await fsp.rm(temp, { force: true }); } catch {}
      throw error;
    }
    await this.prune(safe.workspaceId);
    return safe;
  }

  async get(workspaceId: string, id: string): Promise<OperationReceipt | null> {
    try {
      const raw = await fsp.readFile(this.receiptPath(workspaceId, id), "utf8");
      return JSON.parse(raw) as OperationReceipt;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async list(workspaceId: string): Promise<OperationReceipt[]> {
    const dir = this.workspaceDir(workspaceId);
    let names: string[];
    try { names = await fsp.readdir(dir); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const receipts: OperationReceipt[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const raw = await fsp.readFile(path.join(dir, name), "utf8");
        receipts.push(JSON.parse(raw) as OperationReceipt);
      } catch {}
    }
    return receipts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async findByIdempotencyHash(workspaceId: string, kind: string, hash: string): Promise<OperationReceipt | null> {
    const receipts = await this.list(workspaceId);
    return receipts.find((receipt) => receipt.kind === kind && receipt.idempotencyKeyHash === hash) ?? null;
  }

  private async prune(workspaceId: string): Promise<void> {
    const receipts = await this.list(workspaceId);
    for (const receipt of receipts.slice(this.maxReceipts)) {
      try { await fsp.rm(this.receiptPath(workspaceId, receipt.id), { force: true }); } catch {}
    }
  }
}
