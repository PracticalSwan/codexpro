import type { CodexProConfig } from "./config.js";
import { redactSensitiveText } from "./redact.js";

export interface CapabilityExplanation {
  id: string;
  state: "available" | "disabled" | "unavailable" | "degraded";
  reasonCode?: string;
  reason: string;
  source: "runtime" | "profile" | "policy" | "dependency" | "platform";
  takesEffect?: "current" | "next_launch";
}

export interface CapabilityExplanationInput {
  config: Pick<CodexProConfig, "writeMode" | "bashMode" | "goalsEnabled" | "allowGitPush" | "analysisEnabled" | "codeGraphEnabled" | "lspEnabled" | "artifactExportEnabled" | "localServiceProbeEnabled">;
  registeredTools?: readonly string[];
  providerStatuses?: ReadonlyArray<{ id: string; available: boolean; detail?: string }>;
  takesEffect?: "current" | "next_launch";
}

const descriptors = [
  { id: "workspace_write", label: "Workspace write" },
  { id: "bash", label: "Bash" },
  { id: "structured_jobs", label: "Structured jobs" },
  { id: "durable_goals", label: "Durable goals" },
  { id: "git_push", label: "Git push" },
  { id: "analysis", label: "Workspace analysis" },
  { id: "codegraph", label: "CodeGraph" },
  { id: "lsp", label: "LSP" },
  { id: "artifact_export", label: "Artifact export" },
  { id: "local_service_probe", label: "Local service probe" }
] as const;

function item(
  descriptor: (typeof descriptors)[number],
  state: CapabilityExplanation["state"],
  reasonCode: string,
  reason: string,
  source: CapabilityExplanation["source"],
  takesEffect: CapabilityExplanation["takesEffect"]
): CapabilityExplanation {
  return { id: descriptor.id, state, reasonCode, reason, source, ...(takesEffect ? { takesEffect } : {}) };
}

