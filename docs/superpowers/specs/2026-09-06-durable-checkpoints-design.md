# Durable Touched-File Checkpoints Design

**Date:** 2026-09-06
**Status:** Verified 2026-09-07
**Priority:** P1
**Plan ID:** 15
**Depends on:** 03, 06

## Goal

Provide durable `chk_*` rollback points for CodexPro-owned file mutations without snapshotting entire repositories or overwriting later user work.

## Feature covered

- **#45 — durable touched-file checkpoints and guarded restore**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Checkpoint only files a CodexPro mutation intends to touch. Persist a small checkpoint record plus content-addressed preimage blobs under the user's CodexPro state directory. Restoration is SHA-guarded: existing files restore only when their current hash matches the checkpoint's post-mutation hash; newly created files are removed only under the same guard.

### Proposed files

**Create**
- `src/checkpoints/types.ts`
- `src/checkpoints/store.ts`
- `src/checkpoints/ops.ts`
- `scripts/checkpoints-smoke.mjs`
- `docs/checkpoints.md`

**Modify when implementation is authorized**
- `src/config.ts`
- `src/server.ts`
- `src/fsOps.ts`
- `src/operations/changesets.ts`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

## Planned interfaces

```ts
export interface FileCheckpointEntry {
  path: string;
  beforeSha256: string | null;
  afterSha256: string;
  beforeBlobSha256: string | null;
}

export interface FileCheckpoint {
  id: string; // chk_*
  workspaceId: string;
  createdAt: string;
  operationId?: string;
  entries: FileCheckpointEntry[];
}

export async function createMutationCheckpoint(input: MutationCheckpointInput): Promise<FileCheckpoint>;
export async function restoreCheckpoint(input: RestoreCheckpointInput): Promise<OperationReceipt>;
```

## Requirements

- R-15-01: Checkpoint scope is touched-file-only; never snapshot the whole workspace, Git index, refs, blocked paths, credentials, dependency trees, or unrelated files.
- R-15-02: Initial integration covers `write`, `edit`, `apply_patch`, and `apply_change_set`; other mutation classes are added only when explicitly designed.
- R-15-03: Preimages are content-addressed by SHA-256 and deduplicated within the checkpoint store.
- R-15-04: Checkpoint storage lives outside the project under a configurable `~/.codexpro/checkpoints`-style directory with restrictive same-user permissions.
- R-15-05: Do not add encryption/key-management in the first implementation; local same-user permissions plus strict scope are the intended boundary. Document that limitation.
- R-15-06: Restore shall acquire the same file mutation leases as normal writes.
- R-15-07: Restore shall refuse stale files whose current SHA does not equal the recorded post-mutation SHA.
- R-15-08: A file created by the original operation may be deleted during restore only when its current SHA equals the recorded created-file post SHA.
- R-15-09: Checkpoint records shall not contain raw secrets beyond the allowed touched-file preimages; normal blocked-path and secret-write rules still apply.
- R-15-10: Initial MCP integration adds `restore_checkpoint`; checkpoint-producing mutation tools return their `chk_*` identifier in structured content. No Git-reset/checkout rollback tool is introduced.

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
- `scripts/checkpoints-smoke.mjs`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Cline-style checkpoints are useful, but CodexPro's stronger preservation boundary favors narrow touched-file preimages instead of a hidden shadow repository.

## Alternatives rejected / non-goals

- whole-repository snapshots
- Git reset/checkout based rollback
- encrypted checkpoint vault
- automatic restore without an explicit call

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
