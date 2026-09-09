export type ActivityKind = "tool" | "operation" | "check" | "process" | "job" | "goal" | "continuation" | "git";
export type ActivityStatus = "started" | "ok" | "error" | "cancelled";

export interface ActivityRecord {
  sequence: number;
  timestamp: string;
  workspaceId: string;
  kind: ActivityKind;
  action: string;
  status: ActivityStatus;
  durationMs?: number;
  operationId?: string;
  checkId?: string;
  processId?: string;
  jobId?: string;
  goalId?: string;
  continuationId?: string;
  relativePaths?: string[];
  summary?: string;
}

export type ActivityInput = Omit<ActivityRecord, "sequence" | "timestamp">;

export interface ActivityQuery {
  workspaceId: string;
  afterSequence?: number;
  kinds?: ActivityKind[];
  statuses?: ActivityStatus[];
  limit?: number;
}

export interface ActivityPage { records: ActivityRecord[]; nextSequence: number; }
