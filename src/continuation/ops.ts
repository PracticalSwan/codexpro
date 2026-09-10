import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ContinuationStore, type ContinuationBinding } from "./store.js";
import {
  TERMINAL_CONTINUATION_STATES,
  defaultContinuationIntent,
  normalizeContinuationIntents,
  normalizeContinuationItems,
  publicContinuationRecord,
  type ContinuationDisposition,
  type ContinuationIntent,
  type ContinuationRecord,
  type ContinuationTemplateKey,
  type ContinuationDispatchSource
} from "./types.js";

export interface ContinuationIntentDraft {
  id?: string;
  templateKey: ContinuationTemplateKey;
  label: string;
  focusRef?: string;
}

function requireEnabled(enabled: boolean): void {
  if (!enabled) throw new Error("continuation_disabled: task continuation is disabled for this runtime.");
}

function boundedKey(value: unknown, label: string): string {
  const text = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  if (!text || text.length > 96 || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error(`${label} must be a bounded opaque id.`);
  return text;
}

function buildIntents(drafts: ContinuationIntentDraft[] | undefined, remainingWork: string[], revision: number): ContinuationIntent[] {
  const source = drafts?.length
    ? drafts.map((intent) => ({
        id: intent.id ?? `intent_${randomUUID()}`,
        templateKey: intent.templateKey,
        label: intent.label,
        ...(intent.focusRef ? { focusRef: intent.focusRef } : {})
      }))
    : remainingWork.length ? [defaultContinuationIntent(revision)] : [];
  return normalizeContinuationIntents(source, remainingWork, revision);
}

function reversionIntents(record: ContinuationRecord, revision: number): ContinuationIntent[] {
  const source = record.continuationIntents.length
    ? record.continuationIntents.map((intent) => ({ id: intent.id, templateKey: intent.templateKey, label: intent.label, ...(intent.focusRef ? { focusRef: intent.focusRef } : {}) }))
    : record.remainingWork.length ? [defaultContinuationIntent(revision)] : [];
  return normalizeContinuationIntents(source, record.remainingWork, revision);
}

function clearAuthorization(record: ContinuationRecord): void {
  delete record.outstandingNonce;
  delete record.selectedContinuationIntentId;
  delete record.dispatchAuthorization;
}

function clearWatchdogActiveState(record: ContinuationRecord): void {
  if (!record.watchdog) return;
  delete record.watchdog.notificationKey;
  delete record.watchdog.pendingExplicitRequest;
  delete record.watchdog.pendingAckNonceHash;
  delete record.watchdog.pendingAckDispatchRevision;
}

function clearTerminalState(record: ContinuationRecord): void {
  clearAuthorization(record);
  clearWatchdogActiveState(record);
  delete record.manualTurnPending;
  record.continuationIntents = [];
  delete record.conversationFingerprint;
}


export const FIXED_CONTINUATION_MESSAGE = "Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.";
const DISPATCH_AUTH_TTL_MS = 60_000;
const TELEGRAM_DISPATCH_AUTH_TTL_MS = 30_000;
function routeFingerprint(value: unknown): string {
  const text = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error("invalid_conversation_fingerprint");
  return text;
}
function tokenHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export async function bindContinuationConversation(input: { enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; conversationFingerprint: string; }): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const fingerprint = routeFingerprint(input.conversationFingerprint);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.revision !== input.expectedRevision) throw new Error(`stale_continuation_revision: expected ${input.expectedRevision}, current ${current.revision}.`);
  if (current.conversationFingerprint === fingerprint) return current;
  if (current.manualTurnPending) throw new Error("manual_turn_pending: reconcile the user turn before binding a conversation.");
  if (!["armed", "working", "continuation_requested", "continuation_ready"].includes(current.state)) throw new Error(`Continuation cannot bind from state ${current.state}.`);
  const readyRebind = current.state === "continuation_ready";
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.conversationFingerprint = fingerprint;
    if (readyRebind) {
      record.state = "continuation_requested";
      clearAuthorization(record);
      if (record.watchdog) {
        record.watchdog.pendingExplicitRequest = true;
        delete record.watchdog.notificationKey;
      }
    } else {
      delete record.dispatchAuthorization;
    }
    return record;
  });
}

