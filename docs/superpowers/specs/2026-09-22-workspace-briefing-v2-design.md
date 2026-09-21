# Plan 42 — AI-Ready Workspace Briefing v2 Design

Created: 2026-09-22
Status: Planned
Priority: P0

## Problem

A fresh AI turn typically spends several calls recovering basic project state: branch/HEAD, dirty files, applicable instructions, project type, scripts/checks, active durable work, and effective capability gates. CodexPro already exposes all of this through separate tools and modules, but the first-turn experience is fragmented.

The improvement should not create another context engine or task object. It should deepen the existing `workspace_snapshot` into a bounded, deterministic project briefing assembled from current authoritative sources.

## Goals

- Extend `workspace_snapshot` with an additive structured briefing.
- Aggregate current Git/workspace/instruction/project/check/durable-work/capability evidence in one read-only call.
- Add a small deterministic `attention_required` section for concrete operator/AI hazards.
- Preserve current snapshot compatibility and output bounds.
- Reuse existing modules; no new persistent state.

## Non-goals

- No LLM-generated summary inside CodexPro.
- No embeddings/vector database.
- No new `workspace_briefing` MCP tool unless compatibility constraints prove extension impossible.
- No automatic fixes, installs, checkout, staging, process control, or permission changes.
## Existing seams to reuse

- `workspace_snapshot` registration/orchestration in `src/server.ts`.
- workspace/Git state in `src/gitOps.ts` and workspace registry.
- applicable instructions from `src/instructionOps.ts`.
- project inventory from `src/analysis/*`.
- trusted checks from `src/checksOps.ts`.
- durable process/job/batch/Goal stores through their existing read-only status/list APIs.
- effective policy/tool capability diagnostics.
- package/build identity once Plan 38 exists; the design must work without it.

## Structured shape

Add an optional/additive block such as:

```ts
interface WorkspaceBriefingV2 {
  workspace: { id: string; pathLabel: string };
  git: { branch: string | null; head: string | null; ahead: number | null; behind: number | null; dirty: boolean };
  instructions: Array<{ path: string; scope: string }>;
  project: { languages: string[]; projectTypes: string[]; packageManager?: string; entrypoints: string[] };
  checks: Array<{ id: string; label: string }>;
  activeWork: { processes: number; jobs: number; batches: number; goals: number };
  capabilities: Record<string, "available" | "disabled" | "unavailable">;
  attentionRequired: BriefingAttention[];
}
```

Use path labels/redaction conventions already used by diagnostics.
## Attention rules

`attention_required` is deterministic and evidence-based, not an AI judgment. Initial reasons may include:

- dirty/staged/untracked user work;
- detached HEAD;
- local branch ahead/behind upstream when known;
- active durable work;
- failed/interrupted durable work requiring reconciliation;
- missing applicable project instructions only when the repository explicitly expects them;
- configured optional provider unavailable/stale;
- restrictive policy/capability gate relevant to normal development;
- no trusted checks discovered.

Each item should have stable `code`, short `message`, and optional related path/tool IDs. Avoid severity scoring unless an existing deterministic severity enum already exists.

## Budgeting

- Keep the entire briefing bounded independently of the normal snapshot text.
- Do not include file bodies, diffs, command output, prompts, or job logs.
- Cap instruction paths/check IDs/entrypoints/attention entries.
- Prefer counts + identifiers over expensive nested status payloads.
- Gathering must remain fast/read-only; do not recursively inspect large workspaces beyond existing cached/bounded inventory behavior.
## Compatibility

- Existing `workspace_snapshot` text/structured keys must remain valid.
- Add `briefing` as an additive structured field and optionally a concise text section.
- If one optional source fails, record a bounded warning/attention item and keep the remainder useful.
- Connection-test/read-only modes remain safe.

## Acceptance criteria

- One snapshot call reports current branch/HEAD/dirty state, applicable instructions, project types/languages, trusted checks, active durable-work counts, and major capability state.
- Dirty/staged/untracked work produces deterministic attention entries without embedding diff contents.
- Active job/Goal/process/batch state is summarized without mutating or polling repeatedly.
- Optional provider/status failures degrade gracefully.
- Existing snapshot consumers continue to work.
- Output contains no secrets, hidden reasoning, raw prompts, or sensitive local-state payloads.
- No new persistent store, model call, dependency, or public tool is introduced.

## Verification

- Focused snapshot/briefing smoke with clean, dirty, detached, active-work, and restricted-policy fixtures.
- `npm run build`.
- `npm run smoke` because a shared MCP result changes.
- `git diff --check`.
