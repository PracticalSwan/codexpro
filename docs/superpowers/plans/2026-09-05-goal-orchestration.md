# Durable Goal Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Verified 2026-09-05. Conditional commit/push/publication steps were intentionally not executed without separate authorization.

**Goal:** Support durable multi-step Goals with isolated execution, dependency-aware scheduling, explicit review/projection, pause/resume/cancel, crash recovery, and a verified Windows execution model.

**Architecture:** Treat upstream PR #92 as prior art, not an automatic merge. Build Goals on the operation journal, process ownership, Git safety, and concurrency core; semantic decisions remain with the invoking model/user, while the local scheduler owns deterministic execution state only.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, Zod, existing Node standard-library primitives, current smoke/stress harnesses.

**Spec:** `docs/superpowers/specs/2026-09-05-goal-orchestration-design.md`

## Global Constraints
- Preserve CodexPro as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, or hosted source-code storage.
- All filesystem paths pass through PathGuard and existing blocked-path/redaction rules before use or disclosure.
- New external binaries are optional adapters; CodexPro shall not silently install them unless an existing explicit installer flow already owns that dependency.
- Windows, macOS, and Linux behavior must be explicit; Windows is a first-class target rather than a best-effort fallback.
- Prefer deep modules with small interfaces; keep src/server.ts as registration/orchestration glue rather than adding subsystem business logic there.
- Use existing dependencies first. Any dependency addition requires a documented reason, lockfile review, npm audit, and package-size review.
- Every state-changing feature must preserve unrelated dirty, staged, and untracked user work.
- Tests must prove failure before the fix/feature where practical, then cover the real MCP or CLI path and important platform edge cases.
- Commit and push steps in plans are conditional on explicit execution authorization; planning alone never commits or publishes.

**Plan dependencies:** 03, 04, 05, 07.

---

## File Structure
- Create: `src/goals/types.ts`
- Create: `src/goals/store.ts`
- Create: `src/goals/scheduler.ts`
- Create: `src/goals/runner.ts`
- Create: `src/goals/isolation.ts`
- Create: `src/goals/projection.ts`
- Create: `scripts/goals-smoke.mjs`
- Create: `scripts/goals-windows-smoke.mjs`
- Create: `docs/goals.md`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/config.ts`
- Modify: `src/toolCardWidget.ts`
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Test: `scripts/goals-smoke.mjs`
- Test: `scripts/goals-windows-smoke.mjs`
- Test: `scripts/stress.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces
- `proposeGoal(request: GoalProposalRequest): Promise<GoalRecord>`
- `approveGoal(id: string, fingerprint: string): Promise<GoalRecord>`
- `GoalScheduler.start(id: string): Promise<void>`
- `GoalScheduler.pause/resume/cancel(id: string): Promise<GoalRecord>`
- `createIsolatedExecution(goalId: string): Promise<IsolationRecord>`
- `projectGoalResult(goalId: string, expectedSourceHead: string): Promise<OperationReceipt>`
- `GoalTask { id, dependsOn, state, operationId, verification }`

### Task 1: Refresh authoritative state and establish RED contracts

**Files:**
- Test: `scripts/goals-smoke.mjs`
- Test: `scripts/goals-windows-smoke.mjs`
- Test: `scripts/stress.mjs`
- Test: `scripts/smoke.mjs`

- [ ] **Step 1: Re-read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, the spec above, current Git status/log/remotes, and current upstream PR/issue state.**

  Record any assumption that changed since 2026-09-05 in the task handoff before editing. If upstream already implements an interface, reconcile it instead of duplicating it.

- [ ] **Step 2: Add focused failing contract/regression cases for these behaviors:**
  - reconcile PR #92 behavior/file model against current integration before porting any code
  - persistent execution survives MCP disconnect but stops at semantic review/projection boundaries
  - DAG scheduler runs only dependency-ready tasks and enforces a bounded worker count
  - cancel/pause cannot race terminal publication or projection
  - isolated worktree changes never overwrite unrelated source dirty/staged/untracked work
  - projection requires expected source HEAD/fingerprint and explicit authorization
  - crash recovery has one scheduler owner and cannot duplicate running tasks
  - Windows path/process/worktree locks survive restart and are validated before Goal tools are advertised on Windows

- [ ] **Step 3: Run only the focused new smoke script(s) and confirm the new assertions fail for the intended missing behavior, not because the harness/environment is broken.**

  Run: `node scripts/goals-smoke.mjs`.
  Expected: at least one new assertion fails against the pre-feature implementation while existing harness setup succeeds.

- [ ] **Step 4: Inspect the test diff and keep fixtures isolated in OS temp directories; no project source/profile/tunnel state may be mutated by the test setup.**

- [ ] **Step 5: Commit only if the execution request authorizes commits.**

  Suggested message: `test: define goal orchestration contracts`

### Task 2: Implement the deep subsystem module

