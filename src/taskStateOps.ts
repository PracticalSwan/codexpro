import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hasSecretValue, redactSensitiveText } from "./redact.js";

export interface TaskSnapshotInput {
  goal: string;
  filesInspected: string[];
  verification: string[];
  decisions: string[];
  remainingWork: string[];
}
export interface TaskSnapshot extends TaskSnapshotInput { schemaVersion: 1; id: string; createdAt: string; updatedAt: string; }

const ALLOWED_KEYS = new Set(["goal","filesInspected","verification","decisions","remainingWork"]);
function cleanLine(value: unknown, max = 500): string { return redactSensitiveText(String(value ?? "")).replace(/[\r\n\0]+/g," ").trim().slice(0,max); }
function cleanList(value: unknown): string[] { return Array.isArray(value) ? value.slice(0,128).map((item) => cleanLine(item,1000)).filter(Boolean) : []; }

export class TaskStateStore {
  constructor(private readonly options: { baseDir: string; maxSnapshots?: number }) {}

  async save(input: TaskSnapshotInput): Promise<TaskSnapshot> {
    for (const key of Object.keys(input as any)) if (!ALLOWED_KEYS.has(key)) throw new Error(`Unknown task snapshot field: ${key}`);
    const clean: TaskSnapshotInput = {
      goal: cleanLine(input.goal, 1000), filesInspected: cleanList(input.filesInspected), verification: cleanList(input.verification),
      decisions: cleanList(input.decisions), remainingWork: cleanList(input.remainingWork)
    };
    if (!clean.goal) throw new Error("Task snapshot goal is required.");
    if (hasSecretValue(JSON.stringify(clean))) throw new Error("Secret-looking task snapshot content is not allowed.");
    const now = new Date().toISOString();
    const snapshot: TaskSnapshot = { schemaVersion: 1, id: `task_${randomUUID()}`, createdAt: now, updatedAt: now, ...clean };
    await fsp.mkdir(this.options.baseDir, { recursive: true, mode: 0o700 });
    await fsp.writeFile(path.join(this.options.baseDir, `${snapshot.id}.json`), JSON.stringify(snapshot, null, 2), { encoding: "utf8", mode: 0o600 });
    await this.prune();
    return snapshot;
  }

  async load(id: string): Promise<TaskSnapshot | null> {
    if (!/^task_[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error(`Invalid task snapshot id: ${id}`);
    try { return JSON.parse(await fsp.readFile(path.join(this.options.baseDir, `${id}.json`), "utf8")) as TaskSnapshot; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  private async prune(): Promise<void> {
    const max = Math.max(1, Math.min(this.options.maxSnapshots ?? 128, 2048));
    const entries = (await fsp.readdir(this.options.baseDir, { withFileTypes: true })).filter((e) => e.isFile() && /^task_.*\.json$/.test(e.name));
    if (entries.length <= max) return;
    const stats = await Promise.all(entries.map(async (entry) => ({ entry, stat: await fsp.stat(path.join(this.options.baseDir, entry.name)) })));
    stats.sort((a,b) => a.stat.mtimeMs - b.stat.mtimeMs);
    for (const item of stats.slice(0, stats.length-max)) await fsp.unlink(path.join(this.options.baseDir, item.entry.name));
  }
}