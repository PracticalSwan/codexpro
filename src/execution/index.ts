import type { CodexProConfig } from "../config.js";
import { DockerExecutionBackend, probeDockerBackend } from "./dockerBackend.js";
import { HostExecutionBackend } from "./hostBackend.js";
import type { ExecutionBackend, ExecutionBackendStatus } from "./types.js";

const hostBackend = new HostExecutionBackend();

export function resolveExecutionBackend(config: CodexProConfig): ExecutionBackend {
  return config.executionBackend === "docker" ? new DockerExecutionBackend(config) : hostBackend;
}

export function executionBackendStatus(config: CodexProConfig): ExecutionBackendStatus {
  return config.executionBackend === "docker"
    ? probeDockerBackend(config)
    : hostBackend.status();
}

export type { BackendProcessHandle, BackendStartRequest, ExecutionBackend, ExecutionBackendKind, ExecutionBackendStatus } from "./types.js";
