# Durable Touched-File Checkpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Planned only on 2026-09-06. This plan is **not execution-authorized** by the planning request that created it.

**Goal:** Provide durable `chk_*` rollback points for CodexPro-owned file mutations without snapshotting entire repositories or overwriting later user work.

**Architecture:** Checkpoint only files a CodexPro mutation intends to touch. Persist a small checkpoint record plus content-addressed preimage blobs under the user's CodexPro state directory. Restoration is SHA-guarded: existing files restore only when their current hash matches the checkpoint's post-mutation hash; newly created files are removed only under the same guard.

**Tech Stack:** Node.js fs/crypto, existing operation manager/file leases/PathGuard/redaction; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-06-durable-checkpoints-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 03, 06.

---

## File Structure

- Create: `src/checkpoints/types.ts`
- Create: `src/checkpoints/store.ts`
- Create: `src/checkpoints/ops.ts`
- Create: `scripts/checkpoints-smoke.mjs`
- Create: `docs/checkpoints.md`
- Modify: `src/config.ts`
- Modify: `src/server.ts`
- Modify: `src/fsOps.ts`
- Modify: `src/operations/changesets.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/stress.mjs`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/checkpoints-smoke.mjs`
- Test: `scripts/smoke.mjs`
- Test: `scripts/stress.mjs`

## Planned Interfaces

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

## Acceptance contracts carried from the spec

- Checkpoint scope is touched-file-only; never snapshot the whole workspace, Git index, refs, blocked paths, credentials, dependency trees, or unrelated files.
- Initial integration covers `write`, `edit`, `apply_patch`, and `apply_change_set`; other mutation classes are added only when explicitly designed.
- Preimages are content-addressed by SHA-256 and deduplicated within the checkpoint store.
- Checkpoint storage lives outside the project under a configurable `~/.codexpro/checkpoints`-style directory with restrictive same-user permissions.
- Do not add encryption/key-management in the first implementation; local same-user permissions plus strict scope are the intended boundary. Document that limitation.
- Restore shall acquire the same file mutation leases as normal writes.
- Restore shall refuse stale files whose current SHA does not equal the recorded post-mutation SHA.
- A file created by the original operation may be deleted during restore only when its current SHA equals the recorded created-file post SHA.
- Checkpoint records shall not contain raw secrets beyond the allowed touched-file preimages; normal blocked-path and secret-write rules still apply.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/checkpoints-smoke.mjs`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/checkpoints-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - a write/edit mutation creates a durable `chk_*` with the exact touched path and hashes
  - restoring returns the original bytes when the file has not changed since the CodexPro mutation
  - restore refuses to overwrite a later user edit
  - restore of a newly created file deletes it only when unchanged
  - blocked or symlink-escaping paths can never be captured/restored
  - two concurrent checkpointed mutations cannot race the same file

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "Durable Touched-File Checkpoints fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/checkpoints-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define durable checkpoints contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/checkpoints/types.ts`
- `src/checkpoints/store.ts`
- `src/checkpoints/ops.ts`
- `scripts/checkpoints-smoke.mjs`
- `docs/checkpoints.md`
- `src/config.ts`
- `src/server.ts`
- `src/fsOps.ts`
- `src/operations/changesets.ts`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Interfaces produced:**

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

- [ ] **Step 1: Implement content-addressed blob storage plus atomic JSON checkpoint records with bounded file/count/byte limits inherited from operation limits.**
- [ ] **Step 2: Implement pre-mutation capture that runs after PathGuard/write authorization but before the file change, then finalize the record with after-hashes only after the mutation succeeds.**
- [ ] **Step 3: Implement restore planning that validates every entry first, acquires all required leases, then applies the all-or-nothing guarded restoration as one operation receipt.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/checkpoints-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add durable checkpoints core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `src/config.ts`
- `src/server.ts`
- `src/fsOps.ts`
- `src/operations/changesets.ts`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Register `restore_checkpoint` as the only new mutation-facing MCP tool in this plan.** Mutation tools (`write`, `edit`, `apply_patch`, `apply_change_set`) return the created `chk_*` identifier in structured content. `restore_checkpoint` requires `workspace_id` plus `checkpoint_id`, resolves the checkpoint to that workspace, verifies current post-hashes, then delegates to `restoreCheckpoint`; it never performs Git reset/checkout.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/checkpoints-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/checkpoints-smoke.mjs`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `src/config.ts`
- `src/server.ts`
- `src/fsOps.ts`
- `src/operations/changesets.ts`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

- [ ] **Step 1: Add Windows and Unix-compatible path/process cases where applicable.**

  Use canonical realpaths in fixtures. Do not assume `/tmp`, drive-letter casing, Git identity, shell quoting, or symlink behavior is identical across platforms.

- [ ] **Step 2: Exercise stale/duplicate/boundary behavior.**

  Test subsystem identifiers/fingerprints/cursors, retry/idempotency behavior, disabled modes, size/count/time limits, cleanup after failure, and redaction boundaries.

- [ ] **Step 3: Exercise policy and supertool equivalence.**

  If callable, prove workspace policy and supertool cannot bypass the same authorization checks as the explicit tool.

- [ ] **Step 4: Run broader verification proportional to risk.**

  Minimum:
  - `npm run build`
  - focused smoke(s)
  - `npm run smoke` when shared MCP/runtime behavior changed

  Additional required for this plan:
  - `npm run stress` because this plan changes shared mutation/process execution semantics

- [ ] **Step 5: Review for residual state.**

  Confirm no orphan processes/containers/temp files, no absolute-path leaks, no secret-bearing persisted data, no unintended dependency changes, and no unrelated Git modifications.

### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after verified implementation: `docs/checkpoints.md`, `README.md`, `FEATURES.md`, `SECURITY.md`, `config.example.env`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after implementation has actually been verified.

- [ ] **Step 1: Document actual behavior, configuration, safety boundaries, compatibility/fallback behavior, and platform limitations.**

  Do not describe planned behavior as shipped.

- [ ] **Step 2: Run plan-specific final verification.**

  Run `git diff --check`, inspect `git diff --stat`, inspect the full relevant diff, then run the verification set required by `docs/agentic/DEVELOPMENT_WORKFLOW.md`.

- [ ] **Step 3: Perform two review passes.**

  Pass 1: spec/acceptance-contract compliance.
  Pass 2: defect-first code quality/security/portability/boundedness review.

- [ ] **Step 4: Update durable state only from evidence.**

  If verified, update `PLAN_INDEX.md` status and `PROJECT_MEMORY.md` with durable facts. Do not mark Released without direct release evidence.

- [ ] **Step 5: Commit/push/release only if explicitly authorized by the execution request.**

  Report exact commit, remote, CI, release, and installation evidence for each external action actually performed.

## Non-goals for this plan

- whole-repository snapshots
- Git reset/checkout based rollback
- encrypted checkpoint vault
- automatic restore without an explicit call

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
