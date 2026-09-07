# MCP Tasks Extension Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Capability gate evaluated on 2026-09-07 in the authorized Plans 12-21 batch. Implementation is blocked/deferred: the official Tasks extension remains Draft, MCP SDK v2 does not serve it from core, and current ChatGPT developer documentation does not establish support. No Tasks runtime surface was added.

**Goal:** Expose selected existing long-running CodexPro processes/Goals through a standard MCP Tasks extension only when that extension is stable and the connected ChatGPT client demonstrably supports it.

**Architecture:** Do not create another scheduler. A thin adapter maps MCP task identity/status/cancellation/result retrieval onto existing `proc_*` and `goal_*` state. Implementation begins with a mandatory maturity/compatibility gate; if the official extension API or ChatGPT support is not stable, the plan stops with no runtime change.

**Tech Stack:** Future stable MCP Tasks extension API, existing WorkspaceProcessManager and GoalStore; no new scheduler/storage.

**Spec:** `docs/superpowers/specs/2026-09-06-mcp-tasks-bridge-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 18.

---

## File Structure

- Create: `src/mcpTasksAdapter.ts`
- Create: `scripts/mcp-tasks-bridge-smoke.mjs`
- Modify: `src/mcpCompat.ts`
- Modify: `src/server.ts`
- Modify: `src/runtimeState.ts`
- Modify: `docs/goals.md`
- Modify: `FEATURES.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/mcp-tasks-bridge-smoke.mjs`
- Test: `scripts/process-smoke.mjs`
- Test: `scripts/goals-mcp-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

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

## Acceptance contracts carried from the spec

- Execution gate: before any code change, re-check the official MCP Tasks extension status, stable TypeScript API, and live ChatGPT Developer Mode capability. Stop the plan if any is not clearly supported.
- Do not use or resurrect deprecated 2025 task wire vocabulary merely because historical examples exist.
- `proc_*` and `goal_*` remain canonical internal identities and APIs; the MCP task ID is an adapter binding, not a replacement.
- Only naturally long-running operations are eligible; short file/search/Git reads/writes remain normal synchronous tool calls.
- Task status/result retrieval reads existing subsystem state; no duplicate scheduler, worker queue, or source-of-truth database is introduced.
- Cancellation delegates to the existing process/Goal cancellation paths and preserves their guards.
- If the client lacks Tasks support, task-extension surfaces are not advertised and all existing CodexPro tools continue unchanged.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/mcp-tasks-bridge-smoke.mjs`
- `scripts/process-smoke.mjs`
- `scripts/goals-mcp-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/mcp-tasks-bridge-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - unsupported client sees no Tasks-extension capability
  - task status for a bound process/Goal reflects the canonical internal state
  - cancelling a task invokes exactly one canonical cancel path
  - server restart/reconnect behavior matches whichever durability guarantee the stable extension requires
  - short tools are not silently converted into tasks

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "MCP Tasks Extension Bridge fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/mcp-tasks-bridge-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define mcp tasks bridge contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/mcpTasksAdapter.ts`
- `scripts/mcp-tasks-bridge-smoke.mjs`
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/runtimeState.ts`
- `docs/goals.md`
- `FEATURES.md`
- `CHANGELOG.md`

**Interfaces produced:**

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

- [ ] **Step 1: After the execution gate passes, define a binding registry with bounded runtime/durable metadata sufficient to map standard task calls to existing process/Goal records.**
- [ ] **Step 2: Implement status/result translation without copying raw process output beyond existing bounded read limits.**
- [ ] **Step 3: Implement cancellation as a thin delegation and ensure terminal internal states map deterministically to the extension's current stable state model.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/mcp-tasks-bridge-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add mcp tasks bridge core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/runtimeState.ts`
- `docs/goals.md`
- `FEATURES.md`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Do not register a parallel CodexPro task tool.** When the execution gate passes, advertise/handle the official MCP Tasks extension through `mcpCompat.ts`/`mcpTasksAdapter.ts` and bind extension task IDs to existing `proc_*`/`goal_*` state. Existing process/Goal tools remain available and canonical.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/mcp-tasks-bridge-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/mcp-tasks-bridge-smoke.mjs`
- `scripts/process-smoke.mjs`
- `scripts/goals-mcp-smoke.mjs`
- `scripts/smoke.mjs`
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/runtimeState.ts`
- `docs/goals.md`
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
- Modify after verified implementation: `docs/goals.md`, `README.md`, `FEATURES.md`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
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

- new workflow engine
- new task scheduler
- deprecated task protocol emulation
- automatic conversion of every tool call

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
