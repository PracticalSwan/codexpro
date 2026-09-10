import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

interface PendingPairing {
  version: 1;
  botId: string;
  codeHash: string;
  expiresAt: string;
}

export interface TelegramPairedIdentity {
  telegramUserId: string;
  privateChatId: string;
  botId: string;
}

interface TelegramPairingOptions { now?: () => number; }

function numericId(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!/^-?\d{1,20}$/.test(text)) throw new Error(`Invalid Telegram ${label}.`);
  return text;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error("Invalid Telegram pairing state file.");
    return JSON.parse(await fsp.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await fsp.chmod(dir, 0o700);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(tmp, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (process.platform !== "win32") await fsp.chmod(tmp, 0o600);
    if (process.platform === "win32") await fsp.rm(file, { force: true });
    await fsp.rename(tmp, file);
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
  }
}
function startCodeFromUpdate(update: any): { code: string; userId: string; chatId: string } {
  const message = update?.message;
  if (!message || message?.chat?.type !== "private") throw new Error("Telegram pairing requires a private chat message.");
  const userId = numericId(message?.from?.id, "user id");
  const chatId = numericId(message?.chat?.id, "private chat id");
  const text = String(message?.text ?? "").trim();
  const match = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{16,64})$/.exec(text);
  if (!match) throw new Error("Telegram pairing message did not contain the active /start code.");
  return { code: match[1], userId, chatId };
}

export class TelegramPairingStore {
  private readonly baseDir: string;
  private readonly now: () => number;
  constructor(baseDir: string, options: TelegramPairingOptions = {}) {
    this.baseDir = path.resolve(baseDir);
    this.now = options.now ?? Date.now;
  }

  private pendingFile(): string { return path.join(this.baseDir, "pending-pairing.json"); }
  private pairedFile(): string { return path.join(this.baseDir, "paired.json"); }

  async paired(): Promise<TelegramPairedIdentity | null> {
    const value = await readJsonFile<TelegramPairedIdentity>(this.pairedFile());
    if (!value) return null;
    return { telegramUserId: numericId(value.telegramUserId, "user id"), privateChatId: numericId(value.privateChatId, "private chat id"), botId: numericId(value.botId, "bot id") };
  }
  async createPairing(bot: { id: unknown; username?: string }): Promise<{ code: string; expiresAt: string; botId: string }> {
    if (await this.paired()) throw new Error("Telegram is already paired; revoke the existing pairing first.");
    const botId = numericId(bot.id, "bot id");
    const code = randomBytes(18).toString("base64url");
    const expiresAt = new Date(this.now() + 5 * 60_000).toISOString();
    const pending: PendingPairing = { version: 1, botId, codeHash: hashCode(code), expiresAt };
    await writeJsonAtomic(this.pendingFile(), pending);
    return { code, expiresAt, botId };
  }

  async claimFromUpdate(update: unknown, currentBotId: unknown): Promise<TelegramPairedIdentity> {
    if (await this.paired()) throw new Error("Telegram pairing code was already used; revoke the existing pairing first.");
    const pending = await readJsonFile<PendingPairing>(this.pendingFile());
    if (!pending) throw new Error("No active Telegram pairing request exists.");
    const botId = numericId(currentBotId, "bot id");
    if (pending.botId !== botId) throw new Error("Telegram bot identity changed during pairing.");
    if (Date.parse(pending.expiresAt) < this.now()) {
      await fsp.rm(this.pendingFile(), { force: true });
      throw new Error("Telegram pairing code expired.");
    }
    const parsed = startCodeFromUpdate(update);
    if (hashCode(parsed.code) !== pending.codeHash) throw new Error("Telegram pairing code is invalid.");
    const paired: TelegramPairedIdentity = { telegramUserId: parsed.userId, privateChatId: parsed.chatId, botId };
    await writeJsonAtomic(this.pairedFile(), paired);
    await fsp.rm(this.pendingFile(), { force: true });
    return paired;
  }

  async assertBotIdentity(currentBotId: unknown): Promise<void> {
    const paired = await this.paired();
    if (!paired) throw new Error("Telegram is not paired.");
    if (paired.botId !== numericId(currentBotId, "bot id")) throw new Error("Telegram bot identity no longer matches the paired bot.");
  }

  async assertPairedUpdate(update: any, currentBotId: unknown): Promise<TelegramPairedIdentity> {
    const paired = await this.paired();
    if (!paired) throw new Error("Telegram is not paired.");
    if (paired.botId !== numericId(currentBotId, "bot id")) throw new Error("Telegram bot identity no longer matches the paired bot.");
    const message = update?.message ?? update?.callback_query?.message;
    const from = update?.callback_query?.from ?? update?.message?.from;
    if (message?.chat?.type !== "private") throw new Error("Telegram control is restricted to the paired private chat.");
    if (numericId(from?.id, "user id") !== paired.telegramUserId || numericId(message?.chat?.id, "private chat id") !== paired.privateChatId) throw new Error("Telegram update is not from the paired user/private chat.");
    return paired;
  }

  async revoke(): Promise<void> {
    await Promise.all([fsp.rm(this.pendingFile(), { force: true }), fsp.rm(this.pairedFile(), { force: true })]);
  }
}

export async function claimPairingFromUpdates(
  store: TelegramPairingStore,
  updates: unknown[],
  currentBotId: unknown
): Promise<TelegramPairedIdentity | null> {
  for (const update of updates.slice(0, 100)) {
    const message = (update as any)?.message;
    const text = String(message?.text ?? "").trim();
    if (message?.chat?.type !== "private" || !/^\/start(?:@[A-Za-z0-9_]+)?\s+[A-Za-z0-9_-]{16,64}$/.test(text)) continue;
    try {
      return await store.claimFromUpdate(update, currentBotId);
    } catch (error) {
      if (error instanceof Error && /pairing code is invalid/i.test(error.message)) continue;
      throw error;
    }
  }
  return null;
}
