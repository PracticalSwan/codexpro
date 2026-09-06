import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { FileCheckpoint } from "./types.js";

export interface CheckpointStoreOptions {
  baseDir: string;
  maxCheckpoints: number;
  maxBytes: number;
}

function safeId(value: string, label: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export class CheckpointStore {
  readonly baseDir: string;
  readonly maxCheckpoints: number;
  readonly maxBytes: number;
  constructor(options: Partial<CheckpointStoreOptions> = {}) {
    this.baseDir = path.resolve(options.baseDir ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".codexpro", "checkpoints"));
    this.maxCheckpoints = Math.max(8, Math.min(2048, Math.floor(options.maxCheckpoints ?? 256)));
    this.maxBytes = Math.max(64_000, Math.min(200_000_000, Math.floor(options.maxBytes ?? 20_000_000)));
  }
  private workspaceDir(workspaceId: string): string { return path.join(this.baseDir, "records", safeId(workspaceId, "workspace id")); }
  private recordPath(workspaceId: string, id: string): string { return path.join(this.workspaceDir(workspaceId), `${safeId(id, "checkpoint id")}.json`); }
  blobPath(sha256: string): string { return path.join(this.baseDir, "blobs", safeId(sha256, "blob hash")); }
  async putBlob(sha256: string, bytes: Buffer): Promise<void> {
    if (bytes.length > this.maxBytes) throw new Error("Checkpoint preimage exceeds checkpoint byte limit.");
    const dir = path.join(this.baseDir, "blobs");
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const target = this.blobPath(sha256);
    try { await fsp.access(target); return; } catch {}
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, bytes, { mode: 0o600, flag: "wx" });
    try { await fsp.rename(temp, target); } catch (error) { try { await fsp.rm(temp, { force: true }); } catch {} if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  async readBlob(sha256: string): Promise<Buffer> { return fsp.readFile(this.blobPath(sha256)); }
  async save(checkpoint: FileCheckpoint): Promise<FileCheckpoint> {
    const dir = this.workspaceDir(checkpoint.workspaceId);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const json = JSON.stringify(checkpoint) + "\n";
    if (Buffer.byteLength(json) > 128_000) throw new Error("Checkpoint record exceeds bounded metadata limit.");
    const target = this.recordPath(checkpoint.workspaceId, checkpoint.id);
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, json, { encoding: "utf8", mode: 0o600 });
    await fsp.rename(temp, target);
    await this.prune(checkpoint.workspaceId);
    return checkpoint;
  }
  async get(workspaceId: string, id: string): Promise<FileCheckpoint | null> {
    try { return JSON.parse(await fsp.readFile(this.recordPath(workspaceId, id), "utf8")) as FileCheckpoint; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  private async prune(workspaceId: string): Promise<void> {
    const dir = this.workspaceDir(workspaceId);
    let names: string[]; try { names = (await fsp.readdir(dir)).filter((name) => name.endsWith(".json")); } catch { return; }
    if (names.length <= this.maxCheckpoints) return;
    const stats = await Promise.all(names.map(async (name) => ({ name, stat: await fsp.stat(path.join(dir, name)) })));
    stats.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
    await Promise.all(stats.slice(0, stats.length - this.maxCheckpoints).map(({ name }) => fsp.rm(path.join(dir, name), { force: true })));
  }
}
