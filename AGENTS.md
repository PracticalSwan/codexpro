# CodexPro Agent Instructions

Scope: this repository and all descendants.

## Start here
1. Read `docs/agentic/PROJECT_MEMORY.md` for durable current-state facts.
2. Read `docs/agentic/DEVELOPMENT_WORKFLOW.md` before planning or implementation.
3. For roadmap work, open `docs/agentic/PLAN_INDEX.md`. For a single subsystem, read its spec and plan. For explicitly authorized Plans 12–21 batch execution, read `docs/superpowers/plans/2026-09-06-roadmap-12-21-execution.md` first. For any future Plans 22–28 implementation, read `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md` and `docs/superpowers/plans/2026-09-08-deadline-resilience-execution.md` first, then the selected subsystem plan immediately before its milestone. For any future Plans 29–37 implementation, read `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md` and `docs/superpowers/plans/2026-09-08-task-aware-browser-continuation-execution.md` first, then the selected subsystem plan immediately before its milestone. Plan 36 remains the final security/live/fresh-session gate and Plan 37 is implemented before it when Telegram is in scope.
4. Inspect current Git status, branch, upstream state, touched execution paths, relevant tests, and whether a CodexPro runtime is already running before changing source.

## Development rules
- Keep CodexPro a local MCP bridge for explicitly allowed workspaces. Preserve its trust boundary and mode gates.
- Prefer deep modules with small interfaces. Keep `src/server.ts` focused on registration/orchestration; put subsystem logic in focused modules.
- Reuse existing dependencies and architecture. Add dependencies only when the selected plan explicitly justifies them.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, and user-owned state.
- Planning tasks may create/update planning documentation only; they do not change runtime source.
- For Plans 22–28, tool-time awareness is enabled by default. Normal mode is bounded at exactly `1,200,000` ms (20 minutes), configurable from 5–60 minutes; explicit `unlimited` is temporary observe-only discovery for the harmless probe, not the normal mutation setting. Treat every configured value only as a blocking-call boundary: implementation and agent guidance must never reduce requested scope, acceptance criteria, review depth, required verification, or safety checks to fit it. Preserve the full goal through `proc_*`, planned structured `job_*`, Durable Goals, or resumable `batch_*` continuation instead.
- Plans 29–37 continuation is **optional and disabled by default**; it must not be required for Plans 22–28 tool-time awareness/durable execution. If enabled, ChatGPT/provider authentication is a mandatory human boundary: open only the dedicated managed browser profile, STOP and report `WAITING_FOR_USER_AUTH`, and resume only after the user authenticates and sends `continue`. Telegram setup is needed only when continuation + Telegram are enabled and is also human-gated; never ask for the token in chat. Version 1 dispatch remains explicitly user-authorized. Watchdog timing uses the current bounded runtime mode/deadline/generation/transport snapshot; Unlimited/observe disables timeout inference. Manual user turns/Stop actions, terminal state, stopped transport, and ambiguous/busy/error UI suppress continuation.
- A manual user prompt in the bound conversation always outranks pending continuation: invalidate stale browser/Telegram authorization without reading prompt text, then let the semantic controller reconcile resume, redirect, supersede-new-task, or cancel; ambiguity stays paused.
- Current operator preference for future authorized local setup: enable continuation and Telegram for this user's own profile after implementation, while preserving package defaults off; planning alone must not mutate that profile.
- **Codex CLI is prohibited for CodexPro implementation work.** Do not invoke `codex`, `codex exec`, `codex review`, `codex apply`, or any Codex CLI subcommand for implementation, debugging, testing, review, delegation, or repository mutation. Perform the work directly with the available host-native tools and repository tooling.
- Implementation starts only from approved plan scope. A user may explicitly authorize one subsystem, the Plans 12–21 umbrella execution, or the Plans 22–28 deadline-resilience umbrella execution. Batch authorization still requires each subsystem spec/plan to be implemented, reviewed, and verified as a distinct milestone on one isolated cumulative integration worktree/branch.
- For a single user-authorized CodexPro implementation or defect fix, successful verification is standing authorization to update relevant docs/instructions, commit the intended change, integrate it into `main`, push `origin/main`, and reinstall the global `codexpro-full` package without asking again. For an explicitly authorized multi-plan batch, make milestone commits on the integration branch but defer integration, push, and global reinstall until the entire authorized batch reaches its final cumulative gate.
- **Running CodexPro lifecycle is user-controlled.** If any CodexPro runtime/session is already running, do not stop it unless the user explicitly approves that stop after being told why it is required. Agents must never start or restart CodexPro. If a stop is approved, stop only the CodexPro-owned process tree required for the authorized operation, leave it stopped afterward, and do not touch unrelated runtimes/tunnels. If a global reinstall or other step requires stopping a running CodexPro and approval is absent, skip/defer that step and report it as pending.
- Preserve unrelated dirty/untracked work, never force-push, never publish a release/deployment unless separately authorized, and never persist or expose secrets outside approved secret storage.
- **Remote Desktop Commander access windows are approximately 25 minutes per user-triggered continuation.** Treat this as an execution-window constraint: recover state first, prioritize the highest-leverage verified work, avoid redundant long-running gates until the relevant milestone boundary, and leave an exact continuation handoff before tool closure. Never reduce scope, review depth, verification quality, or safety requirements merely to fit the window.
- When the operator says **"continue full maintenance"**, treat it as standing authorization for this repository to recover current local/origin/CI state, investigate evidence-backed defects or regressions, implement the smallest coherent fixes, update relevant docs/instructions, run risk-proportional verification, commit intended changes to `main`, push `origin/main`, and verify the resulting remote CI. Preserve unrelated work and all existing publication/deployment/runtime-lifecycle approval boundaries; in particular, never stop/restart a running CodexPro or publish a release without the authorization those actions require.

## Verification
- Run the narrowest relevant smoke/test first, then `npm run build`.
- Run full `npm run smoke` when shared MCP/runtime behavior changes; run `npm run stress` only for concurrency, process, output-limit, or release-risk changes.
- Run `npm audit --audit-level=high` for dependency or release work.
- Run `git diff --check` and inspect the final diff before completion claims.
- Report skipped checks and residual risk explicitly.

## Durable context
- Update `docs/agentic/PROJECT_MEMORY.md` only with durable verified facts, decisions, completed milestones, or active blockers; do not use it as a chronological log.
- Record architecture decisions in `docs/agentic/DECISIONS.md`.
- Keep status/mapping in `docs/agentic/PLAN_INDEX.md`; keep implementation detail in the relevant plan/spec instead of duplicating it here.
