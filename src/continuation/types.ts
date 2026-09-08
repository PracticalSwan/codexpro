import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "../redact.js";

export const CONTINUATION_STATES = [
  "armed", "working", "continuation_requested", "continuation_ready", "awaiting_user_send", "dispatched",
  "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "completed", "canceled", "error"
] as const;
export type ContinuationState = typeof CONTINUATION_STATES[number];
export type ContinuationDisposition = "resume" | "redirect" | "supersede" | "cancel";
export type ContinuationTemplateKey = "resume_all_v1" | "focus_remaining_v1";
export type ContinuationCancelReason = "user_canceled" | "superseded_by_user";

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
  continuationCount: number;
  outstandingNonce?: string;
  lastCheckpointId?: string;
  lastRequestId?: string;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
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
  "continuationCount", "outstandingNonce", "lastCheckpointId", "lastRequestId", "createdAt", "updatedAt", "lastHeartbeatAt"
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
    createdAt, updatedAt, ...(lastHeartbeatAt ? { lastHeartbeatAt } : {})
  };
  if (record.state === "paused_by_user" && !record.manualTurnPending) throw new Error("Paused continuation requires pending manual-turn state.");
  if (TERMINAL_CONTINUATION_STATES.has(record.state) && (record.outstandingNonce || record.selectedContinuationIntentId || record.manualTurnPending)) throw new Error("Terminal continuation retains active authorization state.");
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
    user_action_required: ["continuation_ready", "awaiting_user_send", "paused_by_user", "waiting_for_auth", "blocked_interaction"].includes(record.state),
    created_at: record.createdAt, updated_at: record.updatedAt, ...(record.lastHeartbeatAt ? { last_heartbeat_at: record.lastHeartbeatAt } : {})
  };
}

const ALLOWED_TRANSITIONS: Record<ContinuationState, ReadonlySet<ContinuationState>> = {
  armed: new Set(["working", "continuation_requested", "paused_by_user", "canceled", "error"]),
  working: new Set(["continuation_requested", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "completed", "canceled", "error"]),
  continuation_requested: new Set(["working", "continuation_ready", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "canceled", "error"]),
  continuation_ready: new Set(["working", "awaiting_user_send", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "canceled", "error"]),
  awaiting_user_send: new Set(["working", "dispatched", "waiting_for_auth", "waiting_for_transport", "paused_by_user", "blocked_interaction", "canceled", "error"]),
  dispatched: new Set(["working", "waiting_for_transport", "paused_by_user", "canceled", "error"]),
  waiting_for_auth: new Set(["working", "continuation_requested", "paused_by_user", "canceled", "error"]),
  waiting_for_transport: new Set(["working", "continuation_requested", "paused_by_user", "canceled", "error"]),
  paused_by_user: new Set(["working", "canceled"]),
  blocked_interaction: new Set(["working", "continuation_requested", "paused_by_user", "canceled", "error"]),
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
