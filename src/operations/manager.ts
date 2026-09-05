import { createHash, randomUUID } from "node:crypto";
import { redactSensitiveText } from "../redact.js";
import type { OperationReceipt, OperationStartInput, OperationSummary } from "./types.js";
import { OperationStore } from "./store.js";
import { withWorkspaceLease } from "./locks.js";

function cleanKind(value: string): string {
  const kind = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_").slice(0, 80);
  if (!kind) throw new Error("Operation kind is required.");
  return kind;
}

function idempotencyHash(workspaceId: string, kind: string, key: string): string {
  const raw = String(key ?? "");
  if (!raw || raw.length > 256 || /[\0\r\n]/.test(raw)) throw new Error("idempotency_key must be 1-256 characters without line breaks.");
  return createHash("sha256").update(workspaceId).update("\0").update(kind).update("\0").update(raw).digest("hex");
}

function operationError(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    return {
      code: error.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "Error",
      message: redactSensitiveText(error.message).replace(/[\r\n\0]+/g, " ").slice(0, 480)
    };
  }
  return { code: "Error", message: redactSensitiveText(String(error)).replace(/[\r\n\0]+/g, " ").slice(0, 480) };
}

export interface OperationExecution<T> {
  receipt: OperationReceipt;
  replayed: boolean;
  result?: T;
}

export class OperationManager {
  constructor(
    private readonly store: OperationStore,
    readonly workspaceId: string
  ) {}
  async start(input: OperationStartInput): Promise<OperationReceipt> {
    const kind = cleanKind(input.kind);
    const hash = input.idempotencyKey ? idempotencyHash(this.workspaceId, kind, input.idempotencyKey) : undefined;
    const resource = hash ? `idempotency:${kind}:${hash}` : `start:${randomUUID()}`;
    return withWorkspaceLease(this.workspaceId, [resource], async () => {
      if (hash) {
        const existing = await this.store.findByIdempotencyHash(this.workspaceId, kind, hash);
        if (existing) return { ...existing, reused: true };
      }
      const now = new Date().toISOString();
      const receipt: OperationReceipt = {
        schemaVersion: 1,
        id: `op_${randomUUID()}`,
        workspaceId: this.workspaceId,
        kind,
        state: "started",
        ...(hash ? { idempotencyKeyHash: hash } : {}),
        startedAt: now,
        updatedAt: now
      };
      return this.store.save(receipt);
    });
  }

  async complete(id: string, summary: OperationSummary = {}): Promise<OperationReceipt> {
    return withWorkspaceLease(this.workspaceId, [`operation:${id}`], async () => {
      const current = await this.requireStatus(id);
      if (current.state === "completed") return { ...current, reused: true };
      if (current.state === "failed") throw new Error(`Operation ${id} is already failed.`);
      return this.store.save({
        ...current,
        state: "completed",
        updatedAt: new Date().toISOString(),
        summary,
        error: undefined,
        reused: undefined
      });
    });
  }
  async fail(id: string, error: unknown): Promise<OperationReceipt> {
    return withWorkspaceLease(this.workspaceId, [`operation:${id}`], async () => {
      const current = await this.requireStatus(id);
      if (current.state !== "started") return { ...current, reused: true };
      return this.store.save({
        ...current,
        state: "failed",
        updatedAt: new Date().toISOString(),
        error: operationError(error),
        reused: undefined
      });
    });
  }

  async status(id: string): Promise<OperationReceipt | null> {
    return this.store.get(this.workspaceId, id);
  }

  private async requireStatus(id: string): Promise<OperationReceipt> {
    const receipt = await this.status(id);
    if (!receipt) throw new Error(`Unknown operation id: ${id}`);
    return receipt;
  }

  async execute<T>(
    input: OperationStartInput,
    task: () => Promise<T>,
    summarize: (result: T) => OperationSummary = () => ({})
  ): Promise<OperationExecution<T>> {
    const started = await this.start(input);
    if (started.reused) return { receipt: started, replayed: true };
    try {
      const result = await task();
      const receipt = await this.complete(started.id, summarize(result));
      return { receipt, replayed: false, result };
    } catch (error) {
      try { await this.fail(started.id, error); } catch {}
      throw error;
    }
  }
}
