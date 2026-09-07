import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { ChildProcess } from "node:child_process";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import { CodexProError, type PathGuard, type Workspace } from "./guard.js";
import {
  assertBashCommandAllowed,
  assertBashSession,
  decodeBashOutput,
  makeRestrictedBashEnv,
  resolveBashRuntime
} from "./bashOps.js";
import { redactSensitiveText } from "./redact.js";
import { resolveExecutionBackend, type BackendProcessHandle, type ExecutionBackend } from "./execution/index.js";
import type { OperationManager } from "./operations/manager.js";

export type WorkspaceProcessState = "running" | "stopping" | "exited" | "failed";
export type WorkspaceProcessTerminationReason = "exit" | "signal" | "stopped" | "shutdown" | "spawn_error";

export interface WorkspaceProcessRecord {
  id: string;
  workspaceId: string;
  state: WorkspaceProcessState;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  terminationReason?: WorkspaceProcessTerminationReason;
  operationId: string;
  observedOutputBytes: number;
  retainedOutputBytes: number;
  droppedOutputBytes: number;
  error?: string;
  cleanupError?: string;
}export interface ProcessOutputPage {
  processId: string;
  cursor: number;
  nextCursor: number;
  hasMore: boolean;
  truncated: boolean;
  droppedBytes: number;
  stdout: string;
  stderr: string;
}

export interface StartWorkspaceProcessRequest {
  command: string;
  cwd?: string;
  sessionId?: string;
}

interface OutputChunk {
  start: number;
  end: number;
  stream: "stdout" | "stderr";
  data: Buffer;
}

interface ProcessEntry {
  id: string;
  child: ChildProcess;
  backend: ExecutionBackend;
  backendHandle: BackendProcessHandle;
  record: WorkspaceProcessRecord;
  chunks: OutputChunk[];
  observedBytes: number;
  retainedBytes: number;
  droppedBefore: number;
  requestedTermination?: WorkspaceProcessTerminationReason;
  closed: Promise<void>;
  resolveClosed: () => void;
}

interface WorkspaceProcessManagerOptions {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  operationManager: OperationManager;
  maxProcesses?: number;
}function relativeCwd(workspace: Workspace, cwd: string): string {
  return path.relative(workspace.root, cwd).split(path.sep).join("/") || ".";
}

function boundedError(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error))
    .replace(/[\r\n\0]+/g, " ")
    .slice(0, 480);
}

function publicRecord(entry: ProcessEntry): WorkspaceProcessRecord {
  return {
    ...entry.record,
    observedOutputBytes: entry.observedBytes,
    retainedOutputBytes: entry.retainedBytes,
    droppedOutputBytes: entry.droppedBefore
  };
}

export class WorkspaceProcessManager {
  private readonly entries = new Map<string, ProcessEntry>();
  private readonly maxProcesses: number;
  private closing = false;

  constructor(private readonly options: WorkspaceProcessManagerOptions) {
    this.maxProcesses = Math.max(1, Math.min(options.maxProcesses ?? options.config.maxWorkspaceProcesses, 64));
  }

