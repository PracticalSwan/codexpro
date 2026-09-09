import type { WorkspaceProcessRecord } from "../processOps.js";
import type { JobRecord } from "../jobs/types.js";
import type { GoalRecord } from "../goals/types.js";
import type { BatchRecord } from "../batches/types.js";
import type { DurableContinuationWorkSnapshot } from "./watchdog.js";

export interface DurableContinuationRecords {
  processes: Array<Pick<WorkspaceProcessRecord, "state">>;
  jobs: Array<Pick<JobRecord, "state">>;
  goals: Array<Pick<GoalRecord, "state">>;
  batches: Array<Pick<BatchRecord, "state">>;
}

function snapshot(
  kind: DurableContinuationWorkSnapshot["kind"],
  active: boolean,
  modelAttentionRequired: boolean
): DurableContinuationWorkSnapshot {
  return { kind, active, modelAttentionRequired };
}

export function classifyDurableContinuationWork(input: DurableContinuationRecords): DurableContinuationWorkSnapshot[] {
  const out: DurableContinuationWorkSnapshot[] = [];
  for (const record of input.processes) {
    out.push(snapshot("process", record.state === "running" || record.state === "stopping", record.state === "exited" || record.state === "failed"));
  }
  for (const record of input.jobs) {
    const productive = record.state === "queued" || record.state === "running";
    out.push(snapshot("job", productive, !productive));
  }
  for (const record of input.goals) {
    const productive = record.state === "running";
    const attention = record.state !== "running";
    const active = productive || record.state === "awaiting_review" || record.state === "awaiting_projection";
    out.push(snapshot("goal", active, attention));
  }
  for (const record of input.batches) {
    out.push(snapshot("batch", record.state === "active", true));
  }
  return out;
}
