import type { ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import type { CodexProConfig } from "../config.js";
import type { Workspace } from "../guard.js";

export type ExecutionBackendKind = "host" | "docker";

export interface BackendStartRequest {
  config: CodexProConfig;
  workspace: Workspace;
  command: string;
  cwdAbs: string;
  cwdRel: string;
  hostExecutable?: string;
  hostEnv?: NodeJS.ProcessEnv;
}

export type BackendChildProcess = ChildProcess & { stdout: Readable; stderr: Readable };

export interface BackendProcessHandle {
  kind: ExecutionBackendKind;
  child: BackendChildProcess;
  containerName?: string;
  cleanupError?: string;
}

export interface ExecutionBackendStatus {
  kind: ExecutionBackendKind;
  available: boolean;
  daemonAvailable?: boolean;
  imageConfigured?: boolean;
  imageAvailable?: boolean;
  goalDockerAvailable: boolean;
  executable?: string;
  detail?: string;
}

export interface ExecutionBackend {
  readonly kind: ExecutionBackendKind;
  start(request: BackendStartRequest): BackendProcessHandle;
  stop(handle: BackendProcessHandle, signal: NodeJS.Signals): void;
  status(): ExecutionBackendStatus;
}
