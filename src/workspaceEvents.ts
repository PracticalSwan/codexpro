import fsp from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import type { PathGuard, Workspace } from "./guard.js";
import { listFiles } from "./fsOps.js";

export type WorkspaceEventKind = "create" | "edit" | "delete" | "rename";
export interface WorkspaceEvent { kind: WorkspaceEventKind; path: string; fromPath?: string; }
export interface WorkspaceEventPage { cursor: string; events: WorkspaceEvent[]; truncated: boolean; }
interface FileStamp { path: string; size: number; mtimeMs: number; signature: string; }

export class WorkspaceEventTracker {
  private readonly snapshots = new Map<string, Map<string, FileStamp>>();
  private readonly order: string[] = [];
  private readonly maxFiles: number;
  constructor(private readonly config: CodexProConfig, private readonly guard: PathGuard, private readonly workspace: Workspace, options: { maxFiles?: number } = {}) {
    this.maxFiles = Math.max(1, Math.min(options.maxFiles ?? 2000, 20_000));
  }

  async page(cursor?: string): Promise<WorkspaceEventPage> {
    const current = await this.snapshot();
    let events: WorkspaceEvent[] = [];
    if (cursor) {
      const previous = this.snapshots.get(cursor);
      if (!previous) throw new Error(`Unknown or expired workspace event cursor: ${cursor}`);
      events = this.diff(previous, current);
    }
    const next = `evt_${randomUUID()}`;
    this.snapshots.set(next, current);
    this.order.push(next);
    while (this.order.length > 16) this.snapshots.delete(this.order.shift()!);
    return { cursor: next, events: events.slice(0, 512), truncated: events.length > 512 };
  }

  private async snapshot(): Promise<Map<string, FileStamp>> {
    const files = await listFiles(this.guard, this.workspace, { includeHidden: true, maxFiles: this.maxFiles });
    const out = new Map<string, FileStamp>();
    for (const rel of files) {
      const resolved = this.guard.resolve(this.workspace, rel);
      try {
        const stat = await fsp.stat(resolved.absPath);
        const sample = stat.size <= 1_000_000 ? await fsp.readFile(resolved.absPath) : Buffer.from(`${stat.size}:${stat.mtimeMs}`);
        const signature = createHash("sha256").update(sample).digest("hex");
        out.set(rel, { path: rel, size: stat.size, mtimeMs: stat.mtimeMs, signature });
      } catch {}
    }
    return out;
  }

  private diff(previous: Map<string, FileStamp>, current: Map<string, FileStamp>): WorkspaceEvent[] {
    const events: WorkspaceEvent[] = [];
    const deleted = [...previous.values()].filter((old) => !current.has(old.path));
    const created = [...current.values()].filter((now) => !previous.has(now.path));
    const usedCreated = new Set<string>();
    for (const old of deleted) {
      const renamed = created.find((now) => !usedCreated.has(now.path) && now.signature === old.signature);
      if (renamed) { usedCreated.add(renamed.path); events.push({ kind: "rename", path: renamed.path, fromPath: old.path }); }
      else events.push({ kind: "delete", path: old.path });
    }
    for (const now of created) if (!usedCreated.has(now.path)) events.push({ kind: "create", path: now.path });
    for (const [rel, now] of current) {
      const old = previous.get(rel);
      if (old && old.signature !== now.signature) events.push({ kind: "edit", path: rel });
    }
    return events.sort((a,b) => a.path.localeCompare(b.path));
  }
}
