import type { CodexProConfig } from "../config.js";
import type { PathGuard, Workspace } from "../guard.js";
import type { OperationManager } from "./manager.js";

export type OperationState = "started" | "completed" | "failed";

export interface OperationSummary {
  paths?: string[];
  bytes?: number;
  items?: number;
  additions?: number;
  deletions?: number;
  durationMs?: number;
  exitCode?: number | null;
  beforeHashes?: Record<string, string>;
  afterHashes?: Record<string, string>;
  note?: string;
  reason?: string;
}

export interface OperationErrorSummary {
  code: string;
  message: string;
}

export interface OperationReceipt {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  kind: string;
  state: OperationState;
  idempotencyKeyHash?: string;
  startedAt: string;
  updatedAt: string;
  summary?: OperationSummary;
  error?: OperationErrorSummary;
  reused?: boolean;
}

export interface OperationStartInput {
  kind: string;
  idempotencyKey?: string;
}
export interface ChangeSetChange {
  path: string;
  content: string;
  expectedSha256?: string;
}

export interface ChangeSetRequest {
  operationManager: OperationManager;
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  changes: ChangeSetChange[];
  idempotencyKey?: string;
}

export interface PreparedChangeSet {
  id: string;
  workspaceId: string;
  paths: string[];
  totalBytes: number;
  state: "prepared" | "applied" | "reverted" | "failed";
  operationId?: string;
}

export interface OperationBudgetLimits {
  maxBytes: number;
  maxItems: number;
  maxDurationMs: number;
}
