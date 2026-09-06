# Budgeted Context Selection v2 and Subtask Context Design

**Date:** 2026-09-06
**Status:** Planned
**Priority:** P1
**Plan ID:** 16
**Depends on:** 06, 09

## Goal

Make context selection more task-aware and token-efficient by extending the existing dependency-ranked `gather_context` path instead of adding another indexing subsystem.

## Feature covered

- **#46 — gather_context v2**
- **#47 — bounded subtask context bundle**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Preserve the current hard byte budget and dependency ranking, then add explicit strategies (`task`, `symbol`, `change`), result scores/reasons, test/recent-change weighting, and a bounded runtime cache. Token counts remain estimates so no tokenizer dependency is required. A read-only `prepare_subtask_context` packages the same ranked evidence for host-created subagents but never launches a model.

### Proposed files

**Create**
- `src/contextRanking.ts`
- `src/contextCache.ts`
- `scripts/context-v2-smoke.mjs`

**Modify when implementation is authorized**
- `src/contextOps.ts`
- `src/runtimeState.ts`
- `src/analysis/rank.ts`
- `src/server.ts`
- `scripts/context-continuity-smoke.mjs`
- `scripts/code-intelligence-smoke.mjs`
- `README.md`
- `FEATURES.md`
- `CHANGELOG.md`

## Planned interfaces

```ts
export type ContextStrategy = "task" | "symbol" | "change";

export interface ContextRequestV2 {
  strategy?: ContextStrategy;
  targetPath?: string;
  targetSymbol?: string;
  changedPaths?: string[];
  includeTests?: boolean;
  includeRecentChanges?: boolean;
  maxBytes?: number;
  targetTokens?: number;
}

export interface RankedContextItem {
  path: string;
  kind: "instructions" | "target" | "related" | "test" | "git";
  score: number;
  reasons: string[];
  bytes: number;
}

export async function gatherContextV2(request: ContextRequestV2): Promise<GatheredContextV2>;
export async function prepareSubtaskContext(request: ContextRequestV2): Promise<GatheredContextV2>;
```

## Requirements

- R-16-01: The existing hard byte limit remains authoritative; `targetTokens` is advisory and uses a documented estimate rather than a new tokenizer dependency.
- R-16-02: Applicable instructions and an explicitly requested target always rank ahead of inferred related files.
- R-16-03: `symbol` strategy emphasizes symbol definition/reference evidence; `change` strategy emphasizes changed paths, likely tests, dependents, and recent Git context; `task` remains the balanced default.
- R-16-04: Each selected item reports a bounded score and human-readable reasons; response also reports omitted candidate count and estimated token count.
- R-16-05: Use existing built-in analysis first and optional CodeGraph/LSP only when already enabled/current; no mandatory vector database or new daemon.
- R-16-06: Cache entries are bounded runtime state keyed by workspace plus normalized request plus source fingerprint (HEAD and dirty/event fingerprint) and are invalidated by CodexPro writes/events affecting candidate state.
- R-16-07: `prepare_subtask_context` is read-only and returns data only; it does not spawn a model, subagent, process, or remote request.

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
- `scripts/context-v2-smoke.mjs`
- `scripts/context-continuity-smoke.mjs`
- `scripts/code-intelligence-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Aider's repository-map pattern validates compact ranked context; CodexPro already has dependency ranking, so the improvement should deepen that seam rather than duplicate it.

## Alternatives rejected / non-goals

- embedding/vector search service
- mandatory Tree-sitter dependency
- model-hosting/subagent execution
- persistent full-source context cache

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
