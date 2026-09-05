# CodexPro Project Memory

Last verified: 2026-09-06 (Asia/Bangkok)

## Canonical workspace
- Repository: `D:\Side Projects\codexpro`
- Upstream: `rebel0789/codexpro`
- Fork/origin: `PracticalSwan/codexpro`
- Local integration branch at planning start: `integration/verified-upstream-fixes`
- Local integration HEAD at planning start: `01f01300820e0ed729744d44c77490ba2bff1bb5`
- Upstream `main` at planning start: `587f7fd3a4644a847bba13aeb49336056052e1f6`
- Package version at planning start: `0.30.0`
- Current verified roadmap implementation version: `0.32.3` on local branch `main`.
- Public fork identity: **CodexPro Full**, canonical repository `PracticalSwan/codexpro`; CLI/package/protocol remain `codexpro` compatible. The fork is not separately published to npm as of this verification.
- Local integration was clean and 21 commits ahead of upstream main when this roadmap was created.

## Product boundary
CodexPro is a local MCP server that connects ChatGPT to explicitly allowed local development workspaces. It is not a hosted SaaS, model proxy, quota bypass, account pool, approval bypass, arbitrary remote desktop, or cloud code-storage product.

## Current architectural seams
- `src/server.ts`: MCP tool registration, mode gating, descriptors, result shaping, high-level orchestration.
- `src/guard.ts`: workspace registry, path containment, blocked-path enforcement.
- `src/fsOps.ts`: guarded reads/writes/edits, shared operation-core file leases, tree/list operations, `.ai-bridge` scaffolding.
- `src/policyOps.ts`: strict tightening-only per-workspace policy loading and effective configuration.
- `src/operations/*`: bounded durable receipts, idempotency, transactional change sets, safe revert, budgets, and shared leases.
- `src/telemetry.ts` + `src/diagnosticsOps.ts`: bounded local telemetry and sanitized connection/tool-surface diagnostics.
- `src/bashOps.ts`: Bash runtime resolution, safe/full execution, output limits/decoding.
- `src/processOps.ts` + `src/checksOps.ts`: workspace-owned processes, trusted checks, and change-aware verification.
- `src/contextOps.ts` + `src/instructionOps.ts` + `src/workspaceEvents.ts` + `src/taskStateOps.ts`: bounded context/continuity primitives.
- `src/gitOps.ts` + `src/gitWriteOps.ts` + `src/packageGraph.ts` + `src/preflightOps.ts`: read/write Git safety and repository intelligence.
- `src/searchOps.ts` + `src/searchBackends.ts`: built-in lexical/fuzzy search and optional intelligence routing.
- `src/analysis/*`: repository inventory, extraction, relationships, ranking, impact and optional CodeGraph/LSP provider seams.
- `src/codexSessions.ts`: bounded local Codex session discovery/search/read-around access.
- `src/archiveOps.ts` + `src/documentOps.ts` + `src/exportOps.ts`: bounded archive/document/artifact I/O.
- `src/goals/*`: opt-in durable Goal storage, scheduling, detached worktree execution, review, and explicit projection.
- `src/http.ts`: Streamable HTTP MCP transport and local admin surface.
- `src/config.ts`: runtime modes, limits, security defaults, environment/CLI configuration.
- `scripts/*-smoke.mjs`: integration-style behavior verification; `scripts/stress.mjs` covers bounded/concurrency edge cases.

## Verified maintenance already represented locally
The integration branch includes Windows output decoding/runtime fixes, search fallback improvements, self-test semantics, workspace snapshot improvements, nested Git/apply-patch fixes, release portability, Windows sensitive-path hardening, and related regression coverage. Upstream PR state can change; re-check GitHub before assuming any PR remains open or unmerged.

## Roadmap state
- Planning workspace prepared on 2026-09-05.
- Plans 01–11 are implemented and verified locally. Plans 01–04 form the `0.31.0` maintenance/policy/operation/diagnostics baseline; Plans 05–11 are delivered in `0.32.0`.
- `0.32.0` adds workspace processes/verification, context continuity, Git/repository intelligence, Codex-session navigation, optional code intelligence, artifact I/O, and opt-in durable Goal orchestration.
- `0.32.1` fixes live cross-session process/event continuity and bounds Git blame at the Git subprocess.
- `0.32.2` adds persistent practical-profile capability controls to the authenticated local status page and adapts the optional CodeGraph provider to the installed CodeGraph 1.6.x CLI on Windows.
- `0.32.3` fixes workspace-event deltas for allowed hidden paths while preserving blocked-path exclusion, and makes session-local workspace selection explicit so cross-session callers know to pass workspace_id.
- Master roadmap: `docs/agentic/ARCHITECTURE_ROADMAP.md`.
- Plan routing: `docs/agentic/PLAN_INDEX.md`.
- Specs: `docs/superpowers/specs/`.
- Plans: `docs/superpowers/plans/`.

## Verification baseline
On 2026-09-05, CodexPro `0.32.3` passed the authoritative TypeScript build, focused hidden-path context/event regression, MCP smoke, and every script in the full `npm run smoke` chain when executed individually in package order. `npm audit --audit-level=high` reported 0 vulnerabilities, the release guard and release-package dry run passed, and `git diff --check` passed. Stress was not rerun because 0.32.3 does not change process/concurrency/output-limit behavior.
- Final local install tarball: `codexpro-0.32.3.tgz`, 2,571,729 bytes, SHA-256 `EAD55B93F18165DDE9874EA9D111492418006FD70579CEA31C5540F053DC3736`.
- Global CodexPro is installed as `0.32.3`; the CSX4213 practical profile and all other saved profile hashes were unchanged by installation. `codexpro doctor` passed and port 8787 is available.
- The verified 0.32.3 behavior includes allowed hidden workspace events and intentionally session-local implicit workspace selection; opened workspace IDs remain reusable across sessions when passed explicitly.
- The 0.32.3 release/install workflow intentionally stopped CodexPro before the subsequent fresh live ChatGPT validation; do not treat that pre-validation process state as current runtime state.
- Fresh live ChatGPT -> CodexPro 0.32.3 validation subsequently completed `PASS WITH WARNINGS`: all mandatory functional/safety/durability regressions passed, the allowed-hidden workspace event defect is fixed, no reproducible product defect was found, and the only warning was that the authenticated HTML control page was not inspected because doing so would have required retrieving the protected auth token.

Normal implementation evidence should use the smallest relevant set from: `npm run build`, focused `node scripts/<feature>-smoke.mjs`, `npm run smoke`, `npm run stress`, `npm audit --audit-level=high`, `npm run release:pack`, and `git diff --check`.

## Memory update rule
Keep only verified durable facts here. Replace stale branch/commit/PR state when newer authoritative evidence exists. Put execution history in Git/PRs or task-specific status files, not in this memory document.
