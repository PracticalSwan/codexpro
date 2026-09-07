# CodexPro Project Memory

Last verified: 2026-09-08 (Asia/Bangkok)

## Canonical workspace
- Repository: `D:\Side Projects\codexpro`
- Upstream: `rebel0789/codexpro`
- Fork/origin: `PracticalSwan/codexpro`
- Local integration branch at planning start: `integration/verified-upstream-fixes`
- Local integration HEAD at planning start: `01f01300820e0ed729744d44c77490ba2bff1bb5`
- Upstream `main` at planning start: `587f7fd3a4644a847bba13aeb49336056052e1f6`
- Package version at planning start: `0.30.0`
- Current verified roadmap implementation version: `0.32.3` on local branch `main`.
- Public fork identity: **CodexPro Full**, canonical repository `PracticalSwan/codexpro`; the distribution package is `codexpro-full` while the installed CLI, MCP protocol, profiles, and workspace model retain `codexpro` compatibility. GitHub Releases are the canonical release channel; npm-registry publication remains separate and must be verified independently.
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
- The authorized Plans 12–21 batch implementation pass completed to the currently satisfiable capability gates on the isolated roadmap worktree. Plans 12–17 and 20 are implemented and verified. Plan 18 Stage 1 is verified on MCP SDK v2 (`server/client/node` 2.0.0 with Zod 4), while interactive approvals remain capability-gated and fail-closed; Plan 19 remains externally blocked because the Tasks extension is not yet a stable supported ChatGPT surface; Plan 21 Stage A is implemented and live-verified on Windows Docker Desktop using an already-local image; Docker Goals remain host-only after the safe detached-worktree Git gate failed under the required workspace-only mount, and Linux-host live validation remains pending. Status routing is authoritative in `PLAN_INDEX.md`.
- On 2026-09-08, Plans 22–28 were added as **planning-only** deadline-resilience work and then refined so the future synchronous MCP call budget defaults to exactly `1,200,000` ms (20 minutes) but can be saved per workspace profile from 5–60 minutes through CLI and the authenticated local profile editor. The selected value remains transport-only and may never reduce task scope, acceptance criteria, review depth, required verification, or safety checks. Planned roles are synchronous deadline propagation, durable structured `job_*` state for long verification, existing `proc_*` for long shell work, existing Durable Goals for multi-stage isolated work, resumable `batch_*` cursors for expensive in-process work, and bounded diagnostics. No Plans 22–28 runtime behavior is implemented yet.
- On 2026-09-08, Plans 29–37 were added and edge-case reviewed as **planning-only** task-aware browser-continuation work. The design uses durable revisioned semantic continuation state, a separate least-privilege loopback browser companion, a dedicated Chrome/Edge profile with manual sign-in, stable explicit chat binding, current-runtime deadline/generation/transport synchronization, conservative restart/sleep/disconnect handling, terminal/user-pause precedence, and an explicit **Continue task** click for every dispatch. Generic ChatGPT busy/error/retry/unknown UI, manual user turns/Stop actions, stopped transport, auth loss, or ambiguity suppress continuation; no auto-Retry/model switch/tunnel restart is planned. Implementation/live QA must STOP for any ChatGPT/provider authentication/security verification and resume only after the user authenticates directly in the browser and sends `continue`. The companion must not scrape ChatGPT output or attempt to bypass host tool/session restrictions. No Plans 29–37 runtime behavior is implemented yet.
- The ten subsystem plans are consolidated by `docs/superpowers/plans/2026-09-06-roadmap-12-21-execution.md`. The authorized cumulative branch passed its final build/smoke/stress/audit/release-pack/diff gate on 2026-09-07. Each plan retains independent acceptance criteria, focused verification, review, status evidence, and a milestone commit; gated capabilities remain fail-closed rather than being marked complete speculatively.
- Runtime lifecycle is user-controlled: agents must not stop an already-running CodexPro without explicit approval for that stop and must never start or restart CodexPro. An approved stop leaves CodexPro stopped; a global reinstall that requires an unapproved stop remains pending instead of disrupting the runtime.
- The extension deliberately rejects model/provider routing, a second workflow DSL, autonomous self-repair loops, unrestricted recursive subagent orchestration, mandatory Docker, and approval/publication bypass. These boundaries are recorded in `DECISIONS.md`.
- `0.32.0` adds workspace processes/verification, context continuity, Git/repository intelligence, Codex-session navigation, optional code intelligence, artifact I/O, and opt-in durable Goal orchestration.
- `0.32.1` fixes live cross-session process/event continuity and bounds Git blame at the Git subprocess.
- `0.32.2` adds persistent practical-profile capability controls to the authenticated local status page and adapts the optional CodeGraph provider to the installed CodeGraph 1.6.x CLI on Windows.
- `0.32.3` fixes workspace-event deltas for allowed hidden paths while preserving blocked-path exclusion, and makes session-local workspace selection explicit so cross-session callers know to pass workspace_id.
- Master roadmap: `docs/agentic/ARCHITECTURE_ROADMAP.md`.
- Plan routing: `docs/agentic/PLAN_INDEX.md`.
- Specs: `docs/superpowers/specs/`.
- Plans: `docs/superpowers/plans/`.

