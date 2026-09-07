# CodexPro Plans 12–21 Unified Execution Plan

> **For agentic workers:** This is the execution controller for an explicitly authorized all-plans run. Each linked subsystem spec and plan remains authoritative for its own implementation, acceptance contracts, tests, and non-goals.

**Execution status:** Authorized and executed through the currently satisfiable capability gates on 2026-09-07. Plans 12-17 and 20 are verified; Plan 18 Stage 1 is verified with interactive approvals still fail-closed; Plan 19 is blocked by the current Tasks-extension/client-support gate; Plan 21 Stage A is Windows-live-verified with Linux-host validation pending and Goal Docker support intentionally host-only. The final cumulative build/smoke/stress/audit/release-pack/diff gate passed before integration.

**Goal:** Implement Plans 12–21 in one continuous future run while preserving subsystem isolation, dependency order, safety gates, evidence, and recoverability.

**Required order:** `12 → 13 → 14 → 15 → 16 → 17 → 20 → 18 → 19 → 21`

**Batch architecture:** Use one dedicated integration worktree/branch for the complete authorized batch. Complete each subsystem as a separately reviewed and verified milestone with its own commit. Do not merge to `main`, push `origin/main`, or reinstall the global package after every milestone; do those actions only after the final cumulative gate.

## Authoritative subsystem sources

| Plan | Subsystem | Depends on | Authoritative design | Authoritative implementation plan |
|---|---|---|---|---|
| 12 | MCP SDK Maintenance & Compatibility | 01, 04 | `../specs/2026-09-06-mcp-sdk-maintenance-design.md` | `2026-09-06-mcp-sdk-maintenance.md` |
| 13 | Granular Tool/Resource Policy | 02, 03, 12 | `../specs/2026-09-06-granular-policy-rules-design.md` | `2026-09-06-granular-policy-rules.md` |
| 14 | Trusted Lifecycle Hooks & Project Trust | 03, 04, 13 | `../specs/2026-09-06-trusted-lifecycle-hooks-design.md` | `2026-09-06-trusted-lifecycle-hooks.md` |
| 15 | Durable Touched-File Checkpoints | 03, 06 | `../specs/2026-09-06-durable-checkpoints-design.md` | `2026-09-06-durable-checkpoints.md` |
| 16 | Context Selection v2 | 06, 09 | `../specs/2026-09-06-context-v2-design.md` | `2026-09-06-context-v2.md` |
| 17 | Activity & Evidence Ledger | 03, 04, 05, 11 | `../specs/2026-09-06-activity-ledger-design.md` | `2026-09-06-activity-ledger.md` |
| 20 | Verification Repair Metadata | 05, 07, 16 | `../specs/2026-09-06-verification-repair-metadata-design.md` | `2026-09-06-verification-repair-metadata.md` |
| 18 | MCP v2 + Multi-Round Approvals | 12, 13 | `../specs/2026-09-06-mcp-v2-approvals-design.md` | `2026-09-06-mcp-v2-approvals.md` |
| 19 | MCP Tasks Bridge | 18 | `../specs/2026-09-06-mcp-tasks-bridge-design.md` | `2026-09-06-mcp-tasks-bridge.md` |
| 21 | Optional Docker Execution Backend | 03, 05, 11, 13 | `../specs/2026-09-06-docker-execution-backend-design.md` | `2026-09-06-docker-execution-backend.md` |

## Codex CLI prohibition

Codex CLI is not an allowed execution mechanism for this batch. Do not invoke `codex`, `codex exec`, `codex review`, `codex apply`, or any other Codex CLI command for implementation, debugging, testing, review, delegation, or repository mutation. Execute every milestone directly with the host-native tools and repository tooling available in the active session.

## Batch-wide invariants

