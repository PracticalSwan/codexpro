# Workspace Policy Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P0
**Depends on:** plan 01

## Goal
Add an optional workspace-local policy that can tighten CodexPro limits and guidance without ever broadening the operator's global permissions.

## Features covered
- **#6 — Per-workspace policy file**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Parse one bounded policy document through a dedicated policy module, merge it monotonically with CodexProConfig, and expose the effective policy read-only through diagnostics.

### Proposed files
**Create**
- `src/policyOps.ts`
- `scripts/policy-smoke.mjs`
- `docs/workspace-policy.md`

**Modify when implementation is authorized**
- `src/config.ts`
- `src/server.ts`
- `src/guard.ts`
- `README.md`
- `CHANGELOG.md`

## Interfaces
- `loadWorkspacePolicy(root: string): Promise<WorkspacePolicy | null>`
- `applyWorkspacePolicy(config: CodexProConfig, policy: WorkspacePolicy): CodexProConfig`
- `effective_policy MCP read-only result`

## Requirements
- A-001: The subsystem **shall** missing policy preserves current behavior.
- A-002: The subsystem **shall** policy can add blocked globs and lower limits.
- A-003: The subsystem **shall** policy cannot enable bash/write/tools disabled globally.
- A-004: The subsystem **shall** symlinked or oversized policy files fail closed.
- A-005: The subsystem **shall** invalid policy reports a bounded actionable error.

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
- `scripts/policy-smoke.mjs`
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
