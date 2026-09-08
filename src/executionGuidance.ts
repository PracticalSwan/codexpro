export type ExecutionClass = "sync_preferred" | "sync_allowed" | "async_preferred" | "durable_goal_candidate";
export type ExecutionCategory = "generic" | "shell" | "verification" | "multi_stage";
export type ExecutionPrimitive = "synchronous_tool" | "start_workspace_process" | "start_checks_or_verification" | "durable_goal";

export interface ExecutionThresholds {
  deadlineMs: number;
  syncPreferredMs: number;
  asyncPreferredMs: number;
}

export interface ExecutionHint {
  executionClass: ExecutionClass;
  recommendedPrimitive: ExecutionPrimitive;
  thresholds: ExecutionThresholds;
  expectedDurationMs?: number;
  reasons: string[];
}

export interface ExecutionHintInput {
  deadlineMs: number;
  expectedDurationMs?: number;
  category?: ExecutionCategory;
  highVariance?: boolean;
  hasDependencyGraph?: boolean;
  requiresReviewProjection?: boolean;
}
export function executionThresholds(deadlineMs: number): ExecutionThresholds {
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new Error("Execution guidance deadline must be positive.");
  const bounded = Math.max(1, Math.floor(deadlineMs));
  return {
    deadlineMs: bounded,
    syncPreferredMs: Math.min(300_000, Math.floor(bounded * 0.25)),
    asyncPreferredMs: Math.floor(bounded * 0.75)
  };
}

function primitiveFor(executionClass: ExecutionClass, category: ExecutionCategory): ExecutionPrimitive {
  if (executionClass === "durable_goal_candidate") return "durable_goal";
  if (executionClass !== "async_preferred") return "synchronous_tool";
  if (category === "shell") return "start_workspace_process";
  if (category === "verification") return "start_checks_or_verification";
  return "synchronous_tool";
}
export function classifyExecutionHint(input: ExecutionHintInput): ExecutionHint {
  const thresholds = executionThresholds(input.deadlineMs);
  const category = input.category ?? "generic";
  const reasons: string[] = [];
  let executionClass: ExecutionClass;

  if (category === "multi_stage" && (input.hasDependencyGraph || input.requiresReviewProjection)) {
    executionClass = "durable_goal_candidate";
    reasons.push("multi-stage work has dependencies and/or review-projection boundaries");
  } else if (input.highVariance) {
    executionClass = "async_preferred";
    reasons.push("work is explicitly high variance or has unknown heavy duration");
  } else if (input.expectedDurationMs === undefined) {
    executionClass = "sync_allowed";
    reasons.push("no explicit duration estimate; keep scope intact and route durably if risk increases");
  } else if (input.expectedDurationMs <= thresholds.syncPreferredMs) {
    executionClass = "sync_preferred";
    reasons.push("explicit expected duration is within the synchronous preferred cutoff");
  } else if (input.expectedDurationMs >= thresholds.asyncPreferredMs) {
    executionClass = "async_preferred";
    reasons.push("explicit expected duration reaches the async preferred cutoff");
  } else {
    executionClass = "sync_allowed";
    reasons.push("explicit expected duration is between preferred routing cutoffs");
  }
  return {
    executionClass,
    recommendedPrimitive: primitiveFor(executionClass, category),
    thresholds,
    ...(input.expectedDurationMs === undefined ? {} : { expectedDurationMs: Math.max(0, Math.floor(input.expectedDurationMs)) }),
    reasons
  };
}

export function executionHintPublic(hint: ExecutionHint): Record<string, unknown> {
  return {
    class: hint.executionClass,
    recommended_primitive: hint.recommendedPrimitive,
    thresholds_ms: { sync_preferred: hint.thresholds.syncPreferredMs, async_preferred: hint.thresholds.asyncPreferredMs },
    ...(hint.expectedDurationMs === undefined ? {} : { expected_duration_ms: hint.expectedDurationMs }),
    reasons: [...hint.reasons]
  };
}
