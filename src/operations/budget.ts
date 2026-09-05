import type { OperationBudgetLimits } from "./types.js";

export type OperationBudgetReason = "bytes_exhausted" | "items_exhausted" | "time_exhausted";

export class OperationBudgetError extends Error {
  constructor(
    readonly reason: OperationBudgetReason,
    message: string
  ) {
    super(message);
    this.name = "OperationBudgetError";
  }
}

export class ResourceBudget {
  private readonly startedAt = Date.now();
  private bytes = 0;
  private items = 0;

  constructor(readonly limits: OperationBudgetLimits) {
    if (!Number.isFinite(limits.maxBytes) || limits.maxBytes <= 0) throw new Error("maxBytes must be positive.");
    if (!Number.isFinite(limits.maxItems) || limits.maxItems <= 0) throw new Error("maxItems must be positive.");
    if (!Number.isFinite(limits.maxDurationMs) || limits.maxDurationMs <= 0) throw new Error("maxDurationMs must be positive.");
  }

  consumeBytes(bytes: number): void {
    this.checkTime();
    const next = this.bytes + Math.max(0, Math.floor(bytes));
    if (next > this.limits.maxBytes) {
      throw new OperationBudgetError("bytes_exhausted", `Operation byte budget exhausted (${next} > ${this.limits.maxBytes}).`);
    }
    this.bytes = next;
  }

  consumeItems(items = 1): void {
    this.checkTime();
    const next = this.items + Math.max(0, Math.floor(items));
    if (next > this.limits.maxItems) {
      throw new OperationBudgetError("items_exhausted", `Operation item budget exhausted (${next} > ${this.limits.maxItems}).`);
    }
    this.items = next;
  }
  checkTime(now = Date.now()): void {
    const elapsed = now - this.startedAt;
    if (elapsed > this.limits.maxDurationMs) {
      throw new OperationBudgetError("time_exhausted", `Operation time budget exhausted (${elapsed} ms > ${this.limits.maxDurationMs} ms).`);
    }
  }

  snapshot(): { bytes: number; items: number; elapsedMs: number; limits: OperationBudgetLimits } {
    return {
      bytes: this.bytes,
      items: this.items,
      elapsedMs: Date.now() - this.startedAt,
      limits: { ...this.limits }
    };
  }
}
