# Durable Goal Orchestration Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P3
**Depends on:** plan 03, plan 04, plan 05, plan 07

## Goal
Support durable multi-step Goals with isolated execution, dependency-aware scheduling, explicit review/projection, pause/resume/cancel, crash recovery, and a verified Windows execution model.

## Features covered
- **#37 — Durable Goal orchestration**
- **#38 — Windows Goal execution**
- **#39 — Isolated execution environments**
- **#40 — Task dependency scheduler**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Treat upstream PR #92 as prior art, not an automatic merge. Build Goals on the operation journal, process ownership, Git safety, and concurrency core; semantic decisions remain with the invoking model/user, while the local scheduler owns deterministic execution state only.

### Proposed files
**Create**
- `src/goals/types.ts`
- `src/goals/store.ts`
- `src/goals/scheduler.ts`
- `src/goals/runner.ts`
- `src/goals/isolation.ts`
- `src/goals/projection.ts`
- `scripts/goals-smoke.mjs`
- `scripts/goals-windows-smoke.mjs`
- `docs/goals.md`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/http.ts`
- `src/config.ts`
- `src/toolCardWidget.ts`
- `package.json`
- `CHANGELOG.md`

## Interfaces
- `proposeGoal(request: GoalProposalRequest): Promise<GoalRecord>`
- `approveGoal(id: string, fingerprint: string): Promise<GoalRecord>`
- `GoalScheduler.start(id: string): Promise<void>`
- `GoalScheduler.pause/resume/cancel(id: string): Promise<GoalRecord>`
- `createIsolatedExecution(goalId: string): Promise<IsolationRecord>`
- `projectGoalResult(goalId: string, expectedSourceHead: string): Promise<OperationReceipt>`
- `GoalTask { id, dependsOn, state, operationId, verification }`

## Requirements
- A-001: The subsystem **shall** reconcile PR #92 behavior/file model against current integration before porting any code.
- A-002: The subsystem **shall** persistent execution survives MCP disconnect but stops at semantic review/projection boundaries.
- A-003: The subsystem **shall** DAG scheduler runs only dependency-ready tasks and enforces a bounded worker count.
- A-004: The subsystem **shall** cancel/pause cannot race terminal publication or projection.
- A-005: The subsystem **shall** isolated worktree changes never overwrite unrelated source dirty/staged/untracked work.
- A-006: The subsystem **shall** projection requires expected source HEAD/fingerprint and explicit authorization.
- A-007: The subsystem **shall** crash recovery has one scheduler owner and cannot duplicate running tasks.
- A-008: The subsystem **shall** Windows path/process/worktree locks survive restart and are validated before Goal tools are advertised on Windows.

## Cross-cutting constraints
- Preserve CodexPro as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, or hosted source-code storage.
- All filesystem paths pass through PathGuard and existing blocked-path/redaction rules before use or disclosure.
- New external binaries are optional adapters; CodexPro shall not silently install them unless an existing explicit installer flow already owns that dependency.
- Windows, macOS, and Linux behavior must be explicit; Windows is a first-class target rather than a best-effort fallback.
- Prefer deep modules with small interfaces; keep src/server.ts as registration/orchestration glue rather than adding subsystem business logic there.
- Use existing dependencies first. Any dependency addition requires a documented reason, lockfile review, npm audit, and package-size review.
- Every state-changing feature must preserve unrelated dirty, staged, and untracked user work.
- Tests must prove failure before the fix/feature where practical, then cover the real MCP or CLI path and important platform edge cases.
- Commit and push steps in plans are conditional on explicit execution authorization; planning alone never commits or publishes.

## Error and failure model
- Missing optional capabilities fail closed or degrade to an explicitly reported existing fallback.
- Invalid/stale identifiers, hashes, cursors, workspace IDs, operation IDs, or expected Git state return structured errors rather than silently selecting another target.
- Bounded output/result/storage limits are enforced before untrusted or potentially large data is materialized when practical.
- Errors exposed to MCP/admin surfaces are sanitized through existing redaction rules.

## Security and privacy
- No new path-bearing interface bypasses `PathGuard`.
- No new persistent record stores raw secrets, unrestricted prompts, full source snapshots, or unbounded command output.
- External effects beyond the local allowed workspace require the existing mode/policy gates plus explicit authorization appropriate to that effect.

## Verification strategy
- `scripts/goals-smoke.mjs`
- `scripts/goals-windows-smoke.mjs`
- `scripts/stress.mjs`
- `scripts/smoke.mjs`
- `npm run build`
- `git diff --check`
- Broader `npm run smoke`, `npm run stress`, audit, and release checks follow the risk rules in `docs/agentic/DEVELOPMENT_WORKFLOW.md`.

## Alternatives considered
1. **Put behavior directly in `src/server.ts`.** Rejected because the file is already large and the resulting shallow tool handlers would duplicate security/lifecycle logic.
2. **Expose the capability only through Bash.** Rejected for common structured operations because dedicated interfaces are easier to bound, test, diagnose, and recover.
3. **Make optional integrations mandatory dependencies.** Rejected because CodexPro must remain usable with its built-in local toolchain and predictable installation footprint.

## Completion criteria
Every requirement above has a regression or contract test, the selected subsystem works through its real MCP/CLI/admin surface as applicable, platform behavior is explicit, documentation matches actual behavior, and no unrelated workspace/user state changes.
