import { randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

export type TelegramRuntimeState = "disabled" | "unconfigured" | "unpaired" | "webhook_conflict" | "ready" | "error";
export type TelegramWorkerState = "not_running" | "running" | "error";

export interface TelegramRuntimeStatus {
  state: TelegramRuntimeState;
  workerState: TelegramWorkerState;
  botUsername?: string;
  webhookConflict: boolean;
  lastSuccessfulContactAt?: string;
  notificationAvailable: boolean;
  updatedAt: string;
}

interface StoredTelegramRuntimeStatus extends TelegramRuntimeStatus {
  version: 1;
  pid: number;
}

const RUNTIME_STATES = new Set<TelegramRuntimeState>(["disabled", "unconfigured", "unpaired", "webhook_conflict", "ready", "error"]);
const WORKER_STATES = new Set<TelegramWorkerState>(["not_running", "running", "error"]);
function statusFile(stateDir: string): string {
  return path.join(path.resolve(stateDir), "runtime-status.json");
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

function timestamp(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = String(value);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`Invalid Telegram ${label}.`);
  return text;
}

function normalize(input: Partial<TelegramRuntimeStatus>, pid: number, updatedAt = new Date().toISOString()): StoredTelegramRuntimeStatus {
  if (!RUNTIME_STATES.has(input.state as TelegramRuntimeState)) throw new Error("Invalid Telegram runtime state.");
  if (!WORKER_STATES.has(input.workerState as TelegramWorkerState)) throw new Error("Invalid Telegram worker state.");
  const botUsername = input.botUsername === undefined ? undefined : String(input.botUsername);
  if (botUsername && !/^\w{5,32}$/.test(botUsername)) throw new Error("Invalid Telegram bot username.");
  return {
    version: 1, pid, state: input.state!, workerState: input.workerState!,
    ...(botUsername ? { botUsername } : {}),
    webhookConflict: input.webhookConflict === true,
    ...(timestamp(input.lastSuccessfulContactAt, "last contact timestamp") ? { lastSuccessfulContactAt: String(input.lastSuccessfulContactAt) } : {}),
    notificationAvailable: input.notificationAvailable === true,
    updatedAt: timestamp(updatedAt, "status timestamp")!
  };
}

export async function writeTelegramRuntimeStatus(stateDir: string, status: Omit<TelegramRuntimeStatus, "updatedAt"> & { updatedAt?: string }): Promise<void> {
  const file = statusFile(stateDir);
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fsp.chmod(path.dirname(file), 0o700);
  try {
    const existing = await fsp.lstat(file);
    if (!existing.isFile() || existing.isSymbolicLink() || existing.size > 16 * 1024) throw new Error("Unsafe Telegram runtime status state.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const payload = normalize(status, process.pid, status.updatedAt ?? new Date().toISOString());
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(tmp, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (process.platform === "win32") await fsp.rm(file, { force: true });
    await fsp.rename(tmp, file);
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
  }
}
export async function readTelegramRuntimeStatus(stateDir: string): Promise<TelegramRuntimeStatus> {
  const file = statusFile(stateDir);
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("Unsafe Telegram runtime status state.");
    const raw = JSON.parse(await fsp.readFile(file, "utf8"));
    if (raw?.version !== 1 || !Number.isInteger(raw?.pid) || Number(raw.pid) <= 0) throw new Error("Invalid Telegram runtime status state.");
    const value = normalize(raw, Number(raw.pid), String(raw.updatedAt ?? ""));
    const alive = processAlive(value.pid);
    return {
      state: value.state,
      workerState: alive ? value.workerState : "not_running",
      ...(value.botUsername ? { botUsername: value.botUsername } : {}),
      webhookConflict: value.webhookConflict,
      ...(value.lastSuccessfulContactAt ? { lastSuccessfulContactAt: value.lastSuccessfulContactAt } : {}),
      notificationAvailable: alive && value.notificationAvailable,
      updatedAt: value.updatedAt
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "disabled", workerState: "not_running", webhookConflict: false, notificationAvailable: false, updatedAt: new Date(0).toISOString() };
    }
    throw error;
  }
}
