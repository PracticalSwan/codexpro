import { createHash, randomBytes } from "node:crypto";
import type { SyncCallDeadlineMode } from "../deadline.js";
import { ContinuationStore, type ContinuationBinding } from "./store.js";
import {
  TERMINAL_CONTINUATION_STATES,
  defaultContinuationIntent,
  type ContinuationRecord,
  type ContinuationWatchdogRecord
} from "./types.js";

export const DEFAULT_CONTINUATION_COOLDOWN_MS = 60_000;
export const DEFAULT_MAX_CONTINUATION_DISPATCHES = 20;

export interface RuntimeContinuationSnapshot {
  runtimeGenerationId: string;
  syncCallDeadlineMode: SyncCallDeadlineMode;
  syncCallDeadlineMs: number;
  transportState: "ready" | "unavailable" | "unknown";
  observedAt: string;
}

export interface BrowserContinuationSnapshot {
  observationGenerationId: string;
  connected: boolean;
  longObservationGap?: boolean;
  authState: "signed_in" | "signed_out" | "authentication_required" | "ambiguous" | "unknown";
  conversationBound: boolean;
  composerReady: boolean;
  streaming: boolean;
  platformState: "idle" | "busy" | "error" | "blocked" | "unknown";
  blockingInteraction: boolean;
  recentUserInput: boolean;
}
export interface DurableContinuationWorkSnapshot {
  kind: "process" | "job" | "goal" | "batch";
  active: boolean;
  modelAttentionRequired: boolean;
}

export interface ContinuationReadinessInput {
  enabled: boolean;
  store: ContinuationStore;
  binding: ContinuationBinding;
  continuationId: string;
  expectedRevision: number;
  runtime: RuntimeContinuationSnapshot;
  browser: BrowserContinuationSnapshot;
  durableWork: DurableContinuationWorkSnapshot[];
  unexpectedInterruptionGraceMs: number;
  cooldownMs?: number;
  maxDispatches?: number;
  clockJumpDetected?: boolean;
  now?: number;
}

function requireEnabled(enabled: boolean): void {
  if (!enabled) throw new Error("continuation_disabled: task continuation is disabled for this runtime.");
}
function timestamp(ms: number): string { return new Date(ms).toISOString(); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function safeGeneration(value: string, label: string): string {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(text)) throw new Error(`invalid_${label}`);
  return text;
}
function watchdog(record: ContinuationRecord): ContinuationWatchdogRecord {
  if (!record.watchdog) record.watchdog = {};
  return record.watchdog;
}
function clearPrepared(record: ContinuationRecord): void {
  delete record.outstandingNonce;
  delete record.selectedContinuationIntentId;
  delete record.dispatchAuthorization;
  if (record.watchdog) delete record.watchdog.notificationKey;
}
function clearPendingAck(record: ContinuationRecord): void {
  if (!record.watchdog) return;
  delete record.watchdog.pendingAckNonceHash;
  delete record.watchdog.pendingAckDispatchRevision;
}
function clearAllActive(record: ContinuationRecord): void {
  clearPrepared(record);
  clearPendingAck(record);
  if (record.watchdog) delete record.watchdog.pendingExplicitRequest;
}
function explicitPending(record: ContinuationRecord): boolean {
  return record.state === "continuation_requested" || record.watchdog?.pendingExplicitRequest === true;
}
function readyNotificationKey(record: ContinuationRecord, nonce: string): string {
  return digest(`${record.id}\0${nonce}`);
}
function productiveDurableWork(work: DurableContinuationWorkSnapshot[]): boolean {
  return work.some((item) => item.active && !item.modelAttentionRequired);
}
function safeBrowser(browser: BrowserContinuationSnapshot): boolean {
  return browser.connected && browser.authState === "signed_in" && browser.conversationBound && browser.composerReady &&
    !browser.streaming && !browser.blockingInteraction && !browser.recentUserInput && browser.platformState === "idle";
}
function ensurePreparedNonce(record: ContinuationRecord): void {
  if (!record.outstandingNonce) record.outstandingNonce = randomBytes(32).toString("hex");
  if (!record.continuationIntents.length && record.remainingWork.length) {
    record.continuationIntents = [defaultContinuationIntent(record.revision + 1)];
  }
  if (!record.selectedContinuationIntentId) record.selectedContinuationIntentId = record.continuationIntents[0]?.id;
}
function acknowledgeDraft(record: ContinuationRecord, dispatchRevision: number, now: number, maxDispatches: number): void {
  const state = watchdog(record);
  if (state.pendingAckDispatchRevision !== dispatchRevision) throw new Error("stale_dispatch_ack");
  state.lastAcknowledgedDispatchRevision = dispatchRevision;
  state.lastAcknowledgedAt = timestamp(now);
  clearPendingAck(record);
  delete state.pendingExplicitRequest;
  record.state = record.continuationCount >= maxDispatches ? "manual_rearm_required" : "working";
}

