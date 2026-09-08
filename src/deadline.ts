import { AsyncLocalStorage } from "node:async_hooks";

export const DEFAULT_SYNC_CALL_DEADLINE_MS = 1_200_000;
export const MIN_SYNC_CALL_DEADLINE_MS = 300_000;
export const MAX_SYNC_CALL_DEADLINE_MS = 3_600_000;

export type SyncCallDeadlineMode = "bounded" | "observe";
export interface SyncCallDeadlineConfig {
  mode: SyncCallDeadlineMode;
  deadlineMs: number;
}
export interface DeadlineClockOptions {
  now?: () => number;
}

function strictDeadlineMs(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isInteger(numeric) || numeric < MIN_SYNC_CALL_DEADLINE_MS || numeric > MAX_SYNC_CALL_DEADLINE_MS) {
    throw new Error(`Synchronous call deadline must be an integer from ${MIN_SYNC_CALL_DEADLINE_MS} to ${MAX_SYNC_CALL_DEADLINE_MS} ms.`);
  }
  return numeric;
}

export function normalizeSyncCallDeadlineConfig(value: unknown): SyncCallDeadlineConfig {
  if (value === undefined || value === null || value === "") {
    return { mode: "bounded", deadlineMs: DEFAULT_SYNC_CALL_DEADLINE_MS };
  }
  if (value === "unlimited" || value === "observe") {
    return { mode: "observe", deadlineMs: DEFAULT_SYNC_CALL_DEADLINE_MS };
  }
  if (typeof value === "number") {
    return { mode: "bounded", deadlineMs: strictDeadlineMs(value) };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const input = value as { mode?: unknown; deadlineMs?: unknown };
    if (input.mode !== "bounded" && input.mode !== "observe") {
      throw new Error("Synchronous call deadline mode must be bounded or observe.");
    }
    return {
      mode: input.mode,
      deadlineMs: strictDeadlineMs(input.deadlineMs ?? DEFAULT_SYNC_CALL_DEADLINE_MS)
    };
  }
  throw new Error("Invalid synchronous call deadline configuration.");
}

export class DeadlineBudget {
  readonly mode: SyncCallDeadlineMode;
  readonly totalMs: number;
  private readonly now: () => number;
  private readonly startedAtMs: number;

  constructor(mode: SyncCallDeadlineMode, totalMs: number, options: DeadlineClockOptions = {}) {
    const normalized = normalizeSyncCallDeadlineConfig({ mode, deadlineMs: totalMs });
    this.mode = normalized.mode;
    this.totalMs = normalized.deadlineMs;
    this.now = options.now ?? Date.now;
    this.startedAtMs = this.now();
  }

  elapsedMs(): number {
    return Math.max(0, this.now() - this.startedAtMs);
  }

  remainingMs(): number {
    if (this.mode === "observe") return Number.POSITIVE_INFINITY;
    return Math.max(0, this.totalMs - this.elapsedMs());
  }
  handoffReserveMs(): number {
    return Math.min(60_000, Math.max(15_000, Math.floor(this.totalMs * 0.05)));
  }

  shouldYield(requiredMs = 0): boolean {
    if (this.mode === "observe") return false;
    const usableMs = Math.max(0, this.remainingMs() - this.handoffReserveMs());
    return usableMs <= Math.max(0, requiredMs);
  }

  childTimeoutMs(requestedMs: number, minimumMs = 0): number {
    const requested = Math.max(0, Math.floor(requestedMs));
    if (this.mode === "observe") return requested;
    const usableMs = Math.max(0, this.remainingMs() - this.handoffReserveMs());
    const result = Math.min(requested, usableMs);
    return result < Math.max(0, minimumMs) ? 0 : result;
  }
}

const deadlineContext = new AsyncLocalStorage<DeadlineBudget>();

export function withSyncCallDeadline<T>(
  mode: SyncCallDeadlineMode,
  deadlineMs: number,
  fn: () => Promise<T>,
  options: DeadlineClockOptions = {}
): Promise<T> {
  const budget = new DeadlineBudget(mode, deadlineMs, options);
  return deadlineContext.run(budget, fn);
}

export function currentSyncCallDeadline(): DeadlineBudget | undefined {
  return deadlineContext.getStore();
}
