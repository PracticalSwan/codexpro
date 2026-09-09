import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { redactSensitiveText } from "../redact.js";
import type { ActivityRecord, ActivityPage, ActivityQuery } from "./types.js";

export interface ActivityStoreOptions { baseDir: string; maxRecords: number; maxBytes: number; }

function safeId(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function cleanSummary(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  let text = String(value).replace(/[\r\n\0]+/g, " ").trim();
  if (!text) return undefined;
  if (/(?:authorization|api[_-]?key|token|secret|password)\s*[:=]/i.test(text)) return "[redacted summary]";
  text = text.replace(/[A-Za-z]:[\\/][^\s"']+/g, "[path omitted]")
    .replace(/(^|\s)\/(?:[^\s"']+\/)*[^\s"']+/g, "$1[path omitted]");
  return redactSensitiveText(text).slice(0, 320);
}

function cleanPaths(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const out: string[] = [];
  for (const raw of values.slice(0, 32)) {
    const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(raw) || normalized === ".." || normalized.startsWith("../")) continue;
    if (!out.includes(normalized)) out.push(normalized.slice(0, 512));
  }
  return out.length ? out : undefined;
}

export function sanitizeActivityRecord(record: ActivityRecord): ActivityRecord {
  return {
    sequence: Math.max(1, Math.floor(record.sequence)), timestamp: record.timestamp,
    workspaceId: safeId(record.workspaceId, "workspace id"), kind: record.kind,
    action: String(record.action ?? "unknown").replace(/[^A-Za-z0-9._:/ -]+/g, "_").slice(0, 80), status: record.status,
    ...(Number.isFinite(record.durationMs) ? { durationMs: Math.max(0, Math.floor(record.durationMs!)) } : {}),
    ...(record.operationId ? { operationId: safeId(record.operationId, "operation id") } : {}),
    ...(record.checkId ? { checkId: safeId(record.checkId, "check id") } : {}),
    ...(record.processId ? { processId: safeId(record.processId, "process id") } : {}),
    ...(record.goalId ? { goalId: safeId(record.goalId, "goal id") } : {}),
    ...(record.continuationId ? { continuationId: safeId(record.continuationId, "continuation id") } : {}),
    ...(cleanPaths(record.relativePaths) ? { relativePaths: cleanPaths(record.relativePaths) } : {}),
    ...(cleanSummary(record.summary) ? { summary: cleanSummary(record.summary) } : {})
  };
}

export class ActivityStore {
  readonly baseDir: string;
  readonly maxRecords: number;
  readonly maxBytes: number;
  constructor(options: Partial<ActivityStoreOptions> = {}) {
    this.baseDir = path.resolve(options.baseDir ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".codexpro", "activity"));
    this.maxRecords = Math.max(2, Math.min(20_000, Math.floor(options.maxRecords ?? 2000)));
    this.maxBytes = Math.max(4096, Math.min(50_000_000, Math.floor(options.maxBytes ?? 2_000_000)));
  }

  private workspaceDir(workspaceId: string): string { return path.join(this.baseDir, safeId(workspaceId, "workspace id")); }
  private logPath(workspaceId: string): string { return path.join(this.workspaceDir(workspaceId), "activity.jsonl"); }

  async readAll(workspaceId: string): Promise<ActivityRecord[]> {
    let raw = "";
    try { raw = await fsp.readFile(this.logPath(workspaceId), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const records: ActivityRecord[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { records.push(JSON.parse(line) as ActivityRecord); } catch { /* tolerate truncated final line */ }
    }
    return records.sort((a, b) => a.sequence - b.sequence);
  }

  async lastSequence(workspaceId: string): Promise<number> {
    return (await this.readAll(workspaceId)).at(-1)?.sequence ?? 0;
  }
  async append(record: ActivityRecord): Promise<ActivityRecord> {
    const safe = sanitizeActivityRecord(record);
    const dir = this.workspaceDir(safe.workspaceId);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const target = this.logPath(safe.workspaceId);
    await fsp.appendFile(target, `${JSON.stringify(safe)}\n`, { encoding: "utf8", mode: 0o600 });
    await this.rotate(safe.workspaceId);
    return safe;
  }

  async read(query: ActivityQuery): Promise<ActivityPage> {
    const limit = Math.max(1, Math.min(500, Math.floor(query.limit ?? 100)));
    const records = (await this.readAll(query.workspaceId)).filter((record) => {
      if (record.sequence <= (query.afterSequence ?? 0)) return false;
      if (query.kinds?.length && !query.kinds.includes(record.kind)) return false;
      if (query.statuses?.length && !query.statuses.includes(record.status)) return false;
      return true;
    }).slice(0, limit);
    return { records, nextSequence: records.at(-1)?.sequence ?? Math.max(0, query.afterSequence ?? 0) };
  }

  private async rotate(workspaceId: string): Promise<void> {
    const records = await this.readAll(workspaceId);
    let kept = records.slice(-this.maxRecords);
    let text = kept.map((item) => `${JSON.stringify(item)}\n`).join("");
    while (kept.length > 1 && Buffer.byteLength(text, "utf8") > this.maxBytes) {
      kept = kept.slice(1);
      text = kept.map((item) => `${JSON.stringify(item)}\n`).join("");
    }
    const target = this.logPath(workspaceId);
    if (kept.length === records.length && Buffer.byteLength(text, "utf8") <= this.maxBytes) return;
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, text, { encoding: "utf8", mode: 0o600 });
    await fsp.rename(temp, target);
  }
}

