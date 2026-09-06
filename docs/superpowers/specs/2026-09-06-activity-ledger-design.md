# Unified Activity and Evidence Ledger Design

**Date:** 2026-09-06
**Status:** Verified
**Priority:** P1
**Plan ID:** 17
**Depends on:** 03, 04, 05, 11

## Goal

Give users one sanitized chronological answer to “what did CodexPro do?” by aggregating existing operations, checks, processes, Goals, and tool outcomes into a bounded evidence ledger.

## Feature covered

- **#48 — bounded activity/evidence ledger**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Add a best-effort append-only sanitized JSONL ledger outside the workspace. The central tool wrapper and existing subsystem lifecycle seams emit compact typed events. A single read-only `activity_log` tool reads by workspace/cursor/filter. This is audit/evidence aggregation, not an event-sourced source of truth.

### Proposed files

**Create**
- `src/activity/types.ts`
- `src/activity/store.ts`
- `src/activity/registry.ts`
- `scripts/activity-ledger-smoke.mjs`
- `docs/activity-log.md`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/runtimeState.ts`
- `src/checksOps.ts`
- `src/processOps.ts`
- `src/goals/runner.ts`
- `src/goals/projection.ts`
- `src/config.ts`
- `scripts/smoke.mjs`
- `README.md`
- `FEATURES.md`
- `CHANGELOG.md`

## Planned interfaces

```ts
export type ActivityKind =
  | "tool"
  | "operation"
  | "check"
  | "process"
  | "goal"
  | "git";

export interface ActivityRecord {
  sequence: number;
  timestamp: string;
  workspaceId: string;
  kind: ActivityKind;
  action: string;
  status: "started" | "ok" | "error" | "cancelled";
  durationMs?: number;
  operationId?: string;
  relativePaths?: string[];
  summary?: string;
}

export async function appendActivity(record: ActivityRecord): Promise<void>;
export async function readActivity(query: ActivityQuery): Promise<ActivityPage>;
```

## Requirements

- R-17-01: Ledger content must never include prompts, unrestricted source content, raw shell stdout/stderr, authentication values, full parent environment, or arbitrary absolute paths.
- R-17-02: Records may include tool/action name, timestamps, duration, status, operation/check/process/Goal identifiers, and a bounded set of workspace-relative paths/sanitized summaries.
- R-17-03: Persistence is per-user outside the workspace with bounded file size/record count and deterministic rotation.
- R-17-04: Each workspace has a monotonic sequence used as the cursor basis; readers can request `after_sequence`, kinds, statuses, and bounded limit.
- R-17-05: Ledger write failure is degraded observability only and must never fail or roll back the underlying successful user operation.
- R-17-06: `activity_log` is read-only and policy-aware; it exposes only records for a workspace the caller can already target.
- R-17-07: Existing telemetry remains the source for aggregate performance counters; the ledger is not a replacement metrics system.

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
- `scripts/activity-ledger-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- OpenHands' append-only event history demonstrates the value of reconstructable execution evidence; CodexPro should implement only the audit aggregation benefit, not a new state machine.

## Alternatives rejected / non-goals

- full event sourcing
- remote telemetry upload
- prompt transcript storage
- replay/re-execution from the log

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