- Preserve CodexPro as a local MCP bridge for explicitly allowed workspaces. No model proxying, quota/account pooling, approval bypass, hosted code persistence, or unrestricted remote control.
- Preserve `PathGuard`, blocked-path handling, redaction, global/profile capability gates, tightening-only workspace policy, operation receipts, leases, process ownership, Git guards, and Goal projection boundaries.
- Use current architecture before adding dependencies or parallel subsystems. Keep `src/server.ts` focused on registration/orchestration.
- Preserve unrelated dirty, staged, untracked, profile, secret, tunnel, and user-owned state. Never use broad reset/clean/checkout to recover the batch.
- Do not publish a release, npm package, deployment, tag, or GitHub Release unless separately authorized after implementation.
- Capability-gated behavior must fail closed. Do not weaken a security boundary merely to make Plan 18, 19, or 21 appear complete.
- Windows is a first-class target. Where a subsystem claims cross-platform behavior, preserve the exact platform verification required by its own plan.

## CodexPro runtime lifecycle: hard stop boundary

- At batch preflight, detect whether a CodexPro runtime/session is already running. This check is read-only.
- **Never stop a running CodexPro runtime without explicit user approval for that specific stop.** State why the stop is required before requesting approval.
- **Never start or restart CodexPro.** This applies throughout the batch and after integration, global reinstall, or verification.
- If the user approves a stop, terminate only the CodexPro-owned process tree required for the authorized operation, leave it stopped, and do not touch unrelated Node processes or unrelated tunnel clients.
- A source build/test does not justify stopping the running installed CodexPro. Keep the existing runtime alive while implementation proceeds in the isolated worktree whenever possible.
- If final global reinstall is blocked by a running CodexPro and no stop approval exists, skip/defer only the reinstall, keep the runtime untouched, finish other authorized integration/push steps, and report `global reinstall pending`.
- If a stop is approved and reinstall succeeds, leave CodexPro stopped. The user owns any later manual start.

## Phase 0 — Batch preflight and isolation

- [ ] Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, `docs/agentic/PLAN_INDEX.md`, this umbrella plan, and current Git status/log/remotes.
- [ ] Verify canonical root, `main`, `origin`, current HEAD, upstream relationship, and all pre-existing dirty/untracked paths. Treat unrelated changes as user-owned.
- [ ] Detect existing CodexPro processes/tunnels without terminating or changing them; record only the minimal non-secret runtime fact needed for the batch.
- [ ] Refresh time-sensitive official MCP SDK/protocol/client capability evidence before Plans 12, 18, and 19. Refresh Docker/platform evidence before Plan 21 if that stage is reached.
- [ ] Create one dedicated worktree/branch from the verified `main` HEAD, for example `roadmap/plans-12-21`, only after implementation is explicitly authorized.
- [ ] Establish a clean implementation baseline with current lockfile dependencies, `npm run build`, and the normal smoke baseline. Do not modify the global install or active tunnel for baseline testing.

## Milestone protocol used for every plan

For each milestone below, the controller must perform this sequence before moving to the next plan:

1. Re-read that plan's authoritative design and implementation plan against the current cumulative branch state.
2. Reconcile assumptions invalidated by earlier milestones or fresh upstream/protocol evidence; update the plan/spec first if the contract materially changes.
3. Add or confirm focused RED/parity contracts exactly as required by the subsystem plan.
4. Implement only that subsystem's coherent scope, reusing interfaces introduced by earlier milestones.
5. Run the subsystem's focused checks and required build/smoke/stress/audit/package checks.
6. Review pass 1 for spec/acceptance-contract compliance, then review pass 2 for defects, security, portability, boundedness, stale docs, and cross-plan regressions.
7. Update only documentation that is true from verified behavior. Update `PLAN_INDEX.md`/`PROJECT_MEMORY.md` status only when supported by evidence.
8. Inspect the intended diff and make one milestone commit on the batch integration branch. Do not push or merge yet.
9. Confirm the working tree contains no accidental generated output, secrets, temp files, or unrelated edits before starting the next milestone.

If a milestone fails, preserve its branch/worktree state and report the exact last verified milestone. Do not reset the user's main workspace to recover.

