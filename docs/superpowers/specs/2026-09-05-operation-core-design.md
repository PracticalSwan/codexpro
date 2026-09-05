# Operation Journal and Concurrency Core Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P0
**Depends on:** plan 01, plan 02

## Goal
Give state-changing tools durable receipts, bounded idempotency, transactional change sets, safe reversion, shared resource budgets, and one workspace concurrency coordinator.

## Features covered
- **#1 — Operation Receipts**
- **#2 — operation_status**
- **#26 — Transactional change sets**
- **#27 — Revert operation**
- **#35 — Resource budgeting**
- **#36 — Workspace concurrency coordinator**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Introduce an operation module as the deep seam for mutation lifecycle. File/Git/process/goal mutations register through it; callers see receipts, while locking, journal persistence, idempotency, budgets, and revert evidence stay internal.

### Proposed files
**Create**
- `src/operations/types.ts`
- `src/operations/store.ts`
- `src/operations/manager.ts`
- `src/operations/changesets.ts`
- `src/operations/budget.ts`
- `src/operations/locks.ts`
- `scripts/operation-smoke.mjs`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/fsOps.ts`
- `src/config.ts`
- `src/redact.ts`
- `package.json`
- `CHANGELOG.md`

## Interfaces
- `OperationManager.start(input: OperationStartInput): Promise<OperationReceipt>`
- `OperationManager.complete(id: string, summary: OperationSummary): Promise<OperationReceipt>`
- `OperationManager.fail(id: string, error: unknown): Promise<OperationReceipt>`
- `OperationManager.status(id: string): Promise<OperationReceipt | null>`
- `withWorkspaceLease(workspaceId: string, resources: string[], fn): Promise<T>`
- `prepareChangeSet(request: ChangeSetRequest): Promise<PreparedChangeSet>`
- `applyChangeSet(id: string): Promise<OperationReceipt>`
- `revertOperation(id: string): Promise<OperationReceipt>`

## Requirements
- A-001: The subsystem **shall** completed mutation remains queryable after simulated response loss.
- A-002: The subsystem **shall** same idempotency key returns the existing operation instead of executing twice.
- A-003: The subsystem **shall** prepared change set refuses stale SHA-256 preconditions.
- A-004: The subsystem **shall** revert refuses when post-operation files no longer match recorded hashes.
- A-005: The subsystem **shall** lock ordering prevents deadlock across two overlapping multi-file operations.
- A-006: The subsystem **shall** journal never stores raw secrets or unbounded command/file contents.
- A-007: The subsystem **shall** budget exhaustion terminates or rejects work with a structured reason.

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
- `scripts/operation-smoke.mjs`
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `npm run build`
- `git diff --check`
- Broader `npm run smoke`, `npm run stress`, audit, and release checks follow the risk rules in `docs/agentic/DEVELOPMENT_WORKFLOW.md`.

## Alternatives considered
1. **Put behavior directly in `src/server.ts`.** Rejected because the file is already large and the resulting shallow tool handlers would duplicate security/lifecycle logic.
2. **Expose the capability only through Bash.** Rejected for common structured operations because dedicated interfaces are easier to bound, test, diagnose, and recover.
3. **Make optional integrations mandatory dependencies.** Rejected because CodexPro must remain usable with its built-in local toolchain and predictable installation footprint.

## Completion criteria
Every requirement above has a regression or contract test, the selected subsystem works through its real MCP/CLI/admin surface as applicable, platform behavior is explicit, documentation matches actual behavior, and no unrelated workspace/user state changes.