export async function acknowledgeContinuationDispatch(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string;
  expectedRevision: number; dispatchRevision: number; maxDispatches?: number; now?: number;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) return current;
  if (current.watchdog?.lastAcknowledgedDispatchRevision === input.dispatchRevision) return current;
  if (current.state !== "awaiting_ack" || current.watchdog?.pendingAckDispatchRevision !== input.dispatchRevision) {
    throw new Error("stale_dispatch_ack");
  }
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    acknowledgeDraft(record, input.dispatchRevision, input.now ?? Date.now(), input.maxDispatches ?? DEFAULT_MAX_CONTINUATION_DISPATCHES);
    return record;
  });
}

export async function recordContinuationHeartbeat(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string;
  expectedRevision: number; maxDispatches?: number; now?: number;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) return current;
  const now = input.now ?? Date.now();
  if (current.state !== "awaiting_ack" || !current.watchdog?.pendingAckDispatchRevision) {
    return input.store.touchHeartbeat(input.continuationId, input.binding, { expectedRevision: input.expectedRevision, at: timestamp(now) });
  }
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.lastHeartbeatAt = timestamp(now);
    acknowledgeDraft(record, record.watchdog!.pendingAckDispatchRevision!, now, input.maxDispatches ?? DEFAULT_MAX_CONTINUATION_DISPATCHES);
    return record;
  });
}
export async function recordContinuationUserInteraction(input: {
  enabled: boolean; store: ContinuationStore; binding: ContinuationBinding; continuationId: string;
  expectedRevision: number; reason: "manual_message" | "stop_generating"; now?: number;
}): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (TERMINAL_CONTINUATION_STATES.has(current.state)) return current;
  if (current.state === "paused_by_user" && current.manualTurnPending?.reason === input.reason) return current;
  const now = input.now ?? Date.now();
  return input.store.update(input.continuationId, input.binding, { expectedRevision: input.expectedRevision }, (record) => {
    record.state = "paused_by_user";
    record.manualTurnPending = { reason: input.reason, observedAt: timestamp(now), observedRevision: record.revision };
    const state = watchdog(record);
    state.lastUserInteractionAt = timestamp(now);
    clearAllActive(record);
    return record;
  });
}