## Milestone 12 — MCP SDK Maintenance & Compatibility

**Objective:** establish the maintained MCP v1 baseline and one `mcpCompat.ts` seam without enabling v2 behavior.

- [ ] Follow `2026-09-06-mcp-sdk-maintenance.md` in full, including its SDK/lockfile review and compatibility contracts.
- [ ] Preserve tool names, schemas, annotations, resources/tool cards, stdio, Streamable HTTP, continuity, and supertool behavior.
- [ ] Keep `protocolEra="2025"`, `supportsInputRequired=false`, and `supportsTaskExtension=false` at this stage.
- [ ] Run `npm run build`, `node scripts/mcp-compat-smoke.mjs`, required HTTP/MCP regressions, `npm run smoke`, `npm audit --audit-level=high`, `npm run release:pack`, and `git diff --check` as required by the subsystem plan.
- [ ] Commit only after the milestone passes both review stages. Suggested milestone message: `feat: modernize mcp sdk compatibility`.

**Handoff to Plan 13:** `mcpCompat.ts` is the only SDK-version seam; Plan 13 must not introduce protocol-version branching into policy handlers.

## Milestone 13 — Granular Tool/Resource Policy

**Objective:** add deterministic workspace policy v2 action/resource allow-deny rules without weakening global/profile gates or v1 compatibility.

- [ ] Follow `2026-09-06-granular-policy-rules.md` in full; keep `ask` out of this milestone.
- [ ] Normalize filesystem, Bash, and Git publication resources before matching; deny a multi-resource mutation when any target is denied.
- [ ] Prove explicit tools and supertool dispatch pass through the same central policy decision and cannot re-enable globally disabled capabilities.
- [ ] Preserve policy schema v1 behavior and expose only bounded sanitized rule summaries through existing policy/diagnostic surfaces.
- [ ] Run `npm run build`, `node scripts/policy-rules-smoke.mjs`, existing policy regressions, `npm run smoke`, and `git diff --check` per the subsystem plan.
- [ ] Commit after both reviews. Suggested message: `feat: add granular resource policy rules`.

## Milestone 14 — Trusted Lifecycle Hooks & Project Trust

**Objective:** add minimal lifecycle hooks whose executable configuration is inert until externally trusted and fingerprint-matched.

- [ ] Follow `2026-09-06-trusted-lifecycle-hooks.md` in full.
- [ ] Support only `session_start`, `before_tool`, `after_tool`, and unambiguous CodexPro-owned `task_end` boundaries in the first version.
- [ ] Store trust outside the repository; changed executable hook configuration invalidates prior trust.
- [ ] Ensure hooks cannot override declarative denies or capability gates. `before_tool` may block only according to the plan's exit contract; hook timeout/output/redaction limits remain independent of Bash mode.
- [ ] Add only the planned read-only trust-status MCP surface; trust mutation remains CLI-only.
- [ ] Run `npm run build`, `node scripts/hooks-smoke.mjs`, relevant policy/runtime regressions, `npm run smoke`, and `git diff --check`.
- [ ] Commit after both reviews. Suggested message: `feat: add trusted lifecycle hooks`.

**Foundation gate after Plan 14:** run a cumulative `npm run build` + `npm run smoke` and review the combined 12–14 diff for SDK/policy/hook bypass paths before continuing.

## Milestone 15 — Durable Touched-File Checkpoints

**Objective:** add bounded `chk_*` preimage checkpoints for CodexPro-touched files and safe hash-guarded restoration without broad Git rollback.

