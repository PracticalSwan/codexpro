import { createHash } from "node:crypto";
import { hasSecretValue, redactSensitiveText } from "../redact.js";

export type GoalState = "proposed" | "approved" | "running" | "paused" | "awaiting_review" | "awaiting_projection" | "projected" | "canceled" | "failed";
export type GoalTaskState = "pending" | "running" | "succeeded" | "failed" | "canceled";
export type GoalTaskKind = "command" | "check";

export interface GoalTask {
  id: string;
  title: string;
  kind: GoalTaskKind;
  command?: string;
  checkId?: string;
  dependsOn: string[];
  state: GoalTaskState;
  operationId?: string;
  verification?: { ok: boolean; summary: string; durationMs?: number; exitCode?: number | null };
}

export interface GoalIsolation {
  root: string;
  sourceHead: string;
  createdAt: string;
}

export interface GoalRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  title: string;
  summary?: string;
  state: GoalState;
  control: "run" | "pause" | "cancel";
  fingerprint: string;
  maxWorkers: number;
  tasks: GoalTask[];
  createdAt: string;
  updatedAt: string;
  sourceHead?: string;
  sourceFingerprint?: string;
  sourceDirtyPaths?: string[];
  isolation?: GoalIsolation;
  reviewFingerprint?: string;
  reviewedPatchSha256?: string;
  reviewedPaths?: string[];
  projectionOperationId?: string;
  error?: string;
}

export interface GoalTaskInput {
  id: string; title: string; kind: GoalTaskKind; command?: string; checkId?: string; dependsOn?: string[];
}
export interface GoalProposalInput {
  workspace: { id: string; root: string };
  title: string; summary?: string; tasks: GoalTaskInput[]; maxWorkers?: number;
}

function oneLine(value: unknown, label: string, max: number): string {
  const text = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  if (!text || text.length > max) throw new Error(`${label} must be 1-${max} characters.`);
  return redactSensitiveText(text);
}
function taskId(value: unknown): string {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) throw new Error("Goal task id must be 1-64 characters using letters, numbers, dot, underscore, or dash.");
  return id;
}

export function normalizeGoalTasks(inputs: GoalTaskInput[], maxTasks = 64): GoalTask[] {
  if (!Array.isArray(inputs) || !inputs.length) throw new Error("Goal requires at least one task.");
  if (inputs.length > maxTasks) throw new Error(`Goal has too many tasks; limit is ${maxTasks}.`);
  const ids = new Set<string>();
  const tasks = inputs.map((input) => {
    const id = taskId(input.id); if (ids.has(id)) throw new Error(`Duplicate goal task id: ${id}`); ids.add(id);
    const kind = input.kind; if (kind !== "command" && kind !== "check") throw new Error(`Unsupported goal task kind: ${String(kind)}`);
    const dependsOn = [...new Set((input.dependsOn ?? []).map(taskId))];
    const title = oneLine(input.title, `Task ${id} title`, 160);
    if (kind === "command") {
      const command = String(input.command ?? "").replace(/[\r\n\0]+/g, " ").trim();
      if (!command || command.length > 2000) throw new Error(`Task ${id} command must be 1-2000 characters.`);
      if (hasSecretValue(command)) throw new Error(`Task ${id} command contains secret-looking content.`);
      return { id, title, kind, command, dependsOn, state: "pending" as const };
    }
    const checkId = oneLine(input.checkId, `Task ${id} check id`, 128);
    return { id, title, kind, checkId, dependsOn, state: "pending" as const };
  });
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) for (const dep of task.dependsOn) if (!byId.has(dep)) throw new Error(`Task ${task.id} depends on unknown task ${dep}.`);
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Goal task dependency cycle detected at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id); for (const dep of byId.get(id)!.dependsOn) visit(dep); visiting.delete(id); visited.add(id);
  };
  for (const task of tasks) visit(task.id);
  return tasks;
}

export function proposalFingerprint(input: { workspaceId: string; title: string; summary?: string; maxWorkers: number; tasks: GoalTask[] }): string {
  const canonical = JSON.stringify({
    workspaceId: input.workspaceId,
    title: input.title,
    summary: input.summary ?? "",
    maxWorkers: input.maxWorkers,
    tasks: input.tasks.map((task) => ({ id: task.id, title: task.title, kind: task.kind, command: task.command, checkId: task.checkId, dependsOn: [...task.dependsOn].sort() }))
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function boundedGoalError(error: unknown): string {
  return redactSensitiveText(error instanceof Error ? error.message : String(error)).replace(/[\r\n\0]+/g, " ").slice(0, 480);
}