export async function authorizeContinuationDispatch(input: { enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; conversationFingerprint: string; source: ContinuationDispatchSource; intentId?: string; now?: number; }): Promise<{ record: ContinuationRecord; token: string; message: string }> {
  requireEnabled(input.enabled);
  const fingerprint = routeFingerprint(input.conversationFingerprint);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state !== "continuation_ready") throw new Error(`continuation_not_ready: ${current.state}`);
  if (current.manualTurnPending) throw new Error("manual_turn_pending");
  if (!current.outstandingNonce || !current.selectedContinuationIntentId) throw new Error("stale_continuation_nonce");
  if (current.conversationFingerprint !== fingerprint) throw new Error("wrong_chat");
  const selectedIntentId = input.intentId ?? current.selectedContinuationIntentId;
  if (!current.continuationIntents.some((intent) => intent.id === selectedIntentId)) throw new Error("stale_continuation_intent");
  const token = randomBytes(32).toString("hex"); const now = input.now ?? Date.now();
  const ttlMs = input.source === "telegram" ? TELEGRAM_DISPATCH_AUTH_TTL_MS : DISPATCH_AUTH_TTL_MS;
  const record = await input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (draft) => {
    draft.state = "awaiting_user_send";
    draft.selectedContinuationIntentId = selectedIntentId;
    draft.dispatchAuthorization = { tokenHash: tokenHash(token), source: input.source, authorizedAt: new Date(now).toISOString(), expiresAt: new Date(now + ttlMs).toISOString(), routeFingerprint: fingerprint };
    return draft;
  });
  return { record, token, message: FIXED_CONTINUATION_MESSAGE };
}

export async function completeContinuationDispatch(input: { store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; conversationFingerprint: string; token: string; now?: number; cooldownMs?: number; }): Promise<ContinuationRecord> {
  const fingerprint = routeFingerprint(input.conversationFingerprint); const current = await input.store.requireForBinding(input.continuationId, input.binding); const auth = current.dispatchAuthorization;
  if (current.state !== "awaiting_user_send" || !auth) throw new Error("dispatch_authorization_missing");
  if (!current.outstandingNonce) throw new Error("stale_continuation_nonce");
  if (auth.routeFingerprint !== fingerprint || current.conversationFingerprint !== fingerprint) throw new Error("wrong_chat");
  if (auth.tokenHash !== tokenHash(String(input.token ?? ""))) throw new Error("dispatch_authorization_invalid");
  const now = input.now ?? Date.now();
  if (now > Date.parse(auth.expiresAt)) throw new Error("dispatch_authorization_expired");
  const cooldownMs = input.cooldownMs ?? 60_000;
  if (!Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 86_400_000) throw new Error("invalid_continuation_cooldown");
  const pendingAckNonceHash = tokenHash(current.outstandingNonce);
  const dispatchRevision = current.revision + 1;
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "awaiting_ack";
    record.lastDispatchAt = new Date(now).toISOString();
    record.continuationCount += 1;
    record.watchdog ??= {};
    record.watchdog.pendingAckNonceHash = pendingAckNonceHash;
    record.watchdog.pendingAckDispatchRevision = dispatchRevision;
    record.watchdog.cooldownUntilAt = new Date(now + cooldownMs).toISOString();
    delete record.watchdog.notificationKey;
    clearAuthorization(record);
    return record;
  });
}