- [ ] Follow `2026-09-06-durable-checkpoints.md` in full.
- [ ] Capture only allowed files after authorization/PathGuard checks and before mutation; finalize after-hashes only after successful mutation.
- [ ] Never snapshot the whole workspace, Git index/refs, blocked paths, credentials, dependency trees, or unrelated files.
- [ ] Make `write`, `edit`, `apply_patch`, and `apply_change_set` return checkpoint identity where planned; make `restore_checkpoint` verify current post-hashes before restoring.
- [ ] Preserve later user edits by failing closed on stale hash mismatches rather than overwriting them.
- [ ] Run `npm run build`, `node scripts/checkpoints-smoke.mjs`, mutation/operation regressions, `npm run smoke`, `npm run stress`, and `git diff --check` as required.
- [ ] Commit after both reviews. Suggested message: `feat: add durable touched-file checkpoints`.

## Milestone 16 — Budgeted Context Selection v2

**Objective:** improve existing context ranking with task-aware strategies, explicit evidence/reasons, bounded caching, and reusable subtask bundles.

- [ ] Follow `2026-09-06-context-v2.md` in full; extend the existing analysis/context seam rather than creating a second indexer.
- [ ] Preserve the current hard byte ceiling; treat `targetTokens` only as an advisory estimate with no tokenizer dependency.
- [ ] Implement deterministic `task`, `symbol`, and `change` strategies with test/dependent/recent-change weighting as specified.
- [ ] Invalidate bounded cached analysis when relevant writes/events change the evidence basis.
- [ ] Keep `prepare_subtask_context` read-only; it packages evidence but never launches or recursively orchestrates models.
- [ ] Run `npm run build`, `node scripts/context-v2-smoke.mjs`, context/code-intelligence regressions, `npm run smoke`, and `git diff --check`.
- [ ] Commit after both reviews. Suggested message: `feat: improve budgeted context selection`.

## Milestone 17 — Unified Activity & Evidence Ledger

**Objective:** provide one bounded sanitized chronology of important CodexPro activity without storing prompts, source dumps, raw command output, secrets, or hidden reasoning.

- [ ] Follow `2026-09-06-activity-ledger.md` in full.
- [ ] Correlate operation/check/process/Goal/tool outcome identifiers while keeping canonical subsystem stores authoritative.
- [ ] Use bounded per-workspace sequencing, filtering, rotation, crash-tolerant JSONL reads, and sanitized workspace-relative evidence only.
- [ ] Register only the planned read-only `activity_log` surface; it must never replay or re-execute entries.
- [ ] Run `npm run build`, `node scripts/activity-ledger-smoke.mjs`, diagnostics/operation/process/Goal regressions, `npm run smoke`, and `git diff --check`.
- [ ] Commit after both reviews. Suggested message: `feat: add activity evidence ledger`.

## Milestone 20 — Structured Verification Repair Metadata

**Objective:** enrich `verify_changes` failures with deterministic bounded repair evidence without creating an autonomous edit/test loop.

- [ ] Follow `2026-09-06-verification-repair-metadata.md` in full and reuse Plan 16 ranking/impact evidence where specified.
- [ ] Classify failure evidence deterministically, prioritize structured failure paths, then changed/dependent/test paths, normalize/dedupe, and cap every returned set.
- [ ] Preserve verification execution semantics: repair metadata is evidence for the host model, not a request to modify files or rerun checks automatically.
- [ ] Keep raw secrets, unrestricted logs, source dumps, and hidden reasoning out of repair metadata.
- [ ] Run `npm run build`, `node scripts/verification-repair-smoke.mjs`, `node scripts/checks-smoke.mjs`, `npm run smoke`, and `git diff --check`; add stress only if implementation unexpectedly touches process/concurrency behavior.
- [ ] Commit after both reviews. Suggested message: `feat: add verification repair metadata`.

**Core-quality gate after Plan 20:** run cumulative build/smoke, inspect all 12–17/20 public tool/schema changes together, and verify policy/redaction/boundedness consistency before protocol-v2 work begins.

## Milestone 18 — MCP v2 Compatibility & Multi-Round Approvals

**Objective:** migrate through the Plan 12 compatibility seam and add one-shot `ask` decisions only when official protocol/SDK support and the connected ChatGPT capability are demonstrably compatible.

