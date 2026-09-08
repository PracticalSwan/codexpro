import type { CodexProConfig } from "./config.js";
import type { TelemetrySnapshot } from "./telemetry.js";
import { DEFAULT_SYNC_CALL_DEADLINE_MS, MIN_SYNC_CALL_DEADLINE_MS, MAX_SYNC_CALL_DEADLINE_MS } from "./deadline.js";

export interface ConnectionDiagnostics {
  state: "no_requests" | "arrived_not_dispatched" | "dispatch_failed" | "response_failed" | "healthy" | "degraded";
  request_arrivals: number;
  dispatches: number;
  completions: number;
  responses: number;
  dispatch_failures: number;
  response_failures: number;
  active_sessions: number;
  last_event_at?: string;
}

function count(snapshot: TelemetrySnapshot, key: string): number {
  return snapshot.counters[key] ?? 0;
}

export function connectionDiagnostics(snapshot: TelemetrySnapshot, activeSessions = 0): ConnectionDiagnostics {
  const arrivals = count(snapshot, "stage:request_arrival");
  const dispatches = count(snapshot, "stage:dispatch");
  const completions = count(snapshot, "stage:completion");
  const responses = count(snapshot, "stage:response");
  const dispatchFailures = count(snapshot, "stage:dispatch:error") + count(snapshot, "stage:dispatch:timeout");
  const responseFailures = count(snapshot, "stage:response:error") + count(snapshot, "stage:response:timeout");
  let state: ConnectionDiagnostics["state"];
  if (!arrivals) state = "no_requests";
  else if (!dispatches) state = "arrived_not_dispatched";
  else if (responseFailures > 0 && responses <= responseFailures) state = "response_failed";
  else if (dispatchFailures > 0 && completions === 0) state = "dispatch_failed";
  else if (dispatchFailures || responseFailures) state = "degraded";
  else state = "healthy";
  return {
    state,
    request_arrivals: arrivals,
    dispatches,
    completions,
    responses,
    dispatch_failures: dispatchFailures,
    response_failures: responseFailures,
    active_sessions: Math.max(0, Math.floor(activeSessions)),
    ...(snapshot.events.at(-1)?.timestamp ? { last_event_at: snapshot.events.at(-1)!.timestamp } : {})
  };
}
export interface ToolSurfaceDiagnostics {
  configured: {
    tool_mode: string;
    bash_mode: string;
    write_mode: string;
    codex_sessions: string;
    connection_test: boolean;
    analysis_enabled: boolean;
  };
  expected_tools: string[];
  registered_tools: string[];
  missing_tools: string[];
  unexpected_tools: string[];
  matches_expected: boolean;
  deadline: Record<string, unknown>;
  capabilities: Record<string, "available" | "unavailable">;
  resilience: { deadline_yields: number; deadline_limited_children: number; async_routes: number; job_started: number; job_completed: number; job_interrupted: number; batch_continued: number };
  timeout_risks: Array<{ tool: string; recommended_primitive: string; reason: string }>;
}

