# Observability and Diagnostics Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P0
**Depends on:** plan 01, plan 03

## Goal
Make connector, tool-surface, operation, runtime, and backend failures diagnosable without logging prompts, source contents, tokens, or raw command output.

## Features covered
- **#3 — Connection Diagnostics**
- **#4 — Tool-Surface Diagnostics**
- **#20 — Local telemetry**
- **#21 — Admin diagnostics dashboard**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Use one in-memory bounded telemetry registry with sanitized event summaries, optional durable counters only when explicitly enabled, and read-only projections for MCP and the local admin dashboard.

### Proposed files
**Create**
- `src/telemetry.ts`
- `src/diagnosticsOps.ts`
- `scripts/diagnostics-smoke.mjs`

**Modify when implementation is authorized**
- `src/http.ts`
- `src/server.ts`
- `src/config.ts`
- `src/toolCardWidget.ts`
- `scripts/http-smoke.mjs`
- `CHANGELOG.md`

## Interfaces
- `TelemetryRegistry.record(event: TelemetryEvent): void`
- `connectionDiagnostics(): ConnectionDiagnostics`
- `toolSurfaceDiagnostics(config, registeredTools): ToolSurfaceDiagnostics`
- `GET /admin/diagnostics returns token-protected sanitized diagnostics`

## Requirements
- A-001: The subsystem **shall** distinguish no request arrival from dispatch failure and response-write failure.
- A-002: The subsystem **shall** configured/expected/registered tool sets are compared explicitly.
- A-003: The subsystem **shall** telemetry counters are bounded and evict oldest detail records.
- A-004: The subsystem **shall** diagnostics contain no auth tokens, prompts, file contents, absolute secret paths, or raw command output.
- A-005: The subsystem **shall** admin dashboard works when telemetry persistence is disabled.

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
- `scripts/diagnostics-smoke.mjs`
- `scripts/http-smoke.mjs`
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