function safeProviderDetail(value: string): string {
  return redactSensitiveText(value)
    .replace(/\b[A-Za-z]:[\\/][^\s"'`<>]+/g, "[path]")
    .replace(/(^|[\s(])\/(?:[^\s/]+\/)+[^\s)]+/g, "$1[path]")
    .slice(0, 180);
}

export function explainCapabilities(input: CapabilityExplanationInput): CapabilityExplanation[] {
  const config = input.config;
  const registered = new Set(input.registeredTools ?? []);
  const providers = new Map((input.providerStatuses ?? []).map((status) => [status.id, status]));
  const effect = input.takesEffect ?? "current";
  const result: CapabilityExplanation[] = [];

  const write = descriptors[0];
  result.push(config.writeMode === "off"
    ? item(write, "disabled", "write_mode_off", "Workspace writes are disabled by the selected write mode.", "profile", effect)
    : item(write, "available", "write_mode_enabled", `Workspace writes are enabled (${config.writeMode}).`, "runtime", effect));

  const bash = descriptors[1];
  result.push(config.bashMode === "off"
    ? item(bash, "disabled", "bash_mode_off", "Bash is disabled by the selected bash mode.", "profile", effect)
    : item(bash, "available", "bash_mode_enabled", `Bash is enabled (${config.bashMode}).`, "runtime", effect));

  const jobs = descriptors[2];
  result.push((registered.has("job_status") && (registered.has("start_checks") || registered.has("start_verification") || registered.has("start_workspace_process")))
    ? item(jobs, "available", "job_tools_registered", "Durable job status and at least one job starter are registered.", "runtime", effect)
    : item(jobs, "unavailable", "job_tools_not_registered", "The current tool mode does not register the durable job surface.", "policy", effect));

  const goals = descriptors[3];
  result.push(!config.goalsEnabled
    ? item(goals, "disabled", "goals_disabled", "Durable Goals are disabled in the current profile.", "profile", effect)
    : !registered.has("propose_goal")
      ? item(goals, "unavailable", "goal_tool_not_registered", "Goals are enabled in configuration but the goal tool is not registered for this mode.", "policy", effect)
      : item(goals, "available", "goals_enabled", "Durable Goals are enabled and registered.", "runtime", effect));

  const push = descriptors[4];
  result.push(!config.allowGitPush
    ? item(push, "disabled", "git_push_disabled", "Git push is disabled by policy; local commits remain separate.", "policy", effect)
    : !registered.has("git_push")
      ? item(push, "unavailable", "git_push_tool_not_registered", "Git push is allowed by configuration but the tool is not registered in this mode.", "policy", effect)
      : item(push, "available", "git_push_enabled", "Git push is enabled by the current policy and tool surface.", "policy", effect));

  const analysis = descriptors[5];
  result.push(!config.analysisEnabled
    ? item(analysis, "disabled", "analysis_disabled", "Workspace analysis is disabled in the current profile.", "profile", effect)
    : !registered.has("inspect_workspace")
      ? item(analysis, "unavailable", "analysis_tool_not_registered", "Analysis is enabled but inspect_workspace is not registered for this mode.", "policy", effect)
      : item(analysis, "available", "analysis_enabled", "Workspace analysis is enabled and registered.", "runtime", effect));

  for (const descriptor of [descriptors[6], descriptors[7]] as const) {
    const enabled = descriptor.id === "codegraph" ? config.codeGraphEnabled : config.lspEnabled;
    const provider = providers.get(descriptor.id);
    if (!enabled) {
      result.push(item(descriptor, "disabled", `${descriptor.id}_disabled`, `${descriptor.label} is disabled in the current profile.`, "profile", effect));
    } else if (provider && !provider.available) {
      result.push(item(descriptor, "unavailable", `${descriptor.id}_dependency_unavailable`, `${descriptor.label} is enabled but its provider is unavailable${provider.detail ? `: ${safeProviderDetail(provider.detail)}` : "."}`, "dependency", effect));
    } else if (!registered.has(descriptor.id === "codegraph" ? "codegraph_sync" : "code_intelligence_status")) {
      result.push(item(descriptor, "unavailable", `${descriptor.id}_tool_not_registered`, `${descriptor.label} is enabled but its status surface is not registered in this mode.`, "policy", effect));
    } else if (!provider) {
      result.push(item(descriptor, "degraded", `${descriptor.id}_status_unknown`, `${descriptor.label} is enabled and registered, but provider readiness was not queried on this surface.`, "dependency", effect));
    } else {
      result.push(item(descriptor, "available", `${descriptor.id}_enabled`, `${descriptor.label} is enabled and its status surface is registered.`, "runtime", effect));
    }
  }

  const exportDescriptor = descriptors[8];
  result.push(!config.artifactExportEnabled
    ? item(exportDescriptor, "disabled", "artifact_export_disabled", "Artifact export is disabled in the current profile.", "profile", effect)
    : !registered.has("export_artifact")
      ? item(exportDescriptor, "unavailable", "artifact_export_tool_not_registered", "Artifact export is enabled but its tool is not registered in this mode.", "policy", effect)
      : item(exportDescriptor, "available", "artifact_export_enabled", "Artifact export is enabled and registered.", "runtime", effect));

  const localProbe = descriptors[9];
  result.push(!config.localServiceProbeEnabled
    ? item(localProbe, "disabled", "local_service_probe_disabled", "Local service probing is disabled by default; enable it explicitly for the next launch.", "profile", effect)
    : !registered.has("probe_local_service")
      ? item(localProbe, "unavailable", "local_service_probe_not_registered", "Local service probing is enabled but only the Full-mode probe can register it.", "policy", effect)
      : item(localProbe, "available", "local_service_probe_enabled", "Loopback GET/HEAD observation is enabled in Full mode.", "runtime", effect));

  return result;
}