export async function releaseContinuationDispatch(input: { store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; token: string; }): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding); const auth = current.dispatchAuthorization;
  if (current.state !== "awaiting_user_send" || !auth || auth.tokenHash !== tokenHash(String(input.token ?? ""))) throw new Error("dispatch_authorization_invalid");
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => { record.state = "continuation_ready"; delete record.dispatchAuthorization; return record; });
}
export async function armContinuation(input: {
  enabled: boolean;
  store: ContinuationStore;
  binding: ContinuationBinding;
  title: string;
  continuationId?: string;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  if (input.continuationId) {
    try {
      const existing = await input.store.requireForBinding(input.continuationId, input.binding);
      if (TERMINAL_CONTINUATION_STATES.has(existing.state)) throw new Error(`Continuation is terminal: ${existing.state}.`);
      return existing;
    } catch (error) {
      if (!String(error).includes("Unknown continuation id")) throw error;
    }
  }
  return input.store.createActive({ ...input.binding, title: input.title, ...(input.continuationId ? { id: input.continuationId } : {}) });
}

export async function reassociateContinuationSession(input: {
  enabled: boolean;
  store: ContinuationStore;
  workspace: ContinuationBinding["workspace"];
  continuationId: string;
  newSessionId: string;
  previousSessionActive: boolean;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  if (input.previousSessionActive) throw new Error("continuation_previous_session_active: previous MCP session is still active.");
  return input.store.reassociateSession(input.continuationId, input.workspace, input.newSessionId);
}

export async function checkpointContinuation(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
  checkpointId: string; currentPhase?: string; completedEvidence: string[]; remainingWork: string[]; intents?: ContinuationIntentDraft[];
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const checkpointId = boundedKey(input.checkpointId, "checkpoint_id");
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.lastCheckpointId === checkpointId) return current;
  if (current.manualTurnPending) throw new Error("manual_turn_pending: reconcile the user turn before checkpointing.");
  if (!["armed", "working", "continuation_requested"].includes(current.state)) throw new Error(`Continuation cannot checkpoint from state ${current.state}.`);
  const completedEvidence = normalizeContinuationItems(input.completedEvidence, "Completed evidence");
  const remainingWork = normalizeContinuationItems(input.remainingWork, "Remaining work");
  const nextRevision = current.revision + 1;
  const intents = buildIntents(input.intents, remainingWork, nextRevision);
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "working";
    if (input.currentPhase?.trim()) record.currentPhase = input.currentPhase; else delete record.currentPhase;
    record.completedEvidence = completedEvidence;
    record.remainingWork = remainingWork;
    record.continuationIntents = intents;
    record.lastCheckpointId = checkpointId;
    clearAuthorization(record);
    clearWatchdogActiveState(record);
    return record;
  });
}

export async function requestContinuation(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
  requestId: string; selectedIntentId?: string;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const requestId = boundedKey(input.requestId, "request_id");
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.lastRequestId === requestId) return current;
  if (current.manualTurnPending) throw new Error("manual_turn_pending: reconcile the user turn before requesting continuation.");
  if (!["armed", "working", "continuation_requested"].includes(current.state)) throw new Error(`Continuation cannot be requested from state ${current.state}.`);
  const nextRevision = current.revision + 1;
  const intents = reversionIntents(current, nextRevision);
  if (input.selectedIntentId && !intents.some((intent) => intent.id === input.selectedIntentId)) throw new Error("Selected continuation intent is not available.");
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "continuation_requested";
    record.continuationIntents = intents;
    record.selectedContinuationIntentId = input.selectedIntentId ?? intents[0]?.id;
    record.outstandingNonce = randomBytes(32).toString("hex");
    record.lastRequestId = requestId;
    return record;
  });
}

export async function observeContinuationManualTurn(input: {
  store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
  reason: "manual_message" | "stop_generating";
}): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state === "paused_by_user" && current.manualTurnPending?.reason === input.reason) return current;
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) throw new Error(`Continuation is terminal: ${current.state}.`);
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "paused_by_user";
    record.manualTurnPending = { reason: input.reason, observedAt: new Date().toISOString(), observedRevision: record.revision };
    clearAuthorization(record);
    clearWatchdogActiveState(record);
    return record;
  });
}

