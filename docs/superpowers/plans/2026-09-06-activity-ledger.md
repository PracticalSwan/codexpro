# Unified Activity and Evidence Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Implemented and verified on 2026-09-07 in the authorized Plans 12?21 batch.

**Goal:** Give users one sanitized chronological answer to “what did CodexPro do?” by aggregating existing operations, checks, processes, Goals, and tool outcomes into a bounded evidence ledger.

**Architecture:** Add a best-effort append-only sanitized JSONL ledger outside the workspace. The central tool wrapper and existing subsystem lifecycle seams emit compact typed events. A single read-only `activity_log` tool reads by workspace/cursor/filter. This is audit/evidence aggregation, not an event-sourced source of truth.

**Tech Stack:** Node.js JSONL/file rotation, existing telemetry/redaction/operation IDs; no database dependency.

**Spec:** `docs/superpowers/specs/2026-09-06-activity-ledger-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 03, 04, 05, 11.

---

## File Structure

- Create: `src/activity/types.ts`
- Create: `src/activity/store.ts`
- Create: `src/activity/registry.ts`
- Create: `scripts/activity-ledger-smoke.mjs`
- Create: `docs/activity-log.md`
- Modify: `src/server.ts`
- Modify: `src/runtimeState.ts`
- Modify: `src/checksOps.ts`
- Modify: `src/processOps.ts`
- Modify: `src/goals/runner.ts`
- Modify: `src/goals/projection.ts`
- Modify: `src/config.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/activity-ledger-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

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

## Acceptance contracts carried from the spec

- Ledger content must never include prompts, unrestricted source content, raw shell stdout/stderr, authentication values, full parent environment, or arbitrary absolute paths.
- Records may include tool/action name, timestamps, duration, status, operation/check/process/Goal identifiers, and a bounded set of workspace-relative paths/sanitized summaries.
- Persistence is per-user outside the workspace with bounded file size/record count and deterministic rotation.
- Each workspace has a monotonic sequence used as the cursor basis; readers can request `after_sequence`, kinds, statuses, and bounded limit.
- Ledger write failure is degraded observability only and must never fail or roll back the underlying successful user operation.
- `activity_log` is read-only and policy-aware; it exposes only records for a workspace the caller can already target.
- Existing telemetry remains the source for aggregate performance counters; the ledger is not a replacement metrics system.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/activity-ledger-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/activity-ledger-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - successful and failed tool calls create bounded chronological records
  - operation/check/process/Goal IDs can be correlated without storing their raw outputs
  - secret-looking values and absolute paths do not survive sanitization
  - ledger storage failure does not change tool result success/failure
  - rotation preserves recent ordering/cursor behavior
  - activity for one workspace is not returned when another workspace is queried

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "Unified Activity and Evidence Ledger fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/activity-ledger-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define activity ledger contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/activity/types.ts`
- `src/activity/store.ts`
- `src/activity/registry.ts`
- `scripts/activity-ledger-smoke.mjs`
- `docs/activity-log.md`
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

**Interfaces produced:**

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

- [ ] **Step 1: Define a sanitization boundary that accepts only the allowlisted activity fields and strips/omits absolute paths and secret-looking summaries.**
- [ ] **Step 2: Implement atomic/best-effort JSONL append plus bounded rotation and cursor reads; tolerate a truncated final line after crash.**
- [ ] **Step 3: Instrument the central tool wrapper first, then add high-signal subsystem lifecycle records only where IDs/results already exist; avoid duplicate semantic events.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/activity-ledger-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add activity ledger core`

### Task 3: Wire configuration and real product surfaces

**Files:**
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

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Register the new read-only `activity_log` tool.** It accepts optional `workspace_id`, `after_sequence`, bounded `limit`, and optional kind/status filters; it resolves an already-allowed workspace and delegates to `readActivity`. The tool returns sanitized records plus the next sequence cursor and never replays or re-executes events.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/activity-ledger-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/activity-ledger-smoke.mjs`
- `scripts/smoke.mjs`
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
  - no extra suite beyond the workflow-required set unless implementation expands the risk surface

- [ ] **Step 5: Review for residual state.**

  Confirm no orphan processes/containers/temp files, no absolute-path leaks, no secret-bearing persisted data, no unintended dependency changes, and no unrelated Git modifications.

### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after verified implementation: `docs/activity-log.md`, `README.md`, `FEATURES.md`, `SECURITY.md`, `config.example.env`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
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

- full event sourcing
- remote telemetry upload
- prompt transcript storage
- replay/re-execution from the log

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