export function toolSurfaceDiagnostics(
  config: CodexProConfig,
  registeredTools: string[],
  expectedTools: string[] = registeredTools,
  telemetry?: TelemetrySnapshot
): ToolSurfaceDiagnostics {
  const expected = [...new Set(expectedTools)].sort();
  const registered = [...new Set(registeredTools)].sort();
  const registeredSet = new Set(registered);
  const expectedSet = new Set(expected);
  const missing = expected.filter((name) => !registeredSet.has(name));
  const unexpected = registered.filter((name) => !expectedSet.has(name));
  const has = (name: string) => registeredSet.has(name);
  const eventCount = (name: string) => telemetry?.counters[`event:${name}`] ?? 0;
  const timeoutRisks: Array<{ tool: string; recommended_primitive: string; reason: string }> = [];
  if (has("verify_changes") && has("start_verification")) timeoutRisks.push({ tool: "verify_changes", recommended_primitive: "start_verification", reason: "composite verification has a durable async alternative" });
  if (has("run_checks") && has("start_checks")) timeoutRisks.push({ tool: "run_checks", recommended_primitive: "start_checks", reason: "multi-check verification has a durable async alternative" });
  return {
    configured: {
      tool_mode: config.toolMode,
      bash_mode: config.bashMode,
      write_mode: config.writeMode,
      codex_sessions: config.codexSessions,
      connection_test: config.connectionTest,
      analysis_enabled: config.analysisEnabled
    },
    expected_tools: expected,
    registered_tools: registered,
    missing_tools: missing,
    unexpected_tools: unexpected,
    matches_expected: missing.length === 0 && unexpected.length === 0,
    deadline: { sync_call_deadline_mode: config.syncCallDeadlineMode, sync_call_deadline_ms: config.syncCallDeadlineMs, sync_call_deadline_minutes: config.syncCallDeadlineMs / 60_000, sync_call_deadline_default_ms: DEFAULT_SYNC_CALL_DEADLINE_MS, sync_call_deadline_min_ms: MIN_SYNC_CALL_DEADLINE_MS, sync_call_deadline_max_ms: MAX_SYNC_CALL_DEADLINE_MS },
    capabilities: { managed_processes: has("start_workspace_process") ? "available" : "unavailable", structured_jobs: has("job_status") && (has("start_checks") || has("start_verification")) ? "available" : "unavailable", resumable_batches: has("gather_context") && has("inspect_workspace") ? "available" : "unavailable", durable_goals: has("propose_goal") ? "available" : "unavailable" },
    resilience: { deadline_yields: eventCount("deadline_yield"), deadline_limited_children: eventCount("deadline_limited_child"), async_routes: eventCount("async_routed"), job_started: eventCount("job_started"), job_completed: eventCount("job_completed"), job_interrupted: eventCount("job_interrupted"), batch_continued: eventCount("batch_continued") },
    timeout_risks: timeoutRisks
  };
}

export function diagnosticsSnapshot(
  config: CodexProConfig,
  telemetry: TelemetrySnapshot,
  registeredTools: string[],
  expectedTools: string[],
  activeSessions = 0,
  operator: { savedDeadlineMode?: string; savedDeadlineMs?: number; activeStructuredJobs?: number } = {}
): Record<string, unknown> {
  return {
    connection: connectionDiagnostics(telemetry, activeSessions),
    operator: { current_effective_deadline: { mode: config.syncCallDeadlineMode, ms: config.syncCallDeadlineMs }, saved_next_run_deadline: { mode: operator.savedDeadlineMode ?? config.syncCallDeadlineMode, ms: operator.savedDeadlineMs ?? config.syncCallDeadlineMs }, active_structured_jobs: Math.max(0, Math.floor(operator.activeStructuredJobs ?? 0)), recent_deadline_yield: (telemetry.counters["event:deadline_yield"] ?? 0) > 0 },
    tool_surface: toolSurfaceDiagnostics(config, registeredTools, expectedTools, telemetry),
    telemetry: {
      counters: telemetry.counters,
      total_events: telemetry.totalEvents,
      recent_events: telemetry.events
    }
  };
}

export async function runToolTimeProbe(config: CodexProConfig, options: { maxMinutes?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal } = {}) {
  if (config.syncCallDeadlineMode !== "observe") throw new Error("tool_time_probe is available only in Unlimited/observe mode.");
  const maxMinutes = options.maxMinutes ?? 60;
  if (!Number.isInteger(maxMinutes) || maxMinutes < 1 || maxMinutes > 120) throw new Error("tool_time_probe max_minutes must be an integer from 1 to 120.");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = now();
  const targetMs = maxMinutes * 60_000;
  while (now() - started < targetMs) {
    if (options.signal?.aborted) return { status: "aborted" as const, elapsed_ms: Math.max(0, now() - started), saved_deadline_changed: false, guidance: "If ChatGPT closed the tool call without a server-visible abort, record the UI-observed host time manually; CodexPro does not infer or bypass the host limit." };
    await sleep(Math.min(1_000, targetMs - (now() - started)));
  }
  return { status: "completed" as const, elapsed_ms: Math.max(0, now() - started), saved_deadline_changed: false, guidance: "Record the ChatGPT UI/host cutoff manually if it closed earlier. This probe does not change saved deadline settings or bypass the external host tool window." };
}