  async start(request: StartWorkspaceProcessRequest): Promise<WorkspaceProcessRecord> {
    if (this.closing) throw new CodexProError("Workspace process manager is closing.");
    const command = String(request.command ?? "").trim();
    if (!command) throw new CodexProError("command is required.");
    assertBashSession(this.options.config, request.sessionId);
    assertBashCommandAllowed(this.options.config, command);

    const cwdResolved = this.options.guard.resolve(this.options.workspace, request.cwd ?? ".");
    if (!fs.statSync(cwdResolved.absPath).isDirectory()) throw new CodexProError(`Process cwd is not a directory: ${cwdResolved.relPath}`);
    const active = [...this.entries.values()].filter((entry) => entry.record.state === "running" || entry.record.state === "stopping").length;
    if (active >= this.maxProcesses) throw new CodexProError(`Workspace process limit reached (${this.maxProcesses}).`);

    const backend = resolveExecutionBackend(this.options.config);
    let hostExecutable: string | undefined;
    if (backend.kind === "host") {
      const runtime = resolveBashRuntime(this.options.config);
      if (!runtime.available || !runtime.executable) throw new CodexProError(runtime.error || "Bash is unavailable.");
      hostExecutable = runtime.executable;
    }
    const receipt = await this.options.operationManager.start({ kind: "workspace_process" });
    const id = `proc_${randomUUID()}`;    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => { resolveClosed = resolve; });
    let backendHandle: BackendProcessHandle;
    try {
      backendHandle = backend.start({
        config: this.options.config,
        workspace: this.options.workspace,
        command,
        cwdAbs: cwdResolved.absPath,
        cwdRel: relativeCwd(this.options.workspace, cwdResolved.absPath),
        ...(backend.kind === "host" ? { hostExecutable, hostEnv: makeRestrictedBashEnv(this.options.config) } : {})
      });
    } catch (error) {
      await this.options.operationManager.fail(receipt.id, error).catch(() => {});
      throw error;
    }
    const child = backendHandle.child;
    const entry: ProcessEntry = {
      id,
      child,
      backend,
      backendHandle,
      record: {
        id,
        workspaceId: this.options.workspace.id,
        state: "running",
        cwd: relativeCwd(this.options.workspace, cwdResolved.absPath),
        startedAt: new Date().toISOString(),
        exitCode: null,
        signal: null,
        operationId: receipt.id,
        observedOutputBytes: 0,
        retainedOutputBytes: 0,
        droppedOutputBytes: 0
      },
      chunks: [],
      observedBytes: 0,
      retainedBytes: 0,
      droppedBefore: 0,
      closed,
      resolveClosed
    };
    this.entries.set(id, entry);

    child.stdout?.on("data", (chunk) => this.appendOutput(entry, "stdout", Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => this.appendOutput(entry, "stderr", Buffer.from(chunk)));
    child.on("error", (error) => this.handleSpawnError(entry, error));
    child.on("close", (exitCode, signal) => this.handleClose(entry, exitCode, signal));
    return publicRecord(entry);
  }
  status(id: string): WorkspaceProcessRecord {
    return publicRecord(this.requireEntry(id));
  }

  readOutput(id: string, options: { cursor?: number; maxBytes?: number } = {}): ProcessOutputPage {
    const entry = this.requireEntry(id);
    const requestedCursor = options.cursor ?? entry.droppedBefore;
    if (!Number.isInteger(requestedCursor) || requestedCursor < 0) throw new CodexProError("Process output cursor must be a non-negative integer.");
    if (requestedCursor > entry.observedBytes) throw new CodexProError(`Process output cursor is beyond available output: ${requestedCursor}.`);
    const cursor = Math.max(requestedCursor, entry.droppedBefore);
    const maxBytes = Math.max(1, Math.min(options.maxBytes ?? this.options.config.maxProcessReadBytes, this.options.config.maxProcessReadBytes));
    const limit = Math.min(entry.observedBytes, cursor + maxBytes);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let nextCursor = cursor;

    for (const chunk of entry.chunks) {
      if (chunk.end <= cursor || chunk.start >= limit) continue;
      const from = Math.max(cursor, chunk.start) - chunk.start;
      const to = Math.min(limit, chunk.end) - chunk.start;
      const slice = chunk.data.subarray(from, to);
      if (chunk.stream === "stdout") stdout.push(slice);
      else stderr.push(slice);
      nextCursor = Math.max(nextCursor, chunk.start + to);
    }
    return {
      processId: id,
      cursor,
      nextCursor,
      hasMore: nextCursor < entry.observedBytes,
      truncated: requestedCursor < entry.droppedBefore,
      droppedBytes: entry.droppedBefore,
      stdout: redactSensitiveText(decodeBashOutput(Buffer.concat(stdout), process.platform, true)),
      stderr: redactSensitiveText(decodeBashOutput(Buffer.concat(stderr), process.platform, true))
    };
  }

