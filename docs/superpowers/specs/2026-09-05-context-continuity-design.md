# Context, Instructions, Events, and Task Continuity Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P1
**Depends on:** plan 02, plan 04

## Goal
Reduce repetitive MCP calls and make long tasks resumable through bounded batch reads/searches, path-specific instruction resolution, context gathering, workspace event cursors, and durable task checkpoints.

## Features covered
- **#11 — read_many**
- **#12 — search_many**
- **#13 — gather_context**
- **#14 — instructions_for_path**
- **#22 — Workspace event cursor**
- **#23 — Durable task checkpoint**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Keep batch operations thin over existing guarded read/search primitives, while a context module composes ranked evidence. Task state stores only durable task metadata and evidence references, never hidden model reasoning or unrestricted repository snapshots.

### Proposed files
**Create**
- `src/contextOps.ts`
- `src/instructionOps.ts`
- `src/workspaceEvents.ts`
- `src/taskStateOps.ts`
- `scripts/context-continuity-smoke.mjs`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/fsOps.ts`
- `src/searchOps.ts`
- `src/workspaceOps.ts`
- `src/config.ts`
- `CHANGELOG.md`

## Interfaces
- `readMany(requests: ReadManyItem[]): Promise<ReadManyResult>`
- `searchMany(requests: SearchManyItem[]): Promise<SearchManyResult>`
- `gatherContext(request: GatherContextRequest): Promise<GatheredContext>`
- `instructionsForPath(path: string): Promise<InstructionResolution>`
- `workspaceEvents(cursor?: string): Promise<WorkspaceEventPage>`
- `saveTaskSnapshot(snapshot: TaskSnapshot): Promise<TaskSnapshotReceipt>`
- `loadTaskSnapshot(id: string): Promise<TaskSnapshot | null>`

## Requirements
- A-001: The subsystem **shall** batch item failure is isolated and reported without skipping successful items.
- A-002: The subsystem **shall** aggregate byte/result budgets cap read_many and search_many.
- A-003: The subsystem **shall** instruction resolution follows nearest applicable AGENTS-style hierarchy and reports source order.
- A-004: The subsystem **shall** gather_context ranks instructions, changed files, source, tests, manifests, and recent commits within one budget.
- A-005: The subsystem **shall** workspace event cursor detects create/edit/delete/rename without exposing blocked paths.
- A-006: The subsystem **shall** task snapshots contain goal, files inspected, verification, decisions, and remaining work but no chain-of-thought or secret content.

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
- `scripts/context-continuity-smoke.mjs`
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
