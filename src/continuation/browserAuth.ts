import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const PAIRING_TTL_MS = 5 * 60_000;
const MAX_PAIRING_FAILURES = 5;
const MAX_RECORD_BYTES = 16 * 1024;
const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CLIENT_PATTERN = /^browser_[A-Za-z0-9-]{1,80}$/;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

interface PairingRecord {
  schemaVersion: 1;
  profileLabel: string;
  codeHash: string;
  createdAt: string;
  expiresAt: string;
  failedAttempts: number;
  consumedAt?: string;
}

interface BrowserClientRecord {
  schemaVersion: 1;
  clientId: string;
  profileLabel: string;
  credentialHash: string;
  createdAt: string;
  revokedAt?: string;
  extensionVersion?: string;
  extensionId?: string;
}
function profileLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!PROFILE_PATTERN.test(label)) throw new Error("Invalid managed browser profile label.");
  return label;
}
function clientId(value: unknown): string {
  const id = String(value ?? "");
  if (!CLIENT_PATTERN.test(id)) throw new Error("Invalid browser client id.");
  return id;
}
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function pidAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; } }
function constantHexEqual(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) return false;
  const left = Buffer.from(expected, "hex"); const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}
function base32Code(): string {
  const bytes = randomBytes(5); let bits = 0; let value = 0; let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.slice(0, 8);
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  const text = `${JSON.stringify(value)}\n`;
  if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) throw new Error("Browser continuation record exceeds bounded storage limit.");
  await fsp.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fsp.writeFile(temp, text, { encoding: "utf8", mode: 0o600 });
  try { await fsp.rename(temp, file); } catch (error) { await fsp.rm(temp, { force: true }).catch(() => undefined); throw error; }
}
export interface BrowserPairingStoreOptions { now?: () => number; }
export interface BrowserPairingResult { code: string; expiresAt: string; profileLabel: string; }
export interface BrowserCredentialResult { clientId: string; credential: string; profileLabel: string; }

export class BrowserPairingStore {
  private readonly now: () => number;
  constructor(public readonly baseDir: string, options: BrowserPairingStoreOptions = {}) { this.now = options.now ?? Date.now; }
  private pairingsDir(): string { return path.join(this.baseDir, "pairings"); }
  private clientsDir(): string { return path.join(this.baseDir, "clients"); }
  private locksDir(): string { return path.join(this.baseDir, "locks"); }
  private pairingFile(profile: string): string { return path.join(this.pairingsDir(), `${profileLabel(profile)}.json`); }
  private clientFile(id: string): string { return path.join(this.clientsDir(), `${clientId(id)}.json`); }
  private lockDir(profile: string): string { return path.join(this.locksDir(), `${profileLabel(profile)}.lock`); }