function suppressedTarget(record: ContinuationRecord): "working" | "continuation_requested" {
  return explicitPending(record) ? "continuation_requested" : "working";
}
function maybeClearReady(record: ContinuationRecord): void {
  if (["continuation_ready", "awaiting_user_send"].includes(record.state)) record.state = suppressedTarget(record);
  if (record.state !== "continuation_ready") {
    delete record.dispatchAuthorization;
    if (record.watchdog) delete record.watchdog.notificationKey;
  }
}
export async function evaluateContinuationReadiness(input: ContinuationReadinessInput): Promise<ContinuationRecord> {
  requireEnabled(input.enabled);
  if (!Number.isInteger(input.unexpectedInterruptionGraceMs) || input.unexpectedInterruptionGraceMs < 0 || input.unexpectedInterruptionGraceMs > 86_400_000) {
    throw new Error("invalid_unexpected_interruption_grace");
  }
  const maxDispatches = input.maxDispatches ?? DEFAULT_MAX_CONTINUATION_DISPATCHES;
  const cooldownMs = input.cooldownMs ?? DEFAULT_CONTINUATION_COOLDOWN_MS;
  if (!Number.isInteger(maxDispatches) || maxDispatches < 1 || maxDispatches > 100) throw new Error("invalid_max_dispatches");
  if (!Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 86_400_000) throw new Error("invalid_continuation_cooldown");
  const current = await input.store.requireForBinding(input.continuationId, input.binding);
  if (current.revision !== input.expectedRevision) throw new Error(`stale_continuation_revision: expected ${input.expectedRevision}, current ${current.revision}`);
  if (TERMINAL_CONTINUATION_STATES.has(current.state) || current.state === "paused_by_user" || current.state === "manual_rearm_required" || current.state === "awaiting_ack") return current;
  if (!current.remainingWork.length) {
    if (!["continuation_requested", "continuation_ready", "waiting_for_auth", "waiting_for_transport", "blocked_interaction"].includes(current.state)) return current;
    return input.store.update(input.continuationId, input.binding, { expectedRevision: current.revision }, (record) => {
      record.state = "working";
      clearAllActive(record);
      return record;
    });
  }
  const now = input.now ?? Date.now();
  const runtimeGenerationId = safeGeneration(input.runtime.runtimeGenerationId, "runtime_generation");
  const browserGenerationId = safeGeneration(input.browser.observationGenerationId, "browser_generation");
  const existing = current.watchdog ?? {};
  const pendingExplicit = explicitPending(current);
  const transportRecovered = existing.transportState !== undefined && existing.transportState !== "ready" && input.runtime.transportState === "ready";
  const runtimeChanged = existing.runtimeGenerationId !== runtimeGenerationId;
  const browserGapReset = existing.browserObservationGeneration !== undefined && existing.browserObservationGeneration !== browserGenerationId && input.browser.longObservationGap === true;
  const authRecovered = current.state === "waiting_for_auth" && input.browser.authState === "signed_in";
  const resetBaseline = runtimeChanged || transportRecovered || browserGapReset || input.clockJumpDetected === true || authRecovered;
  const observationChanged = existing.runtimeGenerationId !== runtimeGenerationId || existing.transportState !== input.runtime.transportState || existing.browserObservationGeneration !== browserGenerationId || resetBaseline;
  const applyObservation = (record: ContinuationRecord): ContinuationWatchdogRecord => {
    const state = watchdog(record);
    state.runtimeGenerationId = runtimeGenerationId;
    state.transportState = input.runtime.transportState;
    state.browserObservationGeneration = browserGenerationId;
    if (resetBaseline || !state.interruptionBaselineAt) state.interruptionBaselineAt = timestamp(now);
    return state;
  };
  const update = async (mutate: (record: ContinuationRecord) => void): Promise<ContinuationRecord> => {
    return input.store.update(input.continuationId, input.binding, { expectedRevision: current.revision }, (record) => {
      applyObservation(record);
      mutate(record);
      return record;
    });
  };

  if (current.continuationCount >= maxDispatches) {
    return update((record) => {
      record.state = "manual_rearm_required";
      clearAllActive(record);
    });
  }
  if (input.runtime.transportState !== "ready") {
    return update((record) => {
      const state = watchdog(record);
      state.pendingExplicitRequest = pendingExplicit || undefined;
      state.interruptionBaselineAt = timestamp(now);
      record.state = "waiting_for_transport";
      clearPrepared(record);
    });
  }
  if (input.browser.authState === "signed_out" || input.browser.authState === "authentication_required") {
    return update((record) => {
      const state = watchdog(record);
      state.pendingExplicitRequest = pendingExplicit || undefined;
      state.interruptionBaselineAt = timestamp(now);
      record.state = "waiting_for_auth";
      clearPrepared(record);
    });
  }
  if (input.browser.blockingInteraction || input.browser.platformState === "blocked") {
    if (current.state === "blocked_interaction" && !observationChanged) return current;
    return update((record) => {
      const state = watchdog(record);
      state.pendingExplicitRequest = pendingExplicit || undefined;
      record.state = "blocked_interaction";
      clearPrepared(record);
    });
  }
  if (!safeBrowser(input.browser)) {
    const target = pendingExplicit ? "continuation_requested" : "working";
    const alreadySuppressed = current.state === target && !current.outstandingNonce && !current.dispatchAuthorization && !current.watchdog?.notificationKey;
    if (alreadySuppressed && !observationChanged) return current;
    return update((record) => {
      const state = watchdog(record);
      state.pendingExplicitRequest = pendingExplicit || undefined;
      record.state = target;
      clearPrepared(record);
    });
  }

  const cooldownUntil = current.watchdog?.cooldownUntilAt ? Date.parse(current.watchdog.cooldownUntilAt) : 0;
  if (Number.isFinite(cooldownUntil) && now < cooldownUntil) {
    const target = pendingExplicit ? "continuation_requested" : "working";
    if (current.state === target && !observationChanged) return current;
    return update((record) => {
      watchdog(record).pendingExplicitRequest = pendingExplicit || undefined;
      record.state = target;
      if (record.watchdog) delete record.watchdog.notificationKey;
      delete record.dispatchAuthorization;
    });
  }
  if (productiveDurableWork(input.durableWork)) {
    const target = pendingExplicit ? "continuation_requested" : "working";
    if (current.state === target && !observationChanged) return current;
    return update((record) => {
      watchdog(record).pendingExplicitRequest = pendingExplicit || undefined;
      record.state = target;
      if (record.watchdog) delete record.watchdog.notificationKey;
      delete record.dispatchAuthorization;
    });
  }
  if (pendingExplicit) {
    if (current.state === "continuation_ready" && current.outstandingNonce && current.watchdog?.notificationKey && !resetBaseline && !observationChanged) return current;
    return update((record) => {
      const state = watchdog(record);
      state.pendingExplicitRequest = true;
      if (resetBaseline) clearPrepared(record);
      ensurePreparedNonce(record);
      if (!record.outstandingNonce || !record.selectedContinuationIntentId) throw new Error("continuation_not_prepared");
      record.state = "continuation_ready";
      state.notificationKey = readyNotificationKey(record, record.outstandingNonce);
    });
  }

  if (input.runtime.syncCallDeadlineMode !== "bounded") {
    if (!observationChanged && current.state === "working") return current;
    return update((record) => {
      record.state = "working";
      clearPrepared(record);
    });
  }
  if (resetBaseline || !current.watchdog?.interruptionBaselineAt) {
    return update((record) => {
      watchdog(record).interruptionBaselineAt = timestamp(now);
      record.state = "working";
      clearPrepared(record);
    });
  }
  if (!current.lastHeartbeatAt) {
    if (!observationChanged && current.state === "working") return current;
    return update((record) => { record.state = "working"; clearPrepared(record); });
  }
  const baselineAt = Date.parse(current.watchdog.interruptionBaselineAt);
  const heartbeatAt = Date.parse(current.lastHeartbeatAt);
  const anchor = Math.max(Number.isFinite(baselineAt) ? baselineAt : now, Number.isFinite(heartbeatAt) ? heartbeatAt : now);
  const threshold = input.runtime.syncCallDeadlineMs + input.unexpectedInterruptionGraceMs;
  if (now - anchor <= threshold) {
    if (!observationChanged && current.state === "working") return current;
    return update((record) => { record.state = "working"; clearPrepared(record); });
  }
  return update((record) => {
    const state = watchdog(record);
    delete state.pendingExplicitRequest;
    ensurePreparedNonce(record);
    if (!record.outstandingNonce || !record.selectedContinuationIntentId) throw new Error("continuation_not_prepared");
    record.state = "continuation_ready";
    state.notificationKey = readyNotificationKey(record, record.outstandingNonce);
  });
}