- [ ] Follow `2026-09-06-mcp-v2-approvals.md` in full. Refresh official MCP package/protocol and live ChatGPT capability evidence before changing runtime behavior.
- [ ] First prove existing v1-visible tools/resources/annotations/HTTP continuity remain compatible behind the new SDK line before enabling approval behavior.
- [ ] Bind approval fingerprints to workspace, action, normalized resources, and relevant expected state. No target side effect may begin before accepted approval validates.
- [ ] Integrate `ask` only through the central pre-dispatch policy/request-context path; do not add an approval-bypass MCP tool.
- [ ] For unsupported/legacy clients, use only explicitly advertised compatible interaction mechanisms; otherwise fail closed with structured approval-required/unsupported output.
- [ ] Run `npm run build`, `node scripts/mcp-v2-compat-smoke.mjs`, required MCP/HTTP/policy regressions, `npm run smoke`, `npm audit --audit-level=high`, `npm run release:pack`, and `git diff --check`.
- [ ] Commit after both reviews. Suggested message: `feat: add capability-gated mcp approvals`.

**Gate:** If the subsystem plan's required stable/live approval capability cannot be proven, do not fake support. Preserve the verified compatibility/fail-closed state, record the unmet gate, and leave any unsupported portion unverified. Because Plan 19 depends on Plan 18, do not implement Plan 19 unless its dependency is genuinely satisfied.

## Milestone 19 — MCP Tasks Bridge

**Objective:** expose standard MCP Tasks only as a thin adapter over existing `proc_*`/`goal_*` state when the official extension and connected client are stable and supported.

- [ ] Follow `2026-09-06-mcp-tasks-bridge.md` in full and perform its mandatory maturity/client-capability gate before editing runtime code.
- [ ] Do not create another scheduler, task database, or parallel CodexPro task tool. Existing process/Goal state remains canonical.
- [ ] Map task status, cancellation, and result retrieval to existing ownership/durability guards and preserve restart/reconnect semantics required by the stable extension.
- [ ] If the official Tasks extension or ChatGPT support is not clearly stable/supported, make no speculative runtime change and leave Plan 19 Planned with the blocker documented.
- [ ] If the gate passes, run `npm run build`, `node scripts/mcp-tasks-bridge-smoke.mjs`, process/Goal/MCP regressions, `npm run smoke`, and `git diff --check`.
- [ ] Commit only if an implementation was actually verified. Suggested message: `feat: bridge mcp tasks to durable state`.

## Milestone 21 — Optional Docker Execution Backend

**Objective:** add Docker as an opt-in adapter beneath existing Bash/process ownership while preserving host execution as the default; Goal execution is a separately gated second stage.

- [ ] Follow `2026-09-06-docker-execution-backend.md` in full.
- [ ] First introduce and verify a behavior-preserving host backend seam before enabling Docker selection.
- [ ] Docker must use an already installed CLI and explicitly configured pre-existing image; never install Docker, pull/build/login, or add a Docker npm dependency merely for convenience.
- [ ] Enforce host-side authorization before dispatch, one canonical workspace mount, `--network none`, bounded CPU/memory/PIDs, no privileged/host PID/IPC, and no home/credential/Docker-socket/extra mounts.
- [ ] Preserve process output limits, ownership, stop/cleanup, operation receipts, and safe/full Bash policy above the backend adapter.
- [ ] Run pure backend/host parity tests even when Docker is unavailable. Live Docker claims require the explicit platform/image probe from the subsystem plan.
- [ ] Enable Goal Docker execution only if the real detached-worktree compatibility probe proves the source checkout remains isolated. A safe `goalDockerAvailable=false` result is preferable to weakening mounts or Git isolation.
- [ ] Run the subsystem's required `npm run build`, backend/process/Goal tests, `npm run smoke`, `npm run stress`, live Docker smoke where explicitly supplied/available, and `git diff --check`. Audit/package checks apply if package metadata changes.
- [ ] Commit after both reviews. Suggested message: `feat: add optional docker execution backend`.