  async stop(id: string): Promise<WorkspaceProcessRecord> {
    return this.terminate(id, "stopped");
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const active = [...this.entries.values()].filter((entry) => entry.record.state === "running" || entry.record.state === "stopping");
    await Promise.allSettled(active.map((entry) => this.terminate(entry.id, "shutdown")));
  }
  private requireEntry(id: string): ProcessEntry {
    if (!/^proc_[A-Za-z0-9-]{1,80}$/.test(String(id ?? ""))) throw new CodexProError(`Unknown process id: ${id}`);
    const entry = this.entries.get(id);
    if (!entry) throw new CodexProError(`Unknown process id: ${id}`);
    return entry;
  }

  private appendOutput(entry: ProcessEntry, stream: "stdout" | "stderr", data: Buffer): void {
    if (!data.byteLength) return;
    const start = entry.observedBytes;
    const end = start + data.byteLength;
    entry.observedBytes = end;
    entry.retainedBytes += data.byteLength;
    entry.chunks.push({ start, end, stream, data });
    const maxRetained = Math.max(1, this.options.config.maxProcessOutputBytes);
    while (entry.retainedBytes > maxRetained && entry.chunks.length) {
      const first = entry.chunks[0];
      const excess = entry.retainedBytes - maxRetained;
      if (first.data.byteLength <= excess) {
        entry.chunks.shift();
        entry.retainedBytes -= first.data.byteLength;
        entry.droppedBefore = first.end;
        continue;
      }
      first.data = first.data.subarray(excess);
      first.start += excess;
      entry.retainedBytes -= excess;
      entry.droppedBefore = first.start;
    }
  }

  private handleSpawnError(entry: ProcessEntry, error: unknown): void {
    entry.record.state = "failed";
    entry.record.endedAt = new Date().toISOString();
    entry.record.terminationReason = "spawn_error";
    entry.record.error = boundedError(error);
    entry.resolveClosed();
    void this.options.operationManager.fail(entry.record.operationId, error).catch(() => {});
  }

  private handleClose(entry: ProcessEntry, exitCode: number | null, signal: NodeJS.Signals | null): void {
    if (entry.record.state === "failed") return;
    entry.record.state = "exited";
    entry.record.endedAt = new Date().toISOString();
    entry.record.exitCode = exitCode;
    entry.record.signal = signal;
    entry.record.terminationReason = entry.requestedTermination ?? (signal ? "signal" : "exit");
    if (entry.backendHandle.cleanupError) entry.record.cleanupError = entry.backendHandle.cleanupError;
    entry.resolveClosed();
    const durationMs = Math.max(0, Date.now() - Date.parse(entry.record.startedAt));
    void this.options.operationManager.complete(entry.record.operationId, { durationMs, exitCode }).catch(() => {});
  }
  private async terminate(id: string, reason: "stopped" | "shutdown"): Promise<WorkspaceProcessRecord> {
    const entry = this.requireEntry(id);
    if (entry.record.state !== "running" && entry.record.state !== "stopping") return publicRecord(entry);
    entry.record.state = "stopping";
    entry.requestedTermination = reason;
    entry.backend.stop(entry.backendHandle, "SIGTERM");
    if (entry.backendHandle.cleanupError) entry.record.cleanupError = entry.backendHandle.cleanupError;
    const timeout = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_500);
      timer.unref();
    });
    await Promise.race([entry.closed, timeout]);
    if (["running", "stopping"].includes(entry.record.state)) {
      entry.backend.stop(entry.backendHandle, "SIGKILL");
      if (entry.backendHandle.cleanupError) entry.record.cleanupError = entry.backendHandle.cleanupError;
      await Promise.race([entry.closed, new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        timer.unref();
      })]);
    }
    if (entry.record.state === "stopping") {
      entry.record.state = "failed";
      entry.record.endedAt = new Date().toISOString();
      entry.record.terminationReason = reason;
      entry.record.error = "Process did not report exit after termination.";
      entry.resolveClosed();
      await this.options.operationManager.fail(entry.record.operationId, new Error(entry.record.error)).catch(() => {});
    }
    return publicRecord(entry);
  }
}
