# 0.31 Maintenance Baseline Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P0
**Depends on:** the current verified CodexPro baseline

## Goal
Create a clean, releasable 0.31.x baseline by reconciling the current integration branch with upstream main and the still-open maintenance PRs without duplicating fixes.

## Features covered
- **#5 — 0.31 Maintenance Release**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Use a reconciliation matrix first, then land only independently verified maintenance changes. Treat release packaging as evidence, not as publication authorization.

### Proposed files
**Create**
- `docs/agentic/maintenance-reconciliation.md`

**Modify when implementation is authorized**
- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `scripts/release-guard.mjs`
- `scripts/release-pack.mjs`

## Interfaces
- `MaintenanceReconciliationEntry { pr, localCommit, upstreamState, action, verification }`
- `Release gate: npm run release:check`

## Requirements
- A-001: The subsystem **shall** every integration-only commit is mapped to an upstream PR/issue or documented local-only fix.
- A-002: The subsystem **shall** duplicate PR implementations are not applied twice.
- A-003: The subsystem **shall** package dry-run contains the intended runtime files and no agent-planning/private artifacts.
- A-004: The subsystem **shall** npm audit --audit-level=high reports zero known high-severity vulnerabilities.

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
- `scripts/smoke.mjs`
- `scripts/stress.mjs`
- `scripts/release-guard-smoke.mjs`
- `npm run build`
- `git diff --check`
- Broader `npm run smoke`, `npm run stress`, audit, and release checks follow the risk rules in `docs/agentic/DEVELOPMENT_WORKFLOW.md`.

## Alternatives considered
1. **Put behavior directly in `src/server.ts`.** Rejected because the file is already large and the resulting shallow tool handlers would duplicate security/lifecycle logic.
2. **Expose the capability only through Bash.** Rejected for common structured operations because dedicated interfaces are easier to bound, test, diagnose, and recover.
3. **Make optional integrations mandatory dependencies.** Rejected because CodexPro must remain usable with its built-in local toolchain and predictable installation footprint.

## Completion criteria
Every requirement above has a regression or contract test, the selected subsystem works through its real MCP/CLI/admin surface as applicable, platform behavior is explicit, documentation matches actual behavior, and no unrelated workspace/user state changes.
