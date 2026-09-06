import os from "node:os";
import path from "node:path";
import fsp from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { readHookConfig } from "./hooks/store.js";

export interface ProjectTrustStatus {
  hookPresent: boolean;
  trusted: boolean;
  hookSha256?: string;
  trustedSha256?: string;
  changed: boolean;
}

interface TrustRecord {
  version: 1;
  canonicalRoot: string;
  hookSha256: string;
  trustedAt: string;
}

function defaultTrustDir(): string { return path.join(os.homedir(), ".codexpro", "trust"); }
function rootKey(root: string): string { return createHash("sha256").update(root).digest("hex").slice(0, 32); }
function recordPath(root: string, trustDir: string): string { return path.join(trustDir, `${rootKey(root)}.json`); }

async function readRecord(root: string, trustDir: string): Promise<TrustRecord | null> {
  try {
    const parsed = JSON.parse(await fsp.readFile(recordPath(root, trustDir), "utf8"));
    if (parsed?.version !== 1 || parsed?.canonicalRoot !== root || !/^[a-f0-9]{64}$/.test(String(parsed?.hookSha256 ?? ""))) return null;
    return parsed as TrustRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function writeRecord(record: TrustRecord, trustDir: string): Promise<void> {
  await fsp.mkdir(trustDir, { recursive: true, mode: 0o700 });
  const target = recordPath(record.canonicalRoot, trustDir);
  const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  await fsp.rename(temp, target);
  try { await fsp.chmod(target, 0o600); } catch { /* Windows ACLs remain authoritative. */ }
}

export async function projectTrustStatus(root: string, hookBytes?: Buffer, trustDir = defaultTrustDir()): Promise<ProjectTrustStatus> {
  const canonicalRoot = await fsp.realpath(root);
  const loaded = hookBytes ? null : await readHookConfig(canonicalRoot);
  const bytes = hookBytes ?? loaded?.bytes;
  if (!bytes) return { hookPresent: false, trusted: false, changed: false };
  const hookSha256 = createHash("sha256").update(bytes).digest("hex");
  const record = await readRecord(canonicalRoot, trustDir);
  const trusted = record?.hookSha256 === hookSha256;
  return {
    hookPresent: true,
    trusted,
    hookSha256,
    ...(record ? { trustedSha256: record.hookSha256 } : {}),
    changed: Boolean(record && !trusted)
  };
}

export async function trustProjectHooks(root: string, trustDir = defaultTrustDir()): Promise<ProjectTrustStatus> {
  const canonicalRoot = await fsp.realpath(root);
  const loaded = await readHookConfig(canonicalRoot);
  if (!loaded) throw new Error("No .codexpro-hooks.json exists in the workspace root.");
  await writeRecord({ version: 1, canonicalRoot, hookSha256: loaded.sha256, trustedAt: new Date().toISOString() }, trustDir);
  return projectTrustStatus(canonicalRoot, loaded.bytes, trustDir);
}
