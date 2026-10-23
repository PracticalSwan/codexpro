export type ExecutionClass = "sync_allowed" | "async_preferred" | "durable_goal_candidate";
export type ExecutionCategory = "generic" | "shell" | "verification" | "multi_stage";
export type ExecutionPrimitive = "synchronous_tool" | "start_workspace_process" | "start_checks_or_verification" | "durable_goal";

export interface ExecutionHintInput {
  expectedDurationMs?: number;
  category?: ExecutionCategory;
  highVariance?: boolean;
  hasDependencyGraph?: boolean;
  requiresReviewProjection?: boolean;
}
export interface ExecutionHint {
  executionClass: ExecutionClass;
  recommendedPrimitive: ExecutionPrimitive;
  expectedDurationMs?: number;
  reasons: string[];
}
function primitiveFor(cls: ExecutionClass, category: ExecutionCategory): ExecutionPrimitive {
  if (cls === "durable_goal_candidate") return "durable_goal";
  if (cls === "async_preferred" && category === "shell") return "start_workspace_process";
  if (cls === "async_preferred" && category === "verification") return "start_checks_or_verification";
  return "synchronous_tool";
}
export function classifyExecutionHint(input: ExecutionHintInput): ExecutionHint {
  const category = input.category ?? "generic";
  const reasons: string[] = [];
  let executionClass: ExecutionClass = "sync_allowed";
  if (category === "multi_stage" && (input.hasDependencyGraph || input.requiresReviewProjection)) {
    executionClass = "durable_goal_candidate";
    reasons.push("work has dependencies and review boundaries; use durable goal state");
  } else if (input.highVariance) {
    executionClass = "async_preferred";
    reasons.push("high-variance work benefits from cancellable and inspectable execution");
  } else {
    reasons.push("no artificial synchronous call deadline; use durable primitives when task requirements justify them");
  }
  return {
    executionClass,
    recommendedPrimitive: primitiveFor(executionClass, category),
    ...(input.expectedDurationMs === undefined ? {} : { expectedDurationMs: Math.max(0, Math.floor(input.expectedDurationMs)) }),
    reasons
  };
}
export function executionHintPublic(hint: ExecutionHint): Record<string, unknown> {
  return {
    class: hint.executionClass,
    recommended_primitive: hint.recommendedPrimitive,
    ...(hint.expectedDurationMs === undefined ? {} : { expected_duration_ms: hint.expectedDurationMs }),
    reasons: [...hint.reasons]
  };
}
