# MCP Tasks Extension Bridge Design

**Date:** 2026-09-06
**Status:** Blocked - official Tasks extension remains Draft and is not served by MCP SDK v2 core; ChatGPT support is not documented
**Priority:** P3
**Plan ID:** 19
**Depends on:** 18

## Goal

Expose selected existing long-running CodexPro processes/Goals through a standard MCP Tasks extension only when that extension is stable and the connected ChatGPT client demonstrably supports it.

## Feature covered

- **#50 — optional MCP Tasks-extension bridge for existing durable operations**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Do not create another scheduler. A thin adapter maps MCP task identity/status/cancellation/result retrieval onto existing `proc_*` and `goal_*` state. Implementation begins with a mandatory maturity/compatibility gate; if the official extension API or ChatGPT support is not stable, the plan stops with no runtime change.

### Proposed files

**Create**
- `src/mcpTasksAdapter.ts`
- `scripts/mcp-tasks-bridge-smoke.mjs`

**Modify when implementation is authorized**
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/runtimeState.ts`
- `docs/goals.md`
- `FEATURES.md`
- `CHANGELOG.md`

## Planned interfaces

```ts
export type CodexProTaskTarget =
  | { kind: "process"; processId: string }
  | { kind: "goal"; goalId: string };

export interface McpTaskBinding {
  taskId: string;
  workspaceId: string;
  target: CodexProTaskTarget;
}

export function bindMcpTask(target: CodexProTaskTarget): McpTaskBinding;
export async function readMcpTask(binding: McpTaskBinding): Promise<McpTaskSnapshot>;
export async function cancelMcpTask(binding: McpTaskBinding): Promise<McpTaskSnapshot>;
```

## Requirements

- R-19-01: Execution gate: before any code change, re-check the official MCP Tasks extension status, stable TypeScript API, and live ChatGPT Developer Mode capability. Stop the plan if any is not clearly supported.
- R-19-02: Do not use or resurrect deprecated 2025 task wire vocabulary merely because historical examples exist.
- R-19-03: `proc_*` and `goal_*` remain canonical internal identities and APIs; the MCP task ID is an adapter binding, not a replacement.
- R-19-04: Only naturally long-running operations are eligible; short file/search/Git reads/writes remain normal synchronous tool calls.
- R-19-05: Task status/result retrieval reads existing subsystem state; no duplicate scheduler, worker queue, or source-of-truth database is introduced.
- R-19-06: Cancellation delegates to the existing process/Goal cancellation paths and preserves their guards.
- R-19-07: If the client lacks Tasks support, task-extension surfaces are not advertised and all existing CodexPro tools continue unchanged.

## Cross-cutting constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

## Failure model

- Invalid or stale identifiers, fingerprints, capabilities, paths, cursors, and expected state fail closed with bounded structured errors.
- Optional integrations report unavailable/degraded state rather than silently widening authority or changing execution mode.
- Potentially large input/output is bounded before materialization where practical.
- User-facing errors and persisted summaries pass through existing redaction/sanitization boundaries.
- A partial failure must not overwrite unrelated user work or imply that an external side effect succeeded.

## Security and privacy

- No interface in this design bypasses `PathGuard`, global/profile gates, workspace-policy tightening, or secret redaction.
- Persistent records are scoped to the minimum fields/content required by this subsystem.
- No model prompt, unrestricted transcript, raw credential, or unbounded environment is introduced as persistent state.
- External effects remain explicitly gated and are not authorized by this planning document.

## Verification strategy

Focused verification:
- `scripts/mcp-tasks-bridge-smoke.mjs`
- `scripts/process-smoke.mjs`
- `scripts/goals-mcp-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Current MCP v2 work treats Tasks as an extension/current work area, so this plan is deliberately gated rather than assuming a universal stable core method map.

## Alternatives rejected / non-goals

- new workflow engine
- new task scheduler
- deprecated task protocol emulation
- automatic conversion of every tool call

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
