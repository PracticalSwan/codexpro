import type { CapabilityExplanation } from "./capabilityExplain.js";
import type { GitCommitSummary } from "./gitOps.js";

export interface WorkspaceBriefingInput {
  workspace: { id: string; pathLabel: string };
  gitStatus: string;
  recentCommits: GitCommitSummary[];
  instructions: Array<{ path: string; scope: string }>;
  project?: { languages: string[]; projectTypes: string[]; packageManager?: string; entrypoints: string[] };
  checks?: Array<{ id: string; label: string }>;
  activeWork?: { processes: number; jobs: number; batches: number; goals: number; failed?: number; interrupted?: number };
  capabilities: CapabilityExplanation[];
  warnings?: string[];
}

export interface BriefingAttention {
  code: string;
  message: string;
  related?: string[];
}

export interface WorkspaceBriefingV2 {
  workspace: { id: string; pathLabel: string };
  git: { branch: string | null; head: string | null; ahead: number | null; behind: number | null; dirty: boolean };
  instructions: Array<{ path: string; scope: string }>;
  project: { languages: string[]; projectTypes: string[]; packageManager?: string; entrypoints: string[] };
  checks: Array<{ id: string; label: string }>;
  activeWork: { processes: number; jobs: number; batches: number; goals: number };
  capabilities: Record<string, CapabilityExplanation["state"]>;
  attention_required: BriefingAttention[];
  warnings: string[];
}

function gitBriefing(status: string, head: string | null): WorkspaceBriefingV2["git"] {
  if (gitStatusFailure(status)) return { branch: null, head: null, ahead: null, behind: null, dirty: false };
  const lines = status.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## "))?.slice(3) ?? "";
  const detached = /\bHEAD detached/i.test(branchLine);
  const branch = detached ? null : (branchLine.split("...")[0].trim() || null);
  const ahead = Number(/\bahead (\d+)/i.exec(branchLine)?.[1] ?? NaN);
  const behind = Number(/\bbehind (\d+)/i.exec(branchLine)?.[1] ?? NaN);
  return { branch, head, ahead: Number.isFinite(ahead) ? ahead : null, behind: Number.isFinite(behind) ? behind : null, dirty: lines.some((line) => !line.startsWith("## ") && line !== "(no output)") };
}

function gitStatusFailure(status: string): boolean {
  const value = status.trim();
  return /^(?:fatal:|error:|git unavailable or failed:|git exited with status|usage: git )/i.test(value) || /not a git repository/i.test(value);
}

export function composeWorkspaceBriefing(input: WorkspaceBriefingInput): WorkspaceBriefingV2 {
  const git = gitBriefing(input.gitStatus, input.recentCommits[0]?.shortSha ?? null);
  const gitUnavailable = gitStatusFailure(input.gitStatus);
  const attention: BriefingAttention[] = [];
  if (gitUnavailable) attention.push({ code: "git_status_unavailable", message: "Git status could not be read; worktree cleanliness and branch state are unknown." });
  if (git.dirty) attention.push({ code: "dirty_worktree", message: "Working tree has staged, modified, or untracked changes." });
  if (!git.branch && !gitUnavailable) attention.push({ code: "detached_head", message: "Git HEAD is detached; confirm the intended branch before committing." });
  if ((git.ahead ?? 0) > 0) attention.push({ code: "branch_ahead", message: `Local branch is ahead of its upstream by ${git.ahead} commit${git.ahead === 1 ? "" : "s"}.` });
  if ((git.behind ?? 0) > 0) attention.push({ code: "branch_behind", message: `Local branch is behind its upstream by ${git.behind} commit${git.behind === 1 ? "" : "s"}.` });
  const work = input.activeWork ?? { processes: 0, jobs: 0, batches: 0, goals: 0 };
  if (work.processes || work.jobs || work.batches || work.goals) attention.push({ code: "active_durable_work", message: "Durable work is active; inspect its status before starting overlapping work." });
  if ((work.failed ?? 0) > 0) attention.push({ code: "failed_durable_work", message: `${work.failed} durable operation${work.failed === 1 ? "" : "s"} needs reconciliation.` });
  if ((work.interrupted ?? 0) > 0) attention.push({ code: "interrupted_durable_work", message: `${work.interrupted} durable operation${work.interrupted === 1 ? "" : "s"} was interrupted.` });
  if (!input.instructions.length) attention.push({ code: "no_instructions", message: "No applicable AGENTS.md-style instruction file was found." });
  if (!input.checks?.length) attention.push({ code: "no_trusted_checks", message: "No trusted verification checks were discovered." });
  for (const capability of input.capabilities.filter((item) => item.state === "unavailable" || item.state === "degraded").slice(0, 8)) {
    attention.push({ code: `capability_${capability.id}`, message: `${capability.id} is ${capability.state}: ${capability.reason}`, related: [capability.id] });
  }
  return {
    workspace: { id: input.workspace.id.slice(0, 160), pathLabel: input.workspace.pathLabel.slice(0, 240) },
    git,
    instructions: input.instructions.slice(0, 32),
    project: {
      languages: [...new Set((input.project?.languages ?? []).map((value) => value.slice(0, 80)))].slice(0, 32),
      projectTypes: [...new Set((input.project?.projectTypes ?? []).map((value) => value.slice(0, 80)))].slice(0, 32),
      ...(input.project?.packageManager ? { packageManager: input.project.packageManager.slice(0, 80) } : {}),
      entrypoints: [...new Set((input.project?.entrypoints ?? []).map((value) => value.slice(0, 200)))].slice(0, 32)
    },
    checks: (input.checks ?? []).slice(0, 32),
    activeWork: { processes: Math.max(0, Math.floor(work.processes)), jobs: Math.max(0, Math.floor(work.jobs)), batches: Math.max(0, Math.floor(work.batches)), goals: Math.max(0, Math.floor(work.goals)) },
    capabilities: Object.fromEntries(input.capabilities.map((capability) => [capability.id, capability.state])),
    attention_required: attention.slice(0, 24),
    warnings: [...new Set([...(input.warnings ?? []), ...(gitUnavailable ? ["Git status was unavailable; Git-derived attention is limited to the explicit unavailable state."] : [])].map((warning) => warning.slice(0, 360)))].slice(0, 16)
  };
}
