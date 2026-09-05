import type { CodexProConfig } from "./config.js";
import type { TelemetrySnapshot } from "./telemetry.js";

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
}

export function toolSurfaceDiagnostics(
  config: CodexProConfig,
  registeredTools: string[],
  expectedTools: string[] = registeredTools
): ToolSurfaceDiagnostics {
  const expected = [...new Set(expectedTools)].sort();
  const registered = [...new Set(registeredTools)].sort();
  const registeredSet = new Set(registered);
  const expectedSet = new Set(expected);
  const missing = expected.filter((name) => !registeredSet.has(name));
  const unexpected = registered.filter((name) => !expectedSet.has(name));
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
    matches_expected: missing.length === 0 && unexpected.length === 0
  };
}

export function diagnosticsSnapshot(
  config: CodexProConfig,
  telemetry: TelemetrySnapshot,
  registeredTools: string[],
  expectedTools: string[],
  activeSessions = 0
): Record<string, unknown> {
  return {
    connection: connectionDiagnostics(telemetry, activeSessions),
    tool_surface: toolSurfaceDiagnostics(config, registeredTools, expectedTools),
    telemetry: {
      counters: telemetry.counters,
      total_events: telemetry.totalEvents,
      recent_events: telemetry.events
    }
  };
}
