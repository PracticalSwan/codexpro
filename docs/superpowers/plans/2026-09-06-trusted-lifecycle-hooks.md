# Trusted Lifecycle Hooks and Project Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Verified in the authorized Plans 12?21 batch on 2026-09-07.

**Goal:** Add a minimal deterministic hook system for trusted projects while preventing repository-controlled hook configuration from gaining execution merely by being opened.

**Architecture:** Keep executable hook configuration in a separate `.codexpro-hooks.json` and store trust decisions outside the repository under the user's CodexPro state directory. A project hook file is executable only when its canonical workspace path and exact hook-file fingerprint match an out-of-repo trust record. Hooks run as argv arrays with sanitized environment, strict time/output limits, and no ability to widen policy.

**Tech Stack:** Node.js child-process APIs without shell interpolation, TypeScript, Zod, existing redaction/config/runtime state.

**Spec:** `docs/superpowers/specs/2026-09-06-trusted-lifecycle-hooks-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 03, 04, 13.

---

## File Structure

- Create: `src/hooks/types.ts`
- Create: `src/hooks/store.ts`
- Create: `src/hooks/runner.ts`
- Create: `src/projectTrust.ts`
- Create: `scripts/hooks-smoke.mjs`
- Create: `docs/hooks.md`
- Modify: `src/server.ts`
- Modify: `src/runtimeState.ts`
- Modify: `src/config.ts`
- Modify: `scripts/codexpro.mjs`
- Modify: `scripts/settings-smoke.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/hooks-smoke.mjs`
- Test: `scripts/settings-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

```ts
export type HookEvent = "session_start" | "before_tool" | "after_tool" | "task_end";

export interface HookCommand {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface HookRunResult {
  event: HookEvent;
  status: "allowed" | "blocked" | "warning" | "skipped";
  exitCode: number | null;
  message?: string;
}

export function projectTrustStatus(root: string, hookBytes: Buffer): Promise<ProjectTrustStatus>;
export function runHooks(event: HookEvent, request: HookRequest): Promise<HookRunResult[]>;
```

## Acceptance contracts carried from the spec

- Executable hooks shall never run merely because `.codexpro-hooks.json` exists.
- Trust shall be stored outside the repository and bind the canonical realpath plus SHA-256 of the exact hook configuration; any hook-file change invalidates prior trust.
- Trust mutation shall be local CLI-only in the first version (`codexpro trust status`, `codexpro trust hooks`); MCP may expose only read-only trust status.
- Supported events are exactly `session_start`, `before_tool`, `after_tool`, and `task_end` in the first version.
- `task_end` shall fire only at unambiguous CodexPro-owned boundaries such as a Goal reaching review or a terminal handoff workflow; ad-hoc chat activity does not synthesize a task boundary.
- Hook commands shall be executable plus argv array, never one shell-interpolated string.
- Hooks receive a sanitized minimum environment and bounded JSON input; prompts, secrets, unrestricted source, and parent environment are excluded.
- `before_tool` exit 2 may block the tool; exit 0 allows; other nonzero exits are warnings. No hook can override a declarative deny or widen capability.
- Hook timeout/output limits are enforced independently of normal Bash mode and all surfaced errors pass through redaction.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/hooks-smoke.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/hooks-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - untrusted hook configuration never executes
  - changing one byte of the hook file invalidates trust
  - `before_tool` exit 2 blocks the tool before the underlying handler begins
  - a hook cannot re-enable a policy-denied operation
  - sanitized hook environment excludes secret-looking and unrestricted parent environment values
  - Windows executable/argv behavior works without shell quoting

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "Trusted Lifecycle Hooks and Project Trust fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/hooks-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define trusted lifecycle hooks contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/hooks/types.ts`
- `src/hooks/store.ts`
- `src/hooks/runner.ts`
- `src/projectTrust.ts`
- `scripts/hooks-smoke.mjs`
- `docs/hooks.md`
- `src/server.ts`
- `src/runtimeState.ts`
- `src/config.ts`
- `scripts/codexpro.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Interfaces produced:**

```ts
export type HookEvent = "session_start" | "before_tool" | "after_tool" | "task_end";

export interface HookCommand {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface HookRunResult {
  event: HookEvent;
  status: "allowed" | "blocked" | "warning" | "skipped";
  exitCode: number | null;
  message?: string;
}

export function projectTrustStatus(root: string, hookBytes: Buffer): Promise<ProjectTrustStatus>;
export function runHooks(event: HookEvent, request: HookRequest): Promise<HookRunResult[]>;
```

- [ ] **Step 1: Implement strict hook-file parsing and deterministic canonical serialization/fingerprinting.**
- [ ] **Step 2: Implement an out-of-repo trust store using restrictive file permissions and canonical workspace roots; records contain no source content or credentials.**
- [ ] **Step 3: Implement direct-spawn hook execution with stdin JSON, bounded captured stdout/stderr, timeout termination, and event-specific result interpretation.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/hooks-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add trusted lifecycle hooks core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `src/server.ts`
- `src/runtimeState.ts`
- `src/config.ts`
- `scripts/codexpro.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Register one read-only `project_trust_status` MCP tool only after the trust store/runner contracts pass.** The tool accepts optional `workspace_id`, returns trusted/untrusted/stale plus the current hook fingerprint/status, and performs no trust mutation. Trust changes remain CLI-only through `codexpro trust status` and `codexpro trust hooks`.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/hooks-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/hooks-smoke.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`
- `src/server.ts`
- `src/runtimeState.ts`
- `src/config.ts`
- `scripts/codexpro.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`
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
  - no extra suite beyond the workflow-required set unless implementation expands the risk surface

- [ ] **Step 5: Review for residual state.**

  Confirm no orphan processes/containers/temp files, no absolute-path leaks, no secret-bearing persisted data, no unintended dependency changes, and no unrelated Git modifications.

### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after verified implementation: `docs/hooks.md`, `README.md`, `FEATURES.md`, `SECURITY.md`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
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

- hook marketplace
- model-invoking hooks
- automatic project trust
- remote trust synchronization
- more than four lifecycle events

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
