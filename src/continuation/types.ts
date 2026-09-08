import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "../redact.js";

export const CONTINUATION_STATES = [
  "armed", "working", "continuation_requested", "continuation_ready", "awaiting_user_send", "awaiting_ack", "dispatched",
  "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "manual_rearm_required",
  "completed", "canceled", "error"
] as const;
export type ContinuationState = typeof CONTINUATION_STATES[number];
export type ContinuationDisposition = "resume" | "redirect" | "supersede" | "cancel";
export type ContinuationTemplateKey = "resume_all_v1" | "focus_remaining_v1";
export type ContinuationCancelReason = "user_canceled" | "superseded_by_user";
export type ContinuationDispatchSource = "browser" | "telegram";

export interface ContinuationDispatchAuthorizationRecord {
  tokenHash: string;
  source: ContinuationDispatchSource;
  authorizedAt: string;
  expiresAt: string;
  routeFingerprint: string;
}

export interface ContinuationIntent {
  id: string;
  templateKey: ContinuationTemplateKey;
  label: string;
  focusRef?: string;
  revision: number;
}

export interface ManualTurnPending {
  reason: "manual_message" | "stop_generating";
  observedAt: string;
  observedRevision: number;
}

export interface ContinuationWatchdogRecord {
  runtimeGenerationId?: string;
  transportState?: "ready" | "unavailable" | "unknown";
  browserObservationGeneration?: string;
  interruptionBaselineAt?: string;
  pendingExplicitRequest?: boolean;
  pendingAckNonceHash?: string;
  pendingAckDispatchRevision?: number;
  lastAcknowledgedDispatchRevision?: number;
  lastAcknowledgedAt?: string;
  lastUserInteractionAt?: string;
  notificationKey?: string;
  cooldownUntilAt?: string;
}

export interface ContinuationRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  mcpSessionId?: string;
  revision: number;
  state: ContinuationState;
  title: string;
  currentPhase?: string;
  completedEvidence: string[];
  remainingWork: string[];
  continuationIntents: ContinuationIntent[];
  selectedContinuationIntentId?: string;
  manualTurnPending?: ManualTurnPending;
  cancelReason?: ContinuationCancelReason;
  conversationFingerprint?: string;
  dispatchAuthorization?: ContinuationDispatchAuthorizationRecord;
  lastDispatchAt?: string;
  continuationCount: number;
  outstandingNonce?: string;
  lastCheckpointId?: string;
  lastRequestId?: string;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
  watchdog?: ContinuationWatchdogRecord;
}

export const TERMINAL_CONTINUATION_STATES = new Set<ContinuationState>(["completed", "canceled", "error"]);

const MAX_RECORD_BYTES = 128 * 1024;
const MAX_TITLE_CHARS = 160;
const MAX_PHASE_CHARS = 240;
const MAX_ITEM_CHARS = 400;
const MAX_ITEMS = 64;

function strictIdentityText(value: unknown, label: string, maxChars: number, required = true): string | undefined {
  if (value === undefined || value === null || value === "") { if (required) throw new Error(`${label} is required.`); return undefined; }
  const text = String(value);
  if (/[\r\n\0]/.test(text)) throw new Error(`${label} contains invalid control characters.`);
  if (text.length > maxChars) throw new Error(`${label} exceeds ${maxChars} characters.`);
  return text;
}

function strictText(value: unknown, label: string, maxChars: number, required = true): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }
  const text = redactSensitiveText(String(value)).replace(/[\r\n\0]+/g, " ").trim();
  if (!text && required) throw new Error(`${label} is required.`);
  if (text.length > maxChars) throw new Error(`${label} exceeds ${maxChars} characters.`);
  return text || undefined;
}

function strictId(value: unknown, prefix: "continuation" | "intent", label: string): string {
  const text = String(value ?? "");
  const pattern = prefix === "continuation" ? /^continuation_[A-Za-z0-9-]{1,80}$/ : /^intent_[A-Za-z0-9-]{1,80}$/;
  if (!pattern.test(text)) throw new Error(`Invalid ${label}.`);
  return text;
}