## Phase 11 — Final cumulative verification

Run only after every dependency-satisfied milestone has reached its valid completion state.

- [ ] Re-read all ten specs/plans and map every acceptance contract to implementation evidence or an explicitly recorded capability gate that the authoritative plan allows.
- [ ] Run `npm run build`.
- [ ] Run every focused smoke introduced or modified by Plans 12–21.
- [ ] Run full `npm run smoke` from the cumulative integration branch.
- [ ] Run `npm run stress` because the complete batch includes mutation/process/Goal/execution-backend changes.
- [ ] Run `npm audit --audit-level=high` because the batch includes MCP dependency work.
- [ ] Run `npm run release:pack` and inspect package contents because the batch changes compatibility/package-facing surfaces.
- [ ] Run `git diff --check`, secret-pattern checks/release guard used by the repository, and inspect the full cumulative diff plus milestone history.
- [ ] Perform final spec-compliance review across cross-plan interactions, followed by a defect-first review covering policy bypass, path containment, secret leakage, stale fingerprints, process/container cleanup, protocol fallback, Windows behavior, and docs accuracy.

## Phase 12 — Documentation, integration, push, and installation

- [ ] Update `README.md`, `FEATURES.md`, `SECURITY.md`, subsystem docs, configuration examples, and `CHANGELOG.md` only for behavior actually verified in the cumulative branch.
- [ ] Update `docs/agentic/PLAN_INDEX.md` status independently per plan. Do not mark a capability-gated or incomplete plan Verified merely because the batch continued past it.
- [ ] Update `docs/agentic/PROJECT_MEMORY.md` with durable verified outcomes, platform/capability limitations, and any remaining blocked Planned item.
- [ ] Verify `main`/`origin/main` have not moved incompatibly since batch start. Reconcile safely if needed; never force-push or rewrite history.
- [ ] Integrate the complete verified milestone history into `main` while preserving unrelated user work, then verify the intended main diff/history.
- [ ] Push `origin/main` once and verify the remote commit directly. Do not create a tag, Release, deployment, or npm publication without separate authorization.
- [ ] Before global reinstall, re-check for a running CodexPro runtime. If one is running, follow the hard runtime lifecycle boundary: ask explicit approval to stop; never stop pre-emptively and never restart.
- [ ] If stop approval is absent, leave CodexPro running and report the otherwise-complete batch with `global reinstall pending`.
- [ ] If stop approval is granted, stop only CodexPro, reinstall the verified `codexpro-full` package, verify the installed package/CLI statically (for example package version and installed files), and **leave CodexPro stopped**. Do not start or restart it for a live check.

## Recovery and continuation rules

- Every verified subsystem milestone must have a dedicated commit, so a new session can resume from the last verified milestone without replaying completed plans.
- If a later milestone exposes a defect in an earlier milestone, fix it on the same integration branch, rerun the earlier focused contract plus all dependent milestone checks, and record the repair in the next coherent commit.
- Never discard a partially implemented milestone with broad Git reset/clean operations when it could contain user work. Inspect exact paths and use reversible, targeted recovery.
- If the batch is interrupted, report: base commit, integration branch/worktree, verified milestone commits, current partial milestone, working-tree state, tests run, blockers, running CodexPro state, and the exact next action.
- Plans 18, 19, and 21 contain environment/protocol capability gates. A gate failure is not permission to invent support, weaken security, or silently skip evidence. Record the supported outcome exactly as defined by the authoritative subsystem plan.

## Completion criteria

The batch is complete only when all dependency-satisfied scope is implemented according to its authoritative spec, each completed plan has independent verification evidence and a milestone commit, cumulative verification passes, documentation matches actual behavior, integration/push evidence is direct, and the CodexPro runtime lifecycle rule was not violated.

A global reinstall may remain explicitly pending when a running CodexPro session exists and the user has not approved stopping it. That pending install does not authorize an agent to stop or restart CodexPro later without a new explicit instruction.
