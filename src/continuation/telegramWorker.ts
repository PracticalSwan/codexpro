import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

interface TelegramWorkerClient {
  getWebhookInfo(): Promise<any>;
  getUpdates(input: Record<string, unknown>): Promise<any[]>;
}

interface TelegramUpdateWorkerOptions {
  stateDir: string;
  client: TelegramWorkerClient;
  handleUpdate: (update: any) => Promise<void>;
  ownerId?: string;
  now?: () => number;
  longPollSeconds?: number;
}

export function telegramWorkerBackoffMs(attempt: number, error?: { retryAfter?: number }): number {
  if (Number.isFinite(error?.retryAfter)) return Math.max(0, Math.floor(error!.retryAfter! * 1000));
  return Math.min(30_000, 1_000 * (2 ** Math.max(0, Math.min(5, Math.floor(attempt)))));
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

export class TelegramUpdateWorker {
  private readonly stateDir: string;
  private readonly client: TelegramWorkerClient;
  private readonly handleUpdate: (update: any) => Promise<void>;
  private readonly ownerId: string;
  private readonly now: () => number;
  private readonly longPollSeconds: number;

  constructor(options: TelegramUpdateWorkerOptions) {
    this.stateDir = path.resolve(options.stateDir);
    this.client = options.client;
    this.handleUpdate = options.handleUpdate;
    this.ownerId = options.ownerId ?? `worker_${process.pid}_${randomBytes(8).toString("hex")}`;
    this.now = options.now ?? Date.now;
    this.longPollSeconds = Math.max(1, Math.min(50, Math.floor(options.longPollSeconds ?? 30)));
  }

  private leaseFile(): string { return path.join(this.stateDir, "worker-lease.json"); }
  private offsetFile(): string { return path.join(this.stateDir, "offset.json"); }

  async acquireLease(): Promise<void> {
    await fsp.mkdir(this.stateDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await fsp.chmod(this.stateDir, 0o700);
    const expiresAt = this.now() + 90_000;
    const payload = `${JSON.stringify({ ownerId: this.ownerId, pid: process.pid, expiresAt })}\n`;
    try {
      await fsp.writeFile(this.leaseFile(), payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const leaseStat = await fsp.lstat(this.leaseFile());
    if (!leaseStat.isFile() || leaseStat.isSymbolicLink() || leaseStat.size > 16 * 1024) {
      throw new Error("Telegram update worker lease state is unsafe.");
    }
    const existing = JSON.parse(await fsp.readFile(this.leaseFile(), "utf8"));
    const existingPid = Number(existing?.pid);
    let existingProcessAlive = false;
    if (Number.isInteger(existingPid) && existingPid > 0) {
      try { process.kill(existingPid, 0); existingProcessAlive = true; }
      catch (error) { existingProcessAlive = (error as NodeJS.ErrnoException).code === "EPERM"; }
    }
    if (!Number.isFinite(existing?.expiresAt) || existing.expiresAt > this.now() || existingProcessAlive) {
      throw new Error("Telegram update worker is already active for this bot state.");
    }
    await fsp.rm(this.leaseFile(), { force: true });
    await fsp.writeFile(this.leaseFile(), payload, { encoding: "utf8", mode: 0o600, flag: "wx" });
  }

  async releaseLease(): Promise<void> {
    try {
      const current = JSON.parse(await fsp.readFile(this.leaseFile(), "utf8"));
      if (current?.ownerId === this.ownerId) await fsp.rm(this.leaseFile(), { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private async readOffset(): Promise<number> {
    try {
      const value = JSON.parse(await fsp.readFile(this.offsetFile(), "utf8"));
      return Number.isInteger(value?.offset) && value.offset >= 0 ? value.offset : 0;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
      throw error;
    }
  }

  private async writeOffset(offset: number): Promise<void> {
    const tmp = `${this.offsetFile()}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    await fsp.writeFile(tmp, `${JSON.stringify({ offset })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (process.platform === "win32") await fsp.rm(this.offsetFile(), { force: true });
    await fsp.rename(tmp, this.offsetFile());
  }

  async runOnce(): Promise<number> {
    const webhook = await this.client.getWebhookInfo();
    if (String(webhook?.url ?? "").trim()) throw new Error("Telegram bot has an active webhook; long polling is disabled until the conflict is resolved explicitly.");
    let offset = await this.readOffset();
    const updates = await this.client.getUpdates({
      offset,
      timeout: this.longPollSeconds,
      allowed_updates: ["message", "callback_query"]
    });
    let handled = 0;
    for (const update of (Array.isArray(updates) ? updates : []).slice(0, 100)) {
      const updateId = Number((update as any)?.update_id);
      if (!Number.isInteger(updateId) || updateId < 0 || updateId < offset) continue;
      await this.handleUpdate(update);
      offset = updateId + 1;
      await this.writeOffset(offset);
      handled += 1;
    }
    return handled;
  }

  async run(signal?: AbortSignal): Promise<void> {
    await this.acquireLease();
    let failures = 0;
    try {
      while (!signal?.aborted) {
        try {
          await this.runOnce();
          failures = 0;
        } catch (error) {
          if (signal?.aborted) break;
          const waitMs = telegramWorkerBackoffMs(failures++, error as any);
          await sleep(waitMs, signal);
        }
      }
    } finally {
      await this.releaseLease();
    }
  }
}
