import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface GlobalHookSettings {
  version: 1;
  stagedCommitSafety: boolean;
  updatedAt?: string;
}

export function globalHookHome(): string {
  const custom = process.env.CODEXPRO_HOME?.trim();
  if (!custom) return path.join(os.homedir(), ".codexpro");
  if (custom === "~") return os.homedir();
  if (custom.startsWith("~/") || custom.startsWith("~\\")) return path.join(os.homedir(), custom.slice(2));
  return path.resolve(custom);
}

export function globalHookSettingsPath(homeDir = globalHookHome()): string {
  return path.join(homeDir, "hooks", "settings.json");
}

export function readGlobalHookSettings(homeDir = globalHookHome()): GlobalHookSettings {
  const filePath = globalHookSettingsPath(homeDir);
  if (!fs.existsSync(filePath)) return { version: 1, stagedCommitSafety: false };
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 4096) throw new Error("Invalid CodexPro global hook settings file.");
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  if (raw.version !== 1 || typeof raw.stagedCommitSafety !== "boolean") {
    throw new Error("Invalid CodexPro global hook settings file.");
  }
  return {
    version: 1,
    stagedCommitSafety: raw.stagedCommitSafety,
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {})
  };
}

export function saveGlobalHookSettings(
  settings: Pick<GlobalHookSettings, "stagedCommitSafety">,
  homeDir = globalHookHome()
): string {
  const filePath = globalHookSettingsPath(homeDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const payload: GlobalHookSettings = {
    version: 1,
    stagedCommitSafety: Boolean(settings.stagedCommitSafety),
    updatedAt: new Date().toISOString()
  };
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, filePath);
  try { fs.chmodSync(filePath, 0o600); } catch { /* Windows ACLs remain authoritative. */ }
  return filePath;
}
