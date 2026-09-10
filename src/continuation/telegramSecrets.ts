import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const TOKEN_PATTERN = /^\d{6,20}:[A-Za-z0-9_-]{20,}$/;

export function telegramBotTokenFile(homeDir: string): string {
  return path.join(homeDir, "secrets", "telegram-bot-token");
}

function validateToken(value: unknown): string {
  const token = String(value ?? "").trim();
  if (!TOKEN_PATTERN.test(token)) throw new Error("Invalid Telegram bot token format.");
  return token;
}

function windowsIdentity(): string {
  const fromEnv = process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : "";
  if (fromEnv) return fromEnv;
  return spawnSync("whoami", [], { encoding: "utf8", windowsHide: true }).stdout.trim();
}
function hardenWindowsPath(target: string, directory: boolean): void {
  const identity = windowsIdentity();
  if (!identity) throw new Error("Could not determine the current Windows user for Telegram secret ACLs.");
  const access = directory ? "(OI)(CI)F" : "F";
  const result = spawnSync("icacls", [
    target, "/inheritance:r", "/grant:r",
    `${identity}:${access}`,
    `*S-1-5-18:${access}`,
    `*S-1-5-32-544:${access}`
  ], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error("Could not restrict Telegram secret-file ACLs.");
}

function hardenPath(target: string, directory: boolean): void {
  if (process.platform === "win32") hardenWindowsPath(target, directory);
  else fs.chmodSync(target, directory ? 0o700 : 0o600);
}

export async function saveTelegramBotToken(homeDir: string, secret: string): Promise<string> {
  const value = validateToken(secret);
  const filePath = telegramBotTokenFile(homeDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  hardenPath(dir, true);
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    fs.writeFileSync(tmp, `${value}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    hardenPath(tmp, false);
    if (process.platform === "win32") fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, filePath);
    hardenPath(filePath, false);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
  return filePath;
}

export function resolveTelegramBotToken(homeDir: string, env: NodeJS.ProcessEnv = process.env): { token: string; source: "environment" | "protected_file" | "none" } {
  const fromEnv = String(env.CODEXPRO_TELEGRAM_BOT_TOKEN ?? "").trim();
  if (fromEnv) return { token: validateToken(fromEnv), source: "environment" };
  const filePath = telegramBotTokenFile(homeDir);
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return { token: "", source: "none" };
    if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) return { token: "", source: "none" };
    const value = fs.readFileSync(filePath, "utf8").trim();
    return { token: validateToken(value), source: "protected_file" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { token: "", source: "none" };
    return { token: "", source: "none" };
  }
}

export async function clearTelegramBotToken(homeDir: string): Promise<void> {
  fs.rmSync(telegramBotTokenFile(homeDir), { force: true });
}