**Files:**
- Create: `src/goals/types.ts`
- Create: `src/goals/store.ts`
- Create: `src/goals/scheduler.ts`
- Create: `src/goals/runner.ts`
- Create: `src/goals/isolation.ts`
- Create: `src/goals/projection.ts`
- Create: `scripts/goals-smoke.mjs`
- Create: `scripts/goals-windows-smoke.mjs`
- Create: `docs/goals.md`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/config.ts`
- Modify: `src/toolCardWidget.ts`
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Interfaces produced:**
- `proposeGoal(request: GoalProposalRequest): Promise<GoalRecord>`
- `approveGoal(id: string, fingerprint: string): Promise<GoalRecord>`
- `GoalScheduler.start(id: string): Promise<void>`
- `GoalScheduler.pause/resume/cancel(id: string): Promise<GoalRecord>`
- `createIsolatedExecution(goalId: string): Promise<IsolationRecord>`
- `projectGoalResult(goalId: string, expectedSourceHead: string): Promise<OperationReceipt>`
- `GoalTask { id, dependsOn, state, operationId, verification }`

- [ ] **Step 1: Implement the smallest internal types and module interfaces required by the RED contracts.**

  Keep persistence, locking, subprocess, provider, parsing, or policy details behind the module interface rather than exporting internal helpers to `server.ts`.

- [ ] **Step 2: Reuse existing `PathGuard`, redaction, workspace/config limits, and operation primitives instead of cloning their logic.**

- [ ] **Step 3: Add bounded error/result types that distinguish unavailable/degraded/invalid/stale states where the spec requires them.**

- [ ] **Step 4: Run the focused module smoke again.**
  Expected: core module cases pass before MCP/admin wiring is added.

- [ ] **Step 5: Commit if authorized.**
  Suggested message: `feat: add goal orchestration core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/config.ts`
- Modify: `src/toolCardWidget.ts`
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add only the config fields/CLI-env parsing required by the spec, with bounded defaults and explicit opt-in for risky/optional capability.**

- [ ] **Step 2: Register MCP tools/actions in `src/server.ts` through `registerCodexTool`; update minimal/standard/full mode lists only where the intended discoverability requires it.**

- [ ] **Step 3: Keep tool handlers thin: validate arguments, resolve workspace, invoke the subsystem interface, shape/redact the result, and return.**

- [ ] **Step 4: Add local admin/HTTP exposure only for read-only status or explicitly authorized local control described by the spec. Preserve token/auth/security-header behavior.**

- [ ] **Step 5: Run `npm run build` and the focused smoke script(s).**
  Expected: TypeScript build passes and the feature works through its actual MCP/CLI/admin path.

### Task 4: Close edge cases and integration risks

**Files:**
- Test: `scripts/goals-smoke.mjs`
- Test: `scripts/goals-windows-smoke.mjs`
- Test: `scripts/stress.mjs`
- Test: `scripts/smoke.mjs`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/config.ts`
- Modify: `src/toolCardWidget.ts`
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add platform and lifecycle cases for Windows plus at least one Unix-compatible path whenever the feature touches paths, processes, Git, persistence, or external adapters.**

- [ ] **Step 2: Exercise stale IDs/hashes/cursors, duplicate/retry behavior, boundary limits, blocked paths, redaction, and cleanup/error paths applicable to this subsystem.**

- [ ] **Step 3: Verify disabled/unavailable modes hide or reject capability consistently in both `tools/list` and direct/supertool dispatch.**

- [ ] **Step 4: Run the focused smoke plus `npm run build`; add `npm run stress` only when this subsystem changes concurrency/process/output/resource behavior.**

- [ ] **Step 5: Review for leaked absolute paths, secrets, unbounded output, orphan processes/temp files, and unrelated Git changes.**

### Task 5: Documentation, release surface, and final verification

**Files:**
- Modify as applicable: `README.md`, `FAQ.md`, `SECURITY.md`, `config.example.env`, `CHANGELOG.md`, subsystem docs listed above.
- Modify: `package.json` only when adding a new smoke script to the normal suite or when an explicitly justified dependency is required.

- [ ] **Step 1: Document user-visible tools/configuration, safety boundaries, fallback behavior, and platform limitations without duplicating source-of-truth constants unnecessarily.**

- [ ] **Step 2: Update `CHANGELOG.md` with the behavior change; update `docs/agentic/PROJECT_MEMORY.md` only after the feature is verified and its state is durable.**

- [ ] **Step 3: Run `git diff --check` and inspect `git diff --stat` plus the full relevant diff.**

- [ ] **Step 4: Run the verification set required by `docs/agentic/DEVELOPMENT_WORKFLOW.md`.**
  Minimum for shared MCP behavior: `npm run build` then `npm run smoke`.
  Add `npm run stress` for concurrency/process/resource work.
  Add `npm audit --audit-level=high` and `npm run release:pack` for dependency/release work.

- [ ] **Step 5: Perform two-stage review: first spec compliance, then defect-first code quality/security review. Fix findings and rerun affected checks.**

- [ ] **Step 6: Commit/push/open PR only if explicitly authorized. Report exact commit/PR evidence rather than assuming publication succeeded.**
