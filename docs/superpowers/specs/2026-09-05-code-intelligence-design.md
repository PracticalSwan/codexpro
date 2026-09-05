# Optional Code Intelligence Backends Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P2
**Depends on:** plan 06, plan 07

## Goal
Add optional fuzzy/fast lexical search, CodeGraph structural analysis, LSP symbol intelligence, and dependency-aware context ranking while preserving built-in fallbacks.

## Features covered
- **#28 — Optional CodeGraph integration**
- **#29 — find_files / fuzzy file search**
- **#30 — LSP intelligence adapter**
- **#31 — Dependency-aware context selection**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Formalize provider seams already present in analysis/providers.ts. Optional adapters advertise capabilities and availability; routing falls back to current ripgrep/Node/built-in analysis when external tools are missing, stale, or fail.

### Proposed files
**Create**
- `src/searchBackends.ts`
- `src/analysis/codegraphProvider.ts`
- `src/analysis/lspProvider.ts`
- `scripts/code-intelligence-smoke.mjs`
- `docs/code-intelligence.md`

**Modify when implementation is authorized**
- `src/searchOps.ts`
- `src/analysis/providers.ts`
- `src/analysis/index.ts`
- `src/analysis/rank.ts`
- `src/config.ts`
- `src/server.ts`
- `CHANGELOG.md`

## Interfaces
- `findFiles(request: FindFilesRequest): Promise<FindFilesResult>`
- `CodeGraphProvider implements AnalysisProvider`
- `LspProvider implements AnalysisProvider`
- `resolveAnalysisProviders(config, workspace): Promise<ProviderRoute>`
- `rankContextWithDependencies(context, relationships): GatheredContext`

## Requirements
- A-001: The subsystem **shall** fff/ffgrep absence falls back without failure.
- A-002: The subsystem **shall** CodeGraph is never auto-installed and only bootstraps/syncs when explicitly enabled and CLI exists.
- A-003: The subsystem **shall** stale CodeGraph index is detected before structural query.
- A-004: The subsystem **shall** LSP adapter starts only explicitly configured/user-installed servers and terminates owned processes.
- A-005: The subsystem **shall** provider paths are revalidated through PathGuard before results leave CodexPro.
- A-006: The subsystem **shall** gather_context improves ranking from structural dependencies but remains usable with built-in analysis only.

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
- `scripts/code-intelligence-smoke.mjs`
- `scripts/analysis-smoke.mjs`
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