export async function reconcileContinuationManualTurn(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
  disposition: ContinuationDisposition; replacementCurrentPhase?: string; replacementRemainingWork?: string[]; replacementIntents?: ContinuationIntentDraft[];
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state !== "paused_by_user" || !current.manualTurnPending) throw new Error("Continuation has no pending manual turn to reconcile.");
  const nextRevision = current.revision + 1;
  let replacementRemaining: string[] | undefined;
  let replacementIntents: ContinuationIntent[] | undefined;
  if (input.disposition === "redirect") {
    if (!input.replacementRemainingWork) throw new Error("redirect requires replacement remaining work.");
    replacementRemaining = normalizeContinuationItems(input.replacementRemainingWork, "Replacement remaining work");
    replacementIntents = buildIntents(input.replacementIntents, replacementRemaining, nextRevision);
  }
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    clearAuthorization(record);
    if (input.disposition === "supersede" || input.disposition === "cancel") {
      record.state = "canceled";
      record.cancelReason = input.disposition === "supersede" ? "superseded_by_user" : "user_canceled";
      clearTerminalState(record);
      return record;
    }
    record.state = "working";
    delete record.manualTurnPending;
    delete record.cancelReason;
    if (input.disposition === "redirect") {
      if (input.replacementCurrentPhase?.trim()) record.currentPhase = input.replacementCurrentPhase; else delete record.currentPhase;
      record.remainingWork = replacementRemaining!;
      record.continuationIntents = replacementIntents!;
    } else {
      record.continuationIntents = reversionIntents(record, nextRevision);
    }
    return record;
  });
}

export async function completeContinuation(input: {
  store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; verifiedComplete?: boolean;
}): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state === "completed") return current;
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) throw new Error(`Continuation is terminal: ${current.state}.`);
  if (current.remainingWork.length && input.verifiedComplete !== true) throw new Error("continuation_incomplete: remaining work is not empty and verified_complete was not supplied.");
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "completed";
    record.remainingWork = [];
    clearTerminalState(record);
    return record;
  });
}

export async function cancelContinuation(input: {
  store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
  reason?: "user_canceled" | "superseded_by_user";
}): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state === "canceled") return current;
  if (current.state === "completed" || current.state === "error") throw new Error(`Continuation is terminal: ${current.state}.`);
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "canceled";
    record.cancelReason = input.reason ?? "user_canceled";
    clearTerminalState(record);
    return record;
  });
}

export async function heartbeatContinuation(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) throw new Error(`Continuation is terminal: ${current.state}.`);
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.lastHeartbeatAt = new Date().toISOString();
    return record;
  });
}

export async function continuationStatus(store: ContinuationStore, binding: ContinuationBinding, continuationId: string): Promise<Record<string, unknown>> {
  return publicContinuationRecord(await store.requireForBinding(continuationId, binding));
}

export async function rejectTelegramContinuationDispatch(input: {
  store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number;
}): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.state !== "awaiting_user_send" || current.dispatchAuthorization?.source !== "telegram") throw new Error("dispatch_authorization_missing");
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "continuation_ready";
    delete record.dispatchAuthorization;
    if (record.watchdog) delete record.watchdog.notificationKey;
    return record;
  });
}

export async function expireContinuationDispatchAuthorization(input: {
  store: ContinuationStore; binding: ContinuationBinding; continuationId: string; expectedRevision: number; now?: number;
}): Promise<ContinuationRecord> {
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  const auth = current.dispatchAuthorization;
  if (current.state !== "awaiting_user_send" || !auth) return current;
  if ((input.now ?? Date.now()) <= Date.parse(auth.expiresAt)) return current;
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "continuation_ready";
    delete record.dispatchAuthorization;
    if (record.watchdog) delete record.watchdog.notificationKey;
    return record;
  });
}
