export type BatchKind = "gather_context" | "inspect_workspace";
export type BatchState = "active" | "completed" | "stale" | "canceled";

export interface BatchRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  kind: BatchKind;
  requestFingerprint: string;
  sourceFingerprint: string;
  cursor: number;
  completedUnits: number;
  state: BatchState;
  createdAt: string;
  updatedAt: string;
}

export function isBatchKind(value: unknown): value is BatchKind {
  return value === "gather_context" || value === "inspect_workspace";
}

export function publicBatchRecord(record: BatchRecord) {
  const { workspaceRoot: _root, ...safe } = record;
  return safe;
}
