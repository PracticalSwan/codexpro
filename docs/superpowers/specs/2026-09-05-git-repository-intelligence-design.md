# Git and Repository Intelligence Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P1
**Depends on:** plan 03, plan 05, plan 06

## Goal
Provide structured Git history, package/monorepo topology, richer change impact, guarded Git mutations, and pre-commit safety checks through dedicated tools rather than ad-hoc Bash.

## Features covered
- **#17 — Read-only Git history tools**
- **#18 — Monorepo / package graph**
- **#19 — Change Impact Tool**
- **#24 — Guarded Git write tools**
- **#25 — Pre-commit safety scan**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Extend read-only Git behind gitOps.ts, keep write-side Git in a separate gitWriteOps module with explicit expected branch/HEAD/path constraints, and feed package topology into the existing analysis impact model.

### Proposed files
**Create**
- `src/packageGraph.ts`
- `src/gitWriteOps.ts`
- `src/preflightOps.ts`
- `scripts/git-intelligence-smoke.mjs`
- `scripts/git-write-smoke.mjs`

**Modify when implementation is authorized**
- `src/gitOps.ts`
- `src/analysis/impact.ts`
- `src/analysis/types.ts`
- `src/server.ts`
- `src/config.ts`
- `CHANGELOG.md`

## Interfaces
- `gitHistory(request: GitHistoryRequest): GitHistoryResult`
- `gitShow(request: GitShowRequest): GitShowResult`
- `gitBlame(request: GitBlameRequest): GitBlameResult`
- `buildPackageGraph(workspace): Promise<PackageGraph>`
- `analyzeChangeImpact(paths: string[]): Promise<ChangeAnalysis>`
- `gitStage(paths: string[], expectedHead: string): OperationReceipt`
- `gitCommit(request: GitCommitRequest): OperationReceipt`
- `gitPush(request: GitPushRequest): OperationReceipt`
- `preflightChanges(request: PreflightRequest): Promise<PreflightResult>`

## Requirements
- A-001: The subsystem **shall** history tools remain read-only and path-scoped inside allowed roots.
- A-002: The subsystem **shall** package graph discovers npm/Python/Cargo/Go manifests without executing package managers.
- A-003: The subsystem **shall** impact analysis maps changed package to dependents and related tests.
- A-004: The subsystem **shall** stage accepts explicit paths only and rejects blocked/unexpected files.
- A-005: The subsystem **shall** commit requires expected HEAD and reports the exact staged set.
- A-006: The subsystem **shall** push requires configured opt-in plus expected branch/HEAD and never force-pushes.
- A-007: The subsystem **shall** preflight detects secret-like additions, conflict markers, unexpected binaries, oversized files, and blocked paths without scanning unrelated ignored content.

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
- `scripts/git-intelligence-smoke.mjs`
- `scripts/git-write-smoke.mjs`
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