function strictTimestamp(value: unknown, label: string): string {
  const text = String(value ?? "");
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error(`Invalid ${label}.`);
  return text;
}

export function normalizeContinuationItems(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length > MAX_ITEMS) throw new Error(`${label} exceeds ${MAX_ITEMS} entries.`);
  return value.map((item, index) => strictText(item, `${label}[${index}]`, MAX_ITEM_CHARS)!);
}

export function normalizeContinuationIntents(
  value: unknown,
  remainingWork: string[],
  revision: number
): ContinuationIntent[] {
  if (!Array.isArray(value)) throw new Error("Continuation intents must be an array.");
  if (value.length > 4) throw new Error("Continuation intents exceed 4 entries.");
  const ids = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Continuation intent ${index} is malformed.`);
    const input = raw as Record<string, unknown>;
    const id = strictId(input.id, "intent", "continuation intent id");
    if (ids.has(id)) throw new Error("Continuation intent ids must be unique.");
    ids.add(id);
    const templateKey = input.templateKey;
    if (templateKey !== "resume_all_v1" && templateKey !== "focus_remaining_v1") throw new Error("Invalid continuation intent template key.");
    const label = strictText(input.label, "Continuation intent label", 80)!;
    const focusRef = strictText(input.focusRef, "Continuation focus reference", MAX_ITEM_CHARS, false);
    if (focusRef && !remainingWork.includes(focusRef)) throw new Error("Continuation focus reference must match recorded remaining work.");
    if (templateKey === "focus_remaining_v1" && !focusRef) throw new Error("Focused continuation intent requires a focus reference.");
    return { id, templateKey, label, ...(focusRef ? { focusRef } : {}), revision };
  });
}

export function defaultContinuationIntent(revision: number): ContinuationIntent {
  return { id: `intent_${randomUUID()}`, templateKey: "resume_all_v1", label: "Continue remaining work", revision };
}

const ALLOWED_RECORD_KEYS = new Set([
  "schemaVersion", "id", "workspaceId", "workspaceRoot", "mcpSessionId", "revision", "state", "title", "currentPhase",
  "completedEvidence", "remainingWork", "continuationIntents", "selectedContinuationIntentId", "manualTurnPending", "cancelReason",
  "continuationCount", "outstandingNonce", "lastCheckpointId", "lastRequestId", "createdAt", "updatedAt", "lastHeartbeatAt",
  "conversationFingerprint", "dispatchAuthorization", "lastDispatchAt", "watchdog"
]);

export function validateContinuationRecord(value: unknown): ContinuationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed continuation record.");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) if (!ALLOWED_RECORD_KEYS.has(key)) throw new Error(`Unsupported continuation record field: ${key}`);
  if (raw.schemaVersion !== 1) throw new Error("Unsupported continuation record schema version.");
  const id = strictId(raw.id, "continuation", "continuation id");
  const workspaceId = strictIdentityText(raw.workspaceId, "Continuation workspace id", 160)!;
  const workspaceRoot = strictIdentityText(raw.workspaceRoot, "Continuation workspace root", 2048)!;
  const mcpSessionId = strictIdentityText(raw.mcpSessionId, "Continuation MCP session id", 160, false);
  if (mcpSessionId && !/^[A-Za-z0-9._:-]{1,160}$/.test(mcpSessionId)) throw new Error("Invalid continuation MCP session id.");
  if (!Number.isInteger(raw.revision) || Number(raw.revision) < 1) throw new Error("Invalid continuation revision.");
  if (!CONTINUATION_STATES.includes(raw.state as ContinuationState)) throw new Error("Invalid continuation state.");
  const title = strictText(raw.title, "Continuation title", MAX_TITLE_CHARS)!;
  const currentPhase = strictText(raw.currentPhase, "Continuation phase", MAX_PHASE_CHARS, false);
  const completedEvidence = normalizeContinuationItems(raw.completedEvidence, "Completed evidence");
  const remainingWork = normalizeContinuationItems(raw.remainingWork, "Remaining work");
  const continuationIntents = validateStoredContinuationIntents(raw.continuationIntents, remainingWork, Number(raw.revision));
  const selectedContinuationIntentId = strictText(raw.selectedContinuationIntentId, "Selected continuation intent id", 96, false);
  if (selectedContinuationIntentId && !continuationIntents.some((intent) => intent.id === selectedContinuationIntentId)) throw new Error("Selected continuation intent is not present.");
  if (!Number.isInteger(raw.continuationCount) || Number(raw.continuationCount) < 0) throw new Error("Invalid continuation count.");
  const outstandingNonce = strictText(raw.outstandingNonce, "Continuation nonce", 128, false);
  const lastCheckpointId = strictText(raw.lastCheckpointId, "Checkpoint id", 96, false);
  const lastRequestId = strictText(raw.lastRequestId, "Request id", 96, false);
  const createdAt = strictTimestamp(raw.createdAt, "continuation created timestamp");
  const updatedAt = strictTimestamp(raw.updatedAt, "continuation updated timestamp");
  const lastHeartbeatAt = raw.lastHeartbeatAt === undefined ? undefined : strictTimestamp(raw.lastHeartbeatAt, "continuation heartbeat timestamp");
  const conversationFingerprint = raw.conversationFingerprint === undefined ? undefined : String(raw.conversationFingerprint);
  if (conversationFingerprint && !/^[a-f0-9]{64}$/.test(conversationFingerprint)) throw new Error("Invalid conversation fingerprint.");
  const lastDispatchAt = raw.lastDispatchAt === undefined ? undefined : strictTimestamp(raw.lastDispatchAt, "continuation dispatch timestamp");
  let watchdog: ContinuationWatchdogRecord | undefined;
  if (raw.watchdog !== undefined) {
    if (!raw.watchdog || typeof raw.watchdog !== "object" || Array.isArray(raw.watchdog)) throw new Error("Malformed continuation watchdog state.");
    const state = raw.watchdog as Record<string, unknown>;
    const allowed = new Set(["runtimeGenerationId", "transportState", "browserObservationGeneration", "interruptionBaselineAt", "pendingExplicitRequest", "pendingAckNonceHash", "pendingAckDispatchRevision", "lastAcknowledgedDispatchRevision", "lastAcknowledgedAt", "lastUserInteractionAt", "notificationKey", "cooldownUntilAt"]);
    for (const key of Object.keys(state)) if (!allowed.has(key)) throw new Error(`Unsupported continuation watchdog field: ${key}`);
    const runtimeGenerationId = strictIdentityText(state.runtimeGenerationId, "Runtime generation id", 160, false);
    const browserObservationGeneration = strictIdentityText(state.browserObservationGeneration, "Browser observation generation", 160, false);
    if (runtimeGenerationId && !/^[A-Za-z0-9._:-]{1,160}$/.test(runtimeGenerationId)) throw new Error("Invalid runtime generation id.");
    if (browserObservationGeneration && !/^[A-Za-z0-9._:-]{1,160}$/.test(browserObservationGeneration)) throw new Error("Invalid browser observation generation.");
    const transportState = state.transportState === undefined ? undefined : state.transportState;
    if (transportState !== undefined && transportState !== "ready" && transportState !== "unavailable" && transportState !== "unknown") throw new Error("Invalid continuation transport state.");
    const pendingExplicitRequest = state.pendingExplicitRequest === undefined ? undefined : state.pendingExplicitRequest;
    if (pendingExplicitRequest !== undefined && typeof pendingExplicitRequest !== "boolean") throw new Error("Invalid pending explicit continuation flag.");
    const pendingAckNonceHash = state.pendingAckNonceHash === undefined ? undefined : String(state.pendingAckNonceHash);
    const notificationKey = state.notificationKey === undefined ? undefined : String(state.notificationKey);
    if (pendingAckNonceHash && !/^[a-f0-9]{64}$/.test(pendingAckNonceHash)) throw new Error("Invalid continuation acknowledgement verifier.");
    if (notificationKey && !/^[a-f0-9]{64}$/.test(notificationKey)) throw new Error("Invalid continuation notification key.");
    const pendingAckDispatchRevision = state.pendingAckDispatchRevision === undefined ? undefined : Number(state.pendingAckDispatchRevision);
    const lastAcknowledgedDispatchRevision = state.lastAcknowledgedDispatchRevision === undefined ? undefined : Number(state.lastAcknowledgedDispatchRevision);
    if (pendingAckDispatchRevision !== undefined && (!Number.isInteger(pendingAckDispatchRevision) || pendingAckDispatchRevision < 1)) throw new Error("Invalid pending dispatch acknowledgement revision.");
    if (lastAcknowledgedDispatchRevision !== undefined && (!Number.isInteger(lastAcknowledgedDispatchRevision) || lastAcknowledgedDispatchRevision < 1)) throw new Error("Invalid acknowledged dispatch revision.");
    watchdog = {
      ...(runtimeGenerationId ? { runtimeGenerationId } : {}), ...(transportState ? { transportState } : {}),
      ...(browserObservationGeneration ? { browserObservationGeneration } : {}),
      ...(state.interruptionBaselineAt !== undefined ? { interruptionBaselineAt: strictTimestamp(state.interruptionBaselineAt, "continuation interruption baseline") } : {}),
      ...(pendingExplicitRequest !== undefined ? { pendingExplicitRequest } : {}), ...(pendingAckNonceHash ? { pendingAckNonceHash } : {}),
      ...(pendingAckDispatchRevision !== undefined ? { pendingAckDispatchRevision } : {}), ...(lastAcknowledgedDispatchRevision !== undefined ? { lastAcknowledgedDispatchRevision } : {}),
      ...(state.lastAcknowledgedAt !== undefined ? { lastAcknowledgedAt: strictTimestamp(state.lastAcknowledgedAt, "continuation acknowledgement timestamp") } : {}),
      ...(state.lastUserInteractionAt !== undefined ? { lastUserInteractionAt: strictTimestamp(state.lastUserInteractionAt, "continuation user-interaction timestamp") } : {}),
      ...(notificationKey ? { notificationKey } : {}), ...(state.cooldownUntilAt !== undefined ? { cooldownUntilAt: strictTimestamp(state.cooldownUntilAt, "continuation cooldown timestamp") } : {})
    };
  }
  let dispatchAuthorization: ContinuationDispatchAuthorizationRecord | undefined;
  if (raw.dispatchAuthorization !== undefined) {
    if (!raw.dispatchAuthorization || typeof raw.dispatchAuthorization !== "object" || Array.isArray(raw.dispatchAuthorization)) throw new Error("Malformed dispatch authorization.");
    const auth = raw.dispatchAuthorization as Record<string, unknown>;
    if (!Object.keys(auth).every((key) => ["tokenHash", "source", "authorizedAt", "expiresAt", "routeFingerprint"].includes(key))) throw new Error("Unsupported dispatch authorization field.");
    const tokenHash = String(auth.tokenHash ?? ""); const routeFingerprint = String(auth.routeFingerprint ?? "");
    if (!/^[a-f0-9]{64}$/.test(tokenHash) || !/^[a-f0-9]{64}$/.test(routeFingerprint)) throw new Error("Invalid dispatch authorization verifier.");
    if (auth.source !== "browser" && auth.source !== "telegram") throw new Error("Invalid dispatch authorization source.");
    dispatchAuthorization = { tokenHash, source: auth.source, authorizedAt: strictTimestamp(auth.authorizedAt, "dispatch authorization timestamp"), expiresAt: strictTimestamp(auth.expiresAt, "dispatch authorization expiry"), routeFingerprint };
  }

  let manualTurnPending: ManualTurnPending | undefined;
  if (raw.manualTurnPending !== undefined) {
    if (!raw.manualTurnPending || typeof raw.manualTurnPending !== "object" || Array.isArray(raw.manualTurnPending)) throw new Error("Malformed manual-turn state.");
    const manual = raw.manualTurnPending as Record<string, unknown>;
    if (!Object.keys(manual).every((key) => ["reason", "observedAt", "observedRevision"].includes(key))) throw new Error("Unsupported manual-turn field.");
    if (manual.reason !== "manual_message" && manual.reason !== "stop_generating") throw new Error("Invalid manual-turn reason.");
    if (!Number.isInteger(manual.observedRevision) || Number(manual.observedRevision) < 1) throw new Error("Invalid manual-turn revision.");
    manualTurnPending = { reason: manual.reason, observedAt: strictTimestamp(manual.observedAt, "manual-turn timestamp"), observedRevision: Number(manual.observedRevision) };
  }
  let cancelReason: ContinuationCancelReason | undefined;
  if (raw.cancelReason !== undefined) {
    if (raw.cancelReason !== "user_canceled" && raw.cancelReason !== "superseded_by_user") throw new Error("Invalid continuation cancel reason.");
    cancelReason = raw.cancelReason;
  }
  const record: ContinuationRecord = {
    schemaVersion: 1, id, workspaceId, workspaceRoot, ...(mcpSessionId ? { mcpSessionId } : {}), revision: Number(raw.revision),
    state: raw.state as ContinuationState, title, ...(currentPhase ? { currentPhase } : {}), completedEvidence, remainingWork,
    continuationIntents, ...(selectedContinuationIntentId ? { selectedContinuationIntentId } : {}),
    ...(manualTurnPending ? { manualTurnPending } : {}), ...(cancelReason ? { cancelReason } : {}), continuationCount: Number(raw.continuationCount),
    ...(outstandingNonce ? { outstandingNonce } : {}), ...(lastCheckpointId ? { lastCheckpointId } : {}), ...(lastRequestId ? { lastRequestId } : {}),
    ...(conversationFingerprint ? { conversationFingerprint } : {}), ...(dispatchAuthorization ? { dispatchAuthorization } : {}), ...(lastDispatchAt ? { lastDispatchAt } : {}),
    createdAt, updatedAt, ...(lastHeartbeatAt ? { lastHeartbeatAt } : {}), ...(watchdog ? { watchdog } : {})
  };
  if (record.state === "paused_by_user" && !record.manualTurnPending) throw new Error("Paused continuation requires pending manual-turn state.");
  if (record.state === "awaiting_ack" && (!record.watchdog?.pendingAckNonceHash || record.watchdog.pendingAckDispatchRevision !== record.revision)) throw new Error("Awaiting acknowledgement continuation is missing current dispatch evidence.");
  if (record.state !== "awaiting_ack" && (record.watchdog?.pendingAckNonceHash || record.watchdog?.pendingAckDispatchRevision)) throw new Error("Continuation retains stale pending acknowledgement state.");
  if (TERMINAL_CONTINUATION_STATES.has(record.state) && (record.outstandingNonce || record.selectedContinuationIntentId || record.manualTurnPending || record.dispatchAuthorization || record.watchdog?.notificationKey || record.watchdog?.pendingExplicitRequest)) throw new Error("Terminal continuation retains active authorization state.");
  const bytes = Buffer.byteLength(JSON.stringify(record), "utf8");
  if (bytes > MAX_RECORD_BYTES) throw new Error("Continuation record exceeds bounded storage limit.");
  return record;
}

export function publicContinuationRecord(record: ContinuationRecord): Record<string, unknown> {
  return {
    schema_version: record.schemaVersion, id: record.id, workspace_id: record.workspaceId,
    revision: record.revision, state: record.state,
    title: record.title, ...(record.currentPhase ? { current_phase: record.currentPhase } : {}),
    completed_evidence: [...record.completedEvidence], remaining_work: [...record.remainingWork],
    continuation_intents: record.continuationIntents.map((intent) => ({ id: intent.id, template_key: intent.templateKey, label: intent.label, ...(intent.focusRef ? { focus_ref: intent.focusRef } : {}), revision: intent.revision })),
    continuation_count: record.continuationCount, manual_turn_pending: Boolean(record.manualTurnPending),
    conversation_bound: Boolean(record.conversationFingerprint), ...(record.conversationFingerprint ? { conversation_fingerprint_suffix: record.conversationFingerprint.slice(-8) } : {}),
    dispatch_authorization_pending: Boolean(record.dispatchAuthorization), ...(record.lastDispatchAt ? { last_dispatch_at: record.lastDispatchAt } : {}),
    ...(record.watchdog?.notificationKey ? { notification_key: record.watchdog.notificationKey } : {}),
    user_action_required: ["continuation_ready", "awaiting_user_send", "paused_by_user", "waiting_for_auth", "blocked_interaction", "manual_rearm_required"].includes(record.state),
    created_at: record.createdAt, updated_at: record.updatedAt, ...(record.lastHeartbeatAt ? { last_heartbeat_at: record.lastHeartbeatAt } : {})
  };
}

const ALLOWED_TRANSITIONS: Record<ContinuationState, ReadonlySet<ContinuationState>> = {
  armed: new Set(["working", "continuation_requested", "paused_by_user", "canceled", "error"]),
  working: new Set(["continuation_requested", "continuation_ready", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "manual_rearm_required", "completed", "canceled", "error"]),
  continuation_requested: new Set(["working", "continuation_ready", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "manual_rearm_required", "canceled", "error"]),
  continuation_ready: new Set(["working", "awaiting_user_send", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "manual_rearm_required", "canceled", "error"]),
  awaiting_user_send: new Set(["working", "continuation_ready", "awaiting_ack", "dispatched", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "manual_rearm_required", "canceled", "error"]),
  awaiting_ack: new Set(["working", "waiting_for_transport", "paused_by_user", "manual_rearm_required", "canceled", "error"]),
  dispatched: new Set(["working", "awaiting_ack", "waiting_for_transport", "paused_by_user", "manual_rearm_required", "canceled", "error"]),
  waiting_for_auth: new Set(["working", "continuation_requested", "continuation_ready", "paused_by_user", "manual_rearm_required", "canceled", "error"]),
  waiting_for_transport: new Set(["working", "continuation_requested", "continuation_ready", "paused_by_user", "manual_rearm_required", "canceled", "error"]),
  paused_by_user: new Set(["working", "canceled"]),
  blocked_interaction: new Set(["working", "continuation_requested", "continuation_ready", "paused_by_user", "manual_rearm_required", "canceled", "error"]),
  manual_rearm_required: new Set(["canceled", "error"]),
  completed: new Set(), canceled: new Set(), error: new Set()
};

export function assertContinuationTransition(from: ContinuationState, to: ContinuationState): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].has(to)) throw new Error(`Invalid continuation transition: ${from} -> ${to}.`);
}

function validateStoredContinuationIntents(value: unknown, remainingWork: string[], revision: number): ContinuationIntent[] {
  if (!Array.isArray(value)) throw new Error("Continuation intents must be an array.");
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Continuation intent ${index} is malformed.`);
    const input = raw as Record<string, unknown>;
    if (!Object.keys(input).every((key) => ["id", "templateKey", "label", "focusRef", "revision"].includes(key))) {
      throw new Error("Unsupported continuation intent field.");
    }
    if (!Number.isInteger(input.revision) || Number(input.revision) < 1 || Number(input.revision) > revision) throw new Error("Invalid continuation intent revision.");
  }
  const normalized = normalizeContinuationIntents(value, remainingWork, revision);
  return normalized.map((intent, index) => ({ ...intent, revision: Number((value[index] as Record<string, unknown>).revision) }));
}
