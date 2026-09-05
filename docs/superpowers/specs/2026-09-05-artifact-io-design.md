# Archive, Document, and Artifact I/O Design

**Date:** 2026-09-05
**Status:** Verified
**Priority:** P2
**Depends on:** plan 03, plan 06

## Goal
Safely import archives, inspect common project documents, and return generated artifacts to ChatGPT when the MCP client supports bounded file resources.

## Features covered
- **#32 — Safe archive import**
- **#33 — Document inspection**
- **#34 — File export back to ChatGPT**

## Current-state fit
This design extends the existing CodexPro seams documented in `docs/agentic/CONTEXT_MAP.md`. It does not authorize implementation, dependency changes, publication, deployment, or global installation.

## Architecture
Keep binary/document handling separate from text fsOps. Archive extraction is transactional and validates every member before write; document readers return bounded text/metadata; export is capability-gated and never invents client support.

### Proposed files
**Create**
- `src/archiveOps.ts`
- `src/documentOps.ts`
- `src/exportOps.ts`
- `scripts/artifact-io-smoke.mjs`

**Modify when implementation is authorized**
- `src/importOps.ts`
- `src/server.ts`
- `src/config.ts`
- `CHANGELOG.md`

## Interfaces
- `inspectArchive(file: string): Promise<ArchiveManifest>`
- `extractArchive(request: ExtractArchiveRequest): Promise<OperationReceipt>`
- `readDocument(request: DocumentReadRequest): Promise<DocumentReadResult>`
- `exportWorkspaceFile(request: ExportFileRequest): Promise<McpFileResourceResult>`

## Requirements
- A-001: The subsystem **shall** archive rejects absolute paths, traversal, symlink/hardlink members, too many entries, excessive expanded bytes, and compression bombs.
- A-002: The subsystem **shall** all archive members are validated before any destination mutation.
- A-003: The subsystem **shall** PDF/DOCX/PPTX/XLSX readers enforce file/section/output bounds and return unsupported-format errors clearly.
- A-004: The subsystem **shall** document inspection never executes macros or embedded code.
- A-005: The subsystem **shall** file export is hidden when runtime/client capability is unavailable.
- A-006: The subsystem **shall** export revalidates blocked paths and maximum bytes before creating an MCP resource.

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
- `scripts/artifact-io-smoke.mjs`
- `scripts/import-smoke.mjs`
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