  private async readJson<T>(file: string): Promise<T> {
    const text = await fsp.readFile(file, "utf8");
    if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) throw new Error("Browser continuation record exceeds bounded storage limit.");
    return JSON.parse(text) as T;
  }

  private async withProfileLock<T>(profile: string, fn: () => Promise<T>): Promise<T> {
    const lock = this.lockDir(profile); await fsp.mkdir(this.locksDir(), { recursive: true, mode: 0o700 });
    const deadline = Date.now() + 10_000;
    while (true) {
      try {
        await fsp.mkdir(lock, { mode: 0o700 });
        await fsp.writeFile(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid }), { mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let ownerPid = 0; try { ownerPid = Number(JSON.parse(await fsp.readFile(path.join(lock, "owner.json"), "utf8")).pid); } catch {}
        if (ownerPid && !pidAlive(ownerPid)) { await fsp.rm(lock, { recursive: true, force: true }).catch(() => undefined); continue; }
        if (Date.now() >= deadline) throw new Error("Browser pairing profile lock is busy.");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try { return await fn(); } finally { await fsp.rm(lock, { recursive: true, force: true }).catch(() => undefined); }
  }
  async createPairing(profile: string): Promise<BrowserPairingResult> {
    const label = profileLabel(profile);
    return this.withProfileLock(label, async () => {
      const code = base32Code(); const now = this.now();
      const record: PairingRecord = {
        schemaVersion: 1, profileLabel: label, codeHash: sha256(code), failedAttempts: 0,
        createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PAIRING_TTL_MS).toISOString()
      };
      await atomicJson(this.pairingFile(label), record);
      return { code, expiresAt: record.expiresAt, profileLabel: label };
    });
  }

  private async clients(): Promise<BrowserClientRecord[]> {
    await fsp.mkdir(this.clientsDir(), { recursive: true, mode: 0o700 });
    const names = await fsp.readdir(this.clientsDir()).catch(() => [] as string[]);
    const records: BrowserClientRecord[] = [];
    for (const name of names.filter((entry) => entry.endsWith(".json")).slice(0, 256)) {
      try {
        const record = await this.readJson<BrowserClientRecord>(path.join(this.clientsDir(), name));
        if (record.schemaVersion === 1 && CLIENT_PATTERN.test(record.clientId) && PROFILE_PATTERN.test(record.profileLabel)) records.push(record);
      } catch {}
    }
    return records;
  }

  private async revokeProfileClients(profile: string): Promise<void> {
    const now = new Date(this.now()).toISOString();
    for (const record of await this.clients()) {
      if (record.profileLabel !== profile || record.revokedAt) continue;
      record.revokedAt = now; await atomicJson(this.clientFile(record.clientId), record);
    }
  }
  async exchangePairing(profile: string, code: string, metadata: { extensionVersion?: string; extensionId?: string } = {}): Promise<BrowserCredentialResult> {
    const label = profileLabel(profile);
    return this.withProfileLock(label, async () => {
      let pairing: PairingRecord;
      try { pairing = await this.readJson<PairingRecord>(this.pairingFile(label)); }
      catch { throw new Error("pairing_code_invalid: no active pairing for this managed profile."); }
      if (pairing.consumedAt) throw new Error("pairing_consumed: pairing code has already been used.");
      if (this.now() > Date.parse(pairing.expiresAt)) throw new Error("pairing_expired: pairing code expired.");
      if (pairing.failedAttempts >= MAX_PAIRING_FAILURES) throw new Error("pairing_locked: too many failed pairing attempts.");
      const actualHash = sha256(String(code ?? "").trim().toUpperCase());
      if (!constantHexEqual(pairing.codeHash, actualHash)) {
        pairing.failedAttempts += 1; await atomicJson(this.pairingFile(label), pairing);
        if (pairing.failedAttempts >= MAX_PAIRING_FAILURES) throw new Error("pairing_locked: too many failed pairing attempts.");
        throw new Error("pairing_code_invalid: pairing code is not valid.");
      }
      pairing.consumedAt = new Date(this.now()).toISOString();
      await atomicJson(this.pairingFile(label), pairing);
      await this.revokeProfileClients(label);
      const credential = randomBytes(32).toString("hex");
      const id = `browser_${randomUUID()}`;
      const version = metadata.extensionVersion?.trim();
      const extensionId = metadata.extensionId?.trim();
      if (extensionId && !EXTENSION_ID_PATTERN.test(extensionId)) throw new Error("Invalid browser extension id.");
      const client: BrowserClientRecord = {
        schemaVersion: 1, clientId: id, profileLabel: label, credentialHash: sha256(credential), createdAt: new Date(this.now()).toISOString(),
        ...(version && /^[0-9A-Za-z._-]{1,32}$/.test(version) ? { extensionVersion: version } : {}),
        ...(extensionId ? { extensionId } : {})
      };
      await atomicJson(this.clientFile(id), client);
      return { clientId: id, credential, profileLabel: label };
    });
  }
  async verifyCredential(id: string, credential: string, extensionId?: string): Promise<boolean> {
    let record: BrowserClientRecord;
    try { record = await this.readJson<BrowserClientRecord>(this.clientFile(id)); } catch { return false; }
    if (record.revokedAt || record.schemaVersion !== 1) return false;
    if (record.extensionId && extensionId && extensionId !== record.extensionId) return false;
    if (extensionId && !EXTENSION_ID_PATTERN.test(extensionId)) return false;
    const actual = sha256(String(credential ?? ""));
    return constantHexEqual(record.credentialHash, actual);
  }

  async revokeClient(id: string): Promise<void> {
    const record = await this.readJson<BrowserClientRecord>(this.clientFile(id));
    if (!record.revokedAt) { record.revokedAt = new Date(this.now()).toISOString(); await atomicJson(this.clientFile(id), record); }
  }

  async listPublicClients(): Promise<Array<Record<string, unknown>>> {
    return (await this.clients()).map((record) => ({
      client_id: record.clientId, profile_label: record.profileLabel, active: !record.revokedAt,
      created_at: record.createdAt, ...(record.revokedAt ? { revoked_at: record.revokedAt } : {}),
      ...(record.extensionVersion ? { extension_version: record.extensionVersion } : {})
    }));
  }

  async debugRecordsForTest(): Promise<unknown> {
    const pairings: unknown[] = []; const clients: unknown[] = [];
    for (const dir of [this.pairingsDir(), this.clientsDir()]) await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    for (const name of await fsp.readdir(this.pairingsDir())) if (name.endsWith(".json")) pairings.push(await this.readJson(path.join(this.pairingsDir(), name)));
    for (const name of await fsp.readdir(this.clientsDir())) if (name.endsWith(".json")) clients.push(await this.readJson(path.join(this.clientsDir(), name)));
    return { pairings, clients };
  }
}