## Verification baseline

- On 2026-09-08, final post-fix live runtime regression QA on canonical `main` / global `codexpro-full@0.32.3` passed with no confirmed functional regression. The activity-ledger self-recording and Goal `isolation_active` fixes held alongside the earlier policy, Context v2, CodeGraph, verification-path, activity-summary, and process-readiness remediations. One isolated MCP/tunnel `network_error` recovered immediately on the required single retry; final diagnostics were healthy with `dispatch_failures=0` and `response_failures=0`, so transport changes remain monitoring-only unless repeatable evidence appears.
- On 2026-09-08, the safe runtime QA remediation verified fixes for workspace-policy write-family enforcement across edit/patch/change-set mutations, Context v2 changed-path relationship direction, CodeGraph uninitialized-workspace readiness, workspace-relative structured verification failure paths, and check-outcome activity summaries. The pre-existing Windows process smoke was also stabilized with condition-based output polling. Fresh build, full smoke, stress, audit (0 vulnerabilities), release-pack, and diff checks passed on `main`; `origin/main` matched the remediation commit before this memory-only refresh. The global `codexpro-full@0.32.3` installation was statically rechecked and remediation-critical built-file hashes matched the verified source tree.
- On 2026-09-05, CodexPro `0.32.3` passed the authoritative TypeScript build, focused hidden-path context/event regression, MCP smoke, and every script in the full `npm run smoke` chain when executed individually in package order. `npm audit --audit-level=high` reported 0 vulnerabilities, the release guard and release-package dry run passed, and `git diff --check` passed. Stress was not rerun because 0.32.3 does not change process/concurrency/output-limit behavior.
- Historical pre-publication local tarball before the fork package split: `codexpro-0.32.3.tgz`, 2,571,729 bytes, SHA-256 `EAD55B93F18165DDE9874EA9D111492418006FD70579CEA31C5540F053DC3736`. It is not the canonical public release artifact.
- Global CodexPro is installed as `0.32.3`; the CSX4213 practical profile and all other saved profile hashes were unchanged by installation. `codexpro doctor` passed and port 8787 is available.
- The verified 0.32.3 behavior includes allowed hidden workspace events and intentionally session-local implicit workspace selection; opened workspace IDs remain reusable across sessions when passed explicitly.
- The 0.32.3 release/install workflow intentionally stopped CodexPro before the subsequent fresh live ChatGPT validation; do not treat that pre-validation process state as current runtime state.
- Fresh live ChatGPT -> CodexPro 0.32.3 validation subsequently completed `PASS WITH WARNINGS`: all mandatory functional/safety/durability regressions passed, the allowed-hidden workspace event defect is fixed, no reproducible product defect was found, and the only warning was that the authenticated HTML control page was not inspected because doing so would have required retrieving the protected auth token.
- On 2026-09-06, the verified CodexPro Full line was consolidated onto canonical `main`. All temporary feature/fix/test/integration branches were removed locally and from `origin` after their adapted counterparts were verified in the consolidated history. The full `npm run smoke` chain passed on `main`, `npm audit --audit-level=high` reported 0 vulnerabilities, release packaging passed, and `origin` now exposes only `main`.
- GitHub CI was reworked and live-verified for the public fork: Linux Node 20 smoke, Windows Node 24 smoke, and the Linux release-integrity job all passed on the release target. CI fixture portability issues found by hosted runners were fixed without weakening runtime guards.
- GitHub Pages is enabled from `main:/docs` with HTTPS enforced and was verified live at `https://practicalswan.github.io/codexpro/`. Repository metadata now identifies CodexPro Full, Issues are enabled, and focused MCP/ChatGPT/developer-tool topics are configured.
- Public release `v0.32.3` is published at `PracticalSwan/codexpro` from tag target `cb9235d8b8b5b78f57dad56f17cb0bc676671755`. Release workflow run `33990557343` completed successfully and published `codexpro-full-0.32.3.tgz` plus its SHA-256 sidecar. The canonical tarball SHA-256 is `274704286e5a902ede535ba7f45d9302410ce33c6397f40b82afc991ff1e25e0`; a fresh disposable install directly from the public GitHub Release URL reported `codexpro --version` as `0.32.3`.
- The `codexpro-full` npm-registry package is not published; npm registry publication remains intentionally separate from the verified GitHub Release channel and must not be claimed until authenticated/trusted publishing is configured and independently verified.

Normal implementation evidence should use the smallest relevant set from: `npm run build`, focused `node scripts/<feature>-smoke.mjs`, `npm run smoke`, `npm run stress`, `npm audit --audit-level=high`, `npm run release:pack`, and `git diff --check`.

## Memory update rule
Keep only verified durable facts here. Replace stale branch/commit/PR state when newer authoritative evidence exists. Put execution history in Git/PRs or task-specific status files, not in this memory document.

- **Telegram remote continuation planning (2026-09-08):** Plan 37 is planned as an optional dedicated private-bot, outbound-long-poll authorization surface. Bot token/private IDs stay in protected user state; browser/Telegram clicks share one-shot dispatch authorization and cannot bypass current revision/transport/browser safety. Plan 36 final acceptance now includes a fresh ChatGPT-session sanitized report copied back by the user.
