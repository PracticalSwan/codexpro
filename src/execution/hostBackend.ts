import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { CodexProError } from "../guard.js";
import type { BackendProcessHandle, BackendStartRequest, ExecutionBackend, ExecutionBackendStatus } from "./types.js";

export function terminateHostProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    if (result.status !== 0) child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(signal);
  }
}

export class HostExecutionBackend implements ExecutionBackend {
  readonly kind = "host" as const;

  start(request: BackendStartRequest): BackendProcessHandle {
    if (!request.hostExecutable) throw new CodexProError("Host Bash executable is unavailable.");
    const child = spawn(request.hostExecutable, ["-lc", request.command], {
      cwd: request.cwdAbs,
      env: request.hostEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });
    return { kind: this.kind, child };
  }

  stop(handle: BackendProcessHandle, signal: NodeJS.Signals): void {
    terminateHostProcessTree(handle.child, signal);
  }

  status(): ExecutionBackendStatus {
    return { kind: this.kind, available: true, goalDockerAvailable: false };
  }
}
