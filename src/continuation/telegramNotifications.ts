import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { ContinuationIntent, ContinuationRecord } from "./types.js";
import type { TelegramPairedIdentity } from "./telegramPairing.js";

interface StoredTelegramAction {
  version: 1;
  telegramUserId: string;
  privateChatId: string;
  botId: string;
  taskId: string;
  revision: number;
  nonceHash: string;
  intentId: string;
  expiresAt: string;
}

export interface TelegramNotificationAction {
  label: string;
  callbackData: string;
  intentId: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function telegramNotificationOpportunityKey(task: Pick<ContinuationRecord, "id" | "lastRequestId" | "lastCheckpointId" | "continuationCount" | "continuationIntents">): string {
  const intents = task.continuationIntents
    .map((intent) => `${intent.id}:${intent.templateKey}:${intent.focusRef ?? ""}`)
    .sort()
    .join("\n");
  return sha256(`${task.id}\0${task.lastRequestId ?? ""}\0${task.lastCheckpointId ?? ""}\0${task.continuationCount}\0${intents}`);
}

async function ensureProtectedDirectory(dir: string): Promise<void> {
  const resolved = path.resolve(dir);
  try {
    const stat = await fsp.lstat(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("telegram_private_state_unsafe");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await fsp.mkdir(resolved, { recursive: true, mode: 0o700 });
    const stat = await fsp.lstat(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("telegram_private_state_unsafe");
  }
  if (process.platform !== "win32") await fsp.chmod(resolved, 0o700);
}

function safeButtonLabel(value: unknown, fallback: string): string {
  let text = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  text = text.replace(/https?:\/\/\S+/gi, "").replace(/[A-Za-z]:\\\S+/g, "").replace(/\/(?:[^\s/]+\/)+[^\s]*/g, "");
  text = text.replace(/\b[A-Za-z0-9_-]{24,}\b/g, "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, 40);
}

function selectedIntents(task: Pick<ContinuationRecord, "continuationIntents">): ContinuationIntent[] {
  const resume = task.continuationIntents.find((intent) => intent.templateKey === "resume_all_v1");
  const focused = task.continuationIntents.filter((intent) => intent.templateKey === "focus_remaining_v1").slice(0, 3);
  return [...(resume ? [resume] : []), ...focused].slice(0, 4);
}

async function writeAction(stateDir: string, token: string, record: StoredTelegramAction): Promise<void> {
  const root = path.resolve(stateDir);
  const actionsDir = path.join(root, "actions");
  await ensureProtectedDirectory(root);
  await ensureProtectedDirectory(actionsDir);
  const file = path.join(actionsDir, `${sha256(token)}.json`);
  await fsp.writeFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

export async function createTelegramNotification(input: {
  stateDir: string;
  paired: TelegramPairedIdentity;
  task: Pick<ContinuationRecord, "id" | "revision" | "state" | "outstandingNonce" | "continuationIntents">;
  now?: number;
}): Promise<{ text: string; actions: TelegramNotificationAction[]; replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } }> {
  if (input.task.state !== "continuation_ready" || !input.task.outstandingNonce) throw new Error("Telegram notification requires a continuation-ready task with a current nonce.");
  const now = input.now ?? Date.now();
  const expiresAt = new Date(now + 5 * 60 * 60_000).toISOString();
  const intents = selectedIntents(input.task);
  if (!intents.length) throw new Error("Telegram notification requires at least one continuation intent.");
  const actions: TelegramNotificationAction[] = [];
  for (const intent of intents) {
    const token = randomBytes(24).toString("base64url");
    const label = intent.templateKey === "resume_all_v1" ? "Continue" : safeButtonLabel(intent.label, "Focus");
    await writeAction(path.resolve(input.stateDir), token, {
      version: 1, telegramUserId: input.paired.telegramUserId, privateChatId: input.paired.privateChatId, botId: input.paired.botId,
      taskId: input.task.id, revision: input.task.revision, nonceHash: sha256(input.task.outstandingNonce), intentId: intent.id, expiresAt
    });
    actions.push({ label, callbackData: token, intentId: intent.id });
  }
  const shortId = input.task.id.replace(/^continuation_/, "").slice(0, 8);
  const text = `CodexPro continuation ready\nTask ${shortId}\nStatus: ready\nPhase: active`;
  return { text, actions, replyMarkup: { inline_keyboard: actions.map((action) => [{ text: action.label, callback_data: action.callbackData }]) } };
}

export async function consumeTelegramAction(input: {
  stateDir: string;
  token: string;
  paired: TelegramPairedIdentity;
  task: Pick<ContinuationRecord, "id" | "revision" | "state" | "outstandingNonce" | "continuationIntents">;
  now?: number;
}): Promise<{ intentId: string }> {
  const token = String(input.token ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new Error("telegram_action_invalid");
  const source = path.join(path.resolve(input.stateDir), "actions", `${sha256(token)}.json`);
  const claim = `${source}.${process.pid}.${randomBytes(4).toString("hex")}.claim`;
  try { await fsp.rename(source, claim); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("telegram_action_invalid_or_used"); throw error; }
  try {
    const stat = await fsp.lstat(claim);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("telegram_action_invalid");
    const record = JSON.parse(await fsp.readFile(claim, "utf8")) as StoredTelegramAction;
    if (record.version !== 1) throw new Error("telegram_action_invalid");
    if (record.telegramUserId !== input.paired.telegramUserId || record.privateChatId !== input.paired.privateChatId || record.botId !== input.paired.botId) throw new Error("telegram_action_wrong_user");
    if (input.task.state !== "continuation_ready" || !input.task.outstandingNonce) throw new Error("telegram_action_task_not_ready");
    if (record.taskId !== input.task.id || record.revision !== input.task.revision || record.nonceHash !== sha256(input.task.outstandingNonce)) throw new Error("telegram_action_stale");
    if ((input.now ?? Date.now()) > Date.parse(record.expiresAt)) throw new Error("telegram_action_expired");
    if (!input.task.continuationIntents.some((intent) => intent.id === record.intentId)) throw new Error("telegram_action_intent_stale");
    return { intentId: record.intentId };
  } finally {
    await fsp.rm(claim, { force: true }).catch(() => undefined);
  }
}

export async function invalidateTelegramActions(stateDir: string): Promise<void> {
  await fsp.rm(path.join(path.resolve(stateDir), "actions"), { recursive: true, force: true });
}

export async function invalidateTelegramActionsForTask(stateDir: string, taskId: string, keepRevision?: number): Promise<void> {
  if (!/^continuation_[A-Za-z0-9-]{1,80}$/.test(taskId)) throw new Error("telegram_action_invalid_task");
  if (keepRevision !== undefined && (!Number.isInteger(keepRevision) || keepRevision < 1)) throw new Error("telegram_action_invalid_revision");
  const actionsDir = path.join(path.resolve(stateDir), "actions");
  let names: string[];
  try {
    const dirStat = await fsp.lstat(actionsDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error("telegram_private_state_unsafe");
    names = await fsp.readdir(actionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (names.length > 512) throw new Error("telegram_action_state_unbounded");
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const file = path.join(actionsDir, name);
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("telegram_private_state_unsafe");
    const record = JSON.parse(await fsp.readFile(file, "utf8")) as StoredTelegramAction;
    if (record.version === 1 && record.taskId === taskId && (keepRevision === undefined || record.revision !== keepRevision)) await fsp.rm(file, { force: true });
  }
}

interface StoredTelegramDispatchGrant {
  version: 1;
  taskId: string;
  revision: number;
  conversationFingerprint: string;
  authorizationToken: string;
  expiresAt: string;
}

function dispatchGrantFile(stateDir: string, taskId: string): string {
  return path.join(path.resolve(stateDir), "dispatch", `${sha256(taskId)}.json`);
}

export async function storeTelegramDispatchGrant(stateDir: string, grant: {
  taskId: string; revision: number; conversationFingerprint: string; authorizationToken: string; expiresAt: string;
}): Promise<void> {
  if (!/^continuation_[A-Za-z0-9-]{1,80}$/.test(grant.taskId)) throw new Error("telegram_dispatch_grant_invalid_task");
  if (!Number.isInteger(grant.revision) || grant.revision < 1) throw new Error("telegram_dispatch_grant_invalid_revision");
  if (!/^[a-f0-9]{64}$/.test(grant.conversationFingerprint) || !/^[a-f0-9]{64}$/.test(grant.authorizationToken)) throw new Error("telegram_dispatch_grant_invalid_secret");
  if (!Number.isFinite(Date.parse(grant.expiresAt))) throw new Error("telegram_dispatch_grant_invalid_expiry");
  const root = path.resolve(stateDir);
  const file = dispatchGrantFile(root, grant.taskId);
  await ensureProtectedDirectory(root);
  await ensureProtectedDirectory(path.dirname(file));
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify({ version: 1, ...grant })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  if (process.platform === "win32") await fsp.rm(file, { force: true });
  await fsp.rename(tmp, file);
}

export async function consumeTelegramDispatchGrant(stateDir: string, input: {
  taskId: string; revision: number; conversationFingerprint: string; now?: number;
}): Promise<{ authorizationToken: string; expiresAt: string }> {
  const source = dispatchGrantFile(stateDir, input.taskId);
  const claim = `${source}.${process.pid}.${randomBytes(4).toString("hex")}.claim`;
  try { await fsp.rename(source, claim); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("telegram_dispatch_grant_missing_or_used"); throw error; }
  try {
    const stat = await fsp.lstat(claim);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("telegram_dispatch_grant_invalid");
    const record = JSON.parse(await fsp.readFile(claim, "utf8")) as StoredTelegramDispatchGrant;
    if (record.version !== 1 || record.taskId !== input.taskId || record.revision !== input.revision || record.conversationFingerprint !== input.conversationFingerprint) throw new Error("telegram_dispatch_grant_stale");
    if (!/^[a-f0-9]{64}$/.test(record.authorizationToken)) throw new Error("telegram_dispatch_grant_invalid");
    if ((input.now ?? Date.now()) > Date.parse(record.expiresAt)) throw new Error("telegram_dispatch_grant_expired");
    return { authorizationToken: record.authorizationToken, expiresAt: record.expiresAt };
  } finally {
    await fsp.rm(claim, { force: true }).catch(() => undefined);
  }
}

export async function clearTelegramDispatchGrant(stateDir: string, taskId: string): Promise<void> {
  await fsp.rm(dispatchGrantFile(stateDir, taskId), { force: true });
}

function runtimeDisableFile(stateDir: string): string {
  return path.join(path.resolve(stateDir), "authorization-disabled.json");
}

export async function telegramRuntimeAuthorizationDisabled(stateDir: string): Promise<boolean> {
  const file = runtimeDisableFile(stateDir);
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("telegram_runtime_disable_state_unsafe");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function setTelegramRuntimeAuthorizationDisabled(stateDir: string, disabled: boolean): Promise<void> {
  const file = runtimeDisableFile(stateDir);
  if (!disabled) {
    if (await telegramRuntimeAuthorizationDisabled(stateDir)) await fsp.rm(file, { force: true });
    return;
  }
  await ensureProtectedDirectory(path.dirname(file));
  if (await telegramRuntimeAuthorizationDisabled(stateDir)) return;
  await fsp.writeFile(file, `${JSON.stringify({ version: 1 })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
}

async function removeProtectedStatePath(stateDir: string, name: "actions" | "dispatch" | "sent"): Promise<void> {
  const target = path.join(path.resolve(stateDir), name);
  try {
    const stat = await fsp.lstat(target);
    if (stat.isSymbolicLink()) throw new Error("telegram_private_state_unsafe");
    await fsp.rm(target, { recursive: stat.isDirectory(), force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function invalidateTelegramDispatchGrants(stateDir: string): Promise<void> {
  await removeProtectedStatePath(stateDir, "dispatch");
}

export async function invalidateTelegramNotificationState(stateDir: string): Promise<void> {
  await removeProtectedStatePath(stateDir, "actions");
  await removeProtectedStatePath(stateDir, "dispatch");
  await removeProtectedStatePath(stateDir, "sent");
}

function sentMarkerFile(stateDir: string, notificationKey: string): string {
  if (!/^[a-f0-9]{64}$/.test(notificationKey)) throw new Error("telegram_notification_key_invalid");
  return path.join(path.resolve(stateDir), "sent", `${notificationKey}.json`);
}

export interface TelegramNotificationMarker {
  state: "pending" | "sent";
  messageId?: number;
  revision?: number;
}

export async function readTelegramNotificationMarker(stateDir: string, notificationKey: string): Promise<TelegramNotificationMarker | null> {
  const file = sentMarkerFile(stateDir, notificationKey);
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("telegram_notification_state_unsafe");
    const value = JSON.parse(await fsp.readFile(file, "utf8"));
    if (value?.version !== 1 || (value?.state !== "pending" && value?.state !== "sent")) throw new Error("telegram_notification_state_unsafe");
    const revision = value?.revision === undefined ? undefined : Number(value.revision);
    if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new Error("telegram_notification_state_unsafe");
    if (value.state === "pending") return { state: "pending", ...(revision !== undefined ? { revision } : {}) };
    const messageId = Number(value?.messageId);
    if (!Number.isInteger(messageId) || messageId < 1) throw new Error("telegram_notification_state_unsafe");
    return { state: "sent", messageId, ...(revision !== undefined ? { revision } : {}) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function telegramNotificationWasSent(stateDir: string, notificationKey: string): Promise<boolean> {
  return (await readTelegramNotificationMarker(stateDir, notificationKey)) !== null;
}

export async function claimTelegramNotificationSend(stateDir: string, notificationKey: string, revision?: number): Promise<boolean> {
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new Error("telegram_notification_revision_invalid");
  const root = path.resolve(stateDir);
  const file = sentMarkerFile(root, notificationKey);
  await ensureProtectedDirectory(root);
  await ensureProtectedDirectory(path.dirname(file));
  try {
    await fsp.writeFile(file, `${JSON.stringify({ version: 1, state: "pending", ...(revision !== undefined ? { revision } : {}) })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("telegram_notification_state_unsafe");
    return false;
  }
}

export async function markTelegramNotificationSent(stateDir: string, notificationKey: string, messageId: unknown, revision?: number): Promise<void> {
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) throw new Error("telegram_notification_revision_invalid");
  const root = path.resolve(stateDir);
  const file = sentMarkerFile(root, notificationKey);
  await ensureProtectedDirectory(root);
  await ensureProtectedDirectory(path.dirname(file));
  const numericMessageId = Number(messageId);
  if (!Number.isInteger(numericMessageId) || numericMessageId < 1) throw new Error("telegram_message_id_invalid");
  try {
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("telegram_notification_state_unsafe");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await fsp.writeFile(tmp, `${JSON.stringify({ version: 1, state: "sent", messageId: numericMessageId, ...(revision !== undefined ? { revision } : {}) })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    if (process.platform === "win32") await fsp.rm(file, { force: true });
    await fsp.rename(tmp, file);
  } finally {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
  }
}

export async function takeStaleTelegramNotificationMessageIds(stateDir: string, keepNotificationKey?: string): Promise<number[]> {
  if (keepNotificationKey !== undefined && !/^[a-f0-9]{64}$/.test(keepNotificationKey)) throw new Error("telegram_notification_key_invalid");
  const sentDir = path.join(path.resolve(stateDir), "sent");
  let names: string[];
  try {
    const dirStat = await fsp.lstat(sentDir);
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) throw new Error("telegram_notification_state_unsafe");
    names = await fsp.readdir(sentDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (names.length > 256) throw new Error("telegram_notification_state_unbounded");
  const messageIds: number[] = [];
  for (const name of names) {
    const match = /^([a-f0-9]{64})\.json$/.exec(name);
    if (!match || match[1] === keepNotificationKey) continue;
    const file = path.join(sentDir, name);
    const stat = await fsp.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error("telegram_notification_state_unsafe");
    const value = JSON.parse(await fsp.readFile(file, "utf8"));
    const messageId = Number(value?.messageId);
    if (Number.isInteger(messageId) && messageId > 0) messageIds.push(messageId);
    await fsp.rm(file, { force: true });
  }
  return messageIds;
}

export async function peekTelegramActionTaskId(stateDir: string, token: string): Promise<string> {
  const value = String(token ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(value)) throw new Error("telegram_action_invalid");
  const file = path.join(path.resolve(stateDir), "actions", `${sha256(value)}.json`);
  const stat = await fsp.lstat(file).catch((error) => { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("telegram_action_invalid_or_used"); throw error; });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16 * 1024) throw new Error("telegram_action_invalid");
  const record = JSON.parse(await fsp.readFile(file, "utf8")) as StoredTelegramAction;
  if (record.version !== 1 || !/^continuation_[A-Za-z0-9-]{1,80}$/.test(record.taskId)) throw new Error("telegram_action_invalid");
  return record.taskId;
}
