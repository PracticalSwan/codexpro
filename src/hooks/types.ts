export type HookEvent = "session_start" | "before_tool" | "after_tool" | "task_end";

export interface HookCommand {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface HookConfig {
  version: 1;
  hooks: Partial<Record<HookEvent, HookCommand[]>>;
}

export interface HookRunResult {
  event: HookEvent;
  status: "allowed" | "blocked" | "warning" | "skipped";
  exitCode: number | null;
  message?: string;
}

export interface HookRequest {
  root: string;
  trustDir?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  input?: Record<string, unknown>;
}
