import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import type { CodexProConfig } from "../config.js";
import { CodexProError } from "../guard.js";
import { terminateHostProcessTree } from "./hostBackend.js";
import type { BackendProcessHandle, BackendStartRequest, ExecutionBackend, ExecutionBackendStatus } from "./types.js";

function dockerCliEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  return out;
}

function boundedContainerName(workspaceId: string): string {
  const label = workspaceId.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 36) || "workspace";
  return `codexpro-${label}-${randomUUID().slice(0, 12)}`.slice(0, 63);
}

export function containerWorkdir(cwdRel: string): string {
  const raw = String(cwdRel ?? ".").replaceAll("\\", "/");
  if (raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) throw new CodexProError("Docker cwd must stay inside the workspace.");
  const normalized = path.posix.normalize(raw || ".");
  if (normalized === ".." || normalized.startsWith("../")) throw new CodexProError("Docker cwd cannot escape the workspace.");
  return normalized === "." ? "/workspace" : `/workspace/${normalized.replace(/^\.\//, "")}`;
}

export function buildDockerRunArgs(config: CodexProConfig, request: {
  workspaceRoot: string;
  workspaceId: string;
  command: string;
  cwdRel: string;
  containerName: string;
}): string[] {
  const workspaceRoot = fs.realpathSync.native(request.workspaceRoot);
  if (workspaceRoot.includes(",")) throw new CodexProError("Docker workspace paths containing commas are unsupported.");
  if (!config.dockerImage) throw new CodexProError("Docker execution requires CODEXPRO_DOCKER_IMAGE.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,499}$/.test(config.dockerImage)) throw new CodexProError("Docker image reference is invalid.");
  const workdir = containerWorkdir(request.cwdRel);
  const workspaceLabel = request.workspaceId.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 63);
  return [
    "run", "--rm", "--init",
    "--network", "none",
    "--memory", `${config.dockerMemoryMb}m`,
    "--cpus", String(config.dockerCpus),
    "--pids-limit", String(config.dockerPidsLimit),
    "--mount", `type=bind,src=${workspaceRoot},dst=/workspace`,
    "--workdir", workdir,
    "--label", "codexpro.owner=codexpro",
    "--label", `codexpro.workspace=${workspaceLabel}`,
    "--label", `codexpro.container=${request.containerName}`,
    "--name", request.containerName,
    "--env", "TERM=dumb", "--env", "NO_COLOR=1", "--env", "CI=1",
    "--entrypoint", "/bin/sh", config.dockerImage, "-lc", request.command
  ];
}

export function probeDockerBackend(config: CodexProConfig): ExecutionBackendStatus {
  const executable = config.dockerExecutable || "docker";
  if (!config.dockerImage) {
    return { kind: "docker", available: false, daemonAvailable: false, imageConfigured: false,
      imageAvailable: false, goalDockerAvailable: false, executable: path.basename(executable), detail: "Docker image is not configured." };
  }
  const common = { encoding: "utf8" as const, windowsHide: true, timeout: 5_000, env: dockerCliEnv() };
  const version = spawnSync(executable, ["version", "--format", "{{.Server.Version}}"], common);
  if (version.error || version.status !== 0) {
    return { kind: "docker", available: false, daemonAvailable: false, imageConfigured: true,
      imageAvailable: false, goalDockerAvailable: false, executable: path.basename(executable), detail: "Docker daemon is unavailable." };
  }
  const image = spawnSync(executable, ["image", "inspect", config.dockerImage, "--format", "{{.Id}}"], common);
  if (image.error || image.status !== 0) {
    return { kind: "docker", available: false, daemonAvailable: true, imageConfigured: true,
      imageAvailable: false, goalDockerAvailable: false, executable: path.basename(executable), detail: "Configured Docker image is not available locally." };
  }
  return { kind: "docker", available: true, daemonAvailable: true, imageConfigured: true,
    imageAvailable: true, goalDockerAvailable: false, executable: path.basename(executable) };
}

export class DockerExecutionBackend implements ExecutionBackend {
  readonly kind = "docker" as const;
  constructor(private readonly config: CodexProConfig) {}

  start(request: BackendStartRequest): BackendProcessHandle {
    const status = probeDockerBackend(this.config);
    if (!status.available) throw new CodexProError(status.detail || "Docker execution backend is unavailable.");
    const containerName = boundedContainerName(request.workspace.id);
    const args = buildDockerRunArgs(this.config, {
      workspaceRoot: request.workspace.root,
      workspaceId: request.workspace.id,
      command: request.command,
      cwdRel: request.cwdRel,
      containerName
    });
    const child = spawn(this.config.dockerExecutable || "docker", args, {
      env: dockerCliEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });
    return { kind: this.kind, child, containerName };
  }

  stop(handle: BackendProcessHandle, signal: NodeJS.Signals): void {
    const name = String(handle.containerName ?? "");
    const executable = this.config.dockerExecutable || "docker";
    if (!/^codexpro-[A-Za-z0-9_.-]{1,63}$/.test(name)) {
      handle.cleanupError = "Refused Docker cleanup because the container identity is not CodexPro-owned.";
      terminateHostProcessTree(handle.child, signal);
      return;
    }
    const expected = `codexpro|${name}`;
    const ownership = spawnSync(executable, [
      "inspect", "--format", '{{index .Config.Labels "codexpro.owner"}}|{{index .Config.Labels "codexpro.container"}}', name
    ], { encoding: "utf8", env: dockerCliEnv(), windowsHide: true, timeout: 5_000 });
    if (ownership.error || ownership.status !== 0 || String(ownership.stdout ?? "").trim() !== expected) {
      handle.cleanupError = "Refused Docker cleanup because container ownership could not be verified.";
      terminateHostProcessTree(handle.child, signal);
      return;
    }
    const removed = spawnSync(executable, ["rm", "-f", name], {
      env: dockerCliEnv(), stdio: "ignore", windowsHide: true, timeout: 5_000
    });
    if (removed.error || removed.status !== 0) {
      handle.cleanupError = "Docker container cleanup failed after ownership verification.";
    }
    terminateHostProcessTree(handle.child, signal);
  }

  status(): ExecutionBackendStatus {
    return probeDockerBackend(this.config);
  }
}
