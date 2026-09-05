# Workspace Processes and Verification Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P1
**Depends on:** plan 03, plan 04

## Goal
Support workspace-owned long-running processes and structured build/test verification without turning CodexPro into a machine-wide process manager.

## Features covered
- **#7 — Workspace Process Manager**
- **#8 — run_checks**
- **#9 — verify_changes**
- **#10 — Structured Test Results**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
A process registry owns only child processes launched through CodexPro and binds each to one workspace and operation receipt. A checks module detects existing project scripts, runs bounded verification, and parses known test output into a stable result model.

### Proposed files
**Create**
- `src/processOps.ts`
- `src/checksOps.ts`
- `src/testResultOps.ts`
- `scripts/process-smoke.mjs`
- `scripts/checks-smoke.mjs`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/config.ts`
- `src/bashOps.ts`
- `src/analysis/impact.ts`
- `package.json`
- `CHANGELOG.md`

## Interfaces
- `startWorkspaceProcess(request: StartProcessRequest): Promise<ProcessRecord>`
- `processStatus(id: string): ProcessRecord`
- `readProcessOutput(id: string, cursor?: number): ProcessOutputPage`
- `stopWorkspaceProcess(id: string): Promise<ProcessRecord>`
- `runChecks(request: RunChecksRequest): Promise<CheckRunResult>`
- `verifyChanges(workspace, changedPaths): Promise<VerificationPlanResult>`
- `parseTestOutput(framework: TestFramework, stdout: string, stderr: string): StructuredTestResult`

## Requirements
- A-001: The subsystem **shall** process cwd cannot escape selected workspace.
- A-002: The subsystem **shall** only CodexPro-owned PIDs may be queried or stopped.
- A-003: The subsystem **shall** output cursor is bounded and survives noisy child output.
- A-004: The subsystem **shall** server shutdown terminates or explicitly detaches children according to policy.
- A-005: The subsystem **shall** run_checks uses existing project scripts instead of synthesizing arbitrary commands.
- A-006: The subsystem **shall** verify_changes recommends and runs the smallest relevant checks from change analysis.
- A-007: The subsystem **shall** failed test parsing preserves raw bounded evidence and identifies test/file/line when available.

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
- `scripts/process-smoke.mjs`
- `scripts/checks-smoke.mjs`
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
