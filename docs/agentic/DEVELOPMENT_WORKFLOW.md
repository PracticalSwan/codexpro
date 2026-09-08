# CodexPro Agentic Development Workflow

## Purpose
This is the execution contract for future CodexPro development. It keeps work spec-driven, reviewable, recoverable, and proportional to risk.

## Lifecycle
1. **Recover state** — read `AGENTS.md`, project memory, Git status/log/remotes, current upstream/PR state, and the selected plan/spec.
2. **Map context** — identify entry points, dependencies, tests, configs, docs, public contracts, and nearby security/platform risks before editing.
3. **Isolate implementation** — when implementation is authorized, use a dedicated feature branch/worktree for roadmap work unless the user explicitly requests another workflow.
4. **RED** — add or identify a focused regression/contract check that demonstrates the missing behavior or protects the new interface.
5. **GREEN** — implement the smallest coherent behavior behind the planned module seam.
6. **Integrate** — wire MCP registration/config/admin surfaces only after the module behavior works independently.
7. **Review stage 1: spec compliance** — verify every selected-plan acceptance criterion and reject scope drift.
8. **Review stage 2: code quality** — inspect correctness, security, concurrency, portability, redaction, boundedness, maintainability, and stale docs.
9. **Verify** — run focused tests, build, then broader smoke/stress/audit only when the touched risk surface requires them.
10. **Handoff** — report files changed, evidence, skipped checks, blockers, residual risk, and exact next step. Update durable memory only when state truly changed.

## Planning gate
Planning work may create or refine `docs/agentic/**`, `docs/superpowers/specs/**`, and `docs/superpowers/plans/**`. It must not modify runtime source, dependencies, generated build output, profiles, tunnels, or external services.

## Implementation gate
Implementation begins only when the user authorizes the exact plan scope. For single-plan work, read that plan and its referenced spec in full. For explicitly authorized Plans 12–21 batch execution, follow `docs/superpowers/plans/2026-09-06-roadmap-12-21-execution.md`. For explicitly authorized Plans 22–28 batch execution, follow `docs/superpowers/plans/2026-09-08-deadline-resilience-execution.md`. For explicitly authorized Plans 29–37 browser-continuation batch execution, follow `docs/superpowers/plans/2026-09-08-task-aware-browser-continuation-execution.md`. Use one dedicated cumulative integration worktree/branch for the authorized batch, then read each subsystem spec/plan immediately before its milestone. Batch execution is continuous, but subsystem acceptance criteria, focused tests, review, and milestone commits remain distinct; never collapse the batch into one undifferentiated implementation.

## Codex CLI prohibition
- Do not use Codex CLI for CodexPro implementation, debugging, testing, review, delegation, or repository mutation. This includes `codex`, `codex exec`, `codex review`, `codex apply`, and all other Codex CLI subcommands.
- Implementation agents must perform work directly through the current host-native tools and the repository's own commands/tests. Do not use Codex CLI as a subagent, fallback, reviewer, or command runner.

## Agent roles
- **Controller**: owns scope, state recovery, sequencing, integration, final evidence, and user communication.
- **Implementer**: receives one plan task at a time with exact files/interfaces and returns diff + verification evidence.
- **Spec reviewer**: checks only requirements/acceptance-criteria compliance; does not redesign the feature.
- **Code reviewer**: defect-first review after spec compliance; focuses on correctness/security/quality.

## State and memory
- Git and PRs are execution history.
- `PROJECT_MEMORY.md` is durable state, not a diary.
- `DECISIONS.md` records stable architectural choices and reconsideration triggers.
- `PLAN_INDEX.md` maps roadmap features to their one authoritative spec/plan.
- Use task checkpoints only after feature #23 exists; until then, normal Git/worktree state plus explicit handoff notes are authoritative.

## Verification policy
- Documentation-only planning: inspect generated Markdown, links/paths, feature coverage, and Git diff; do not run runtime test suites.
- Local module behavior: focused smoke + `npm run build`.
- Shared MCP/tool registration/config: focused smoke + `npm run build` + `npm run smoke`.
- Process/concurrency/output budgets: add `npm run stress`.
- Dependency/release work: add `npm audit --audit-level=high` and release packaging checks.
- For single user-authorized CodexPro implementation or defect-fix work, after successful verification automatically update relevant docs/instructions, commit the intended change, integrate into `main`, push `origin/main`, and reinstall the global `codexpro-full` package when that install can be performed without violating the runtime-lifecycle rule below. For an explicitly authorized multi-plan batch, create verified milestone commits during the batch but perform integration, push, and global reinstall only once after the final cumulative gate. Releases/publication/deployment, force operations, and unrelated external mutations still require separate authorization; directly verify every external action actually performed.

## Long-running tool design rule
- Plans 22–28 implement tool-time awareness by default. Normal mode is bounded at 20 minutes (`1,200,000` ms), finite range 5–60 minutes; explicit Unlimited/observe is temporary discovery mode and retains elapsed diagnostics/conservative routing without a cooperative cutoff. Routing derives centrally from finite reference `D`: sync-preferred is `min(5 minutes, 25% of D)` and async-preferred begins at `75% of D`; low-variance work between may remain synchronous.
- New or modified potentially-long tools must declare their execution class: synchronous, existing workspace process (`proc_*`), structured durable job (`job_*`), Durable Goal (`goal_*`), or resumable in-process batch (`batch_*`). When explicit duration/risk metadata exists, use the shared deterministic execution-guidance thresholds and surface an additive `execution_hint`; never infer duration from prompt text or silently start a more privileged primitive.
- Never reduce requested scope, acceptance criteria, review depth, required verification, or safety checks to fit one call. If correct work will not comfortably fit, persist truthful progress and continue through the appropriate resumable primitive.
- Composite synchronous operations must share one remaining effective deadline budget across phases; they may not reset the configured budget for each child operation.
- Status/polling calls should return promptly and use condition-based progress. Repeated polling with no state change is not material progress.
- For first-time host-window discovery, guide the user to a disposable new chat, temporarily select Unlimited/observe, run only the mutation-free `tool_time_probe`, note the ChatGPT-side closure time, then restore a bounded value with safety margin. Never measure by leaving real project mutations open-ended.

## Browser continuation fail-closed rule
- Plans 29–37 continuation is optional/default-off. When enabled, it derives interruption timing from current runtime status (`runtimeGenerationId`, deadline mode/value, transport readiness), never from saved/default settings; Unlimited/observe disables timeout inference entirely.
- Runtime/tunnel loss, restart, browser reconnect after a long gap, manual user message/Stop action, task completion/cancel, auth loss, wrong/stale chat route, streaming, or generic platform busy/error/retry/unknown UI suppress continuation; no auto-Retry/model switch/tunnel restart is allowed.
- Terminal task revision and user intent take precedence over stale browser popup/notification state.
- Continuation profile/admin settings are non-secret next-run defaults. CLI/admin status must distinguish those saved defaults from current runtime/task/browser state; immediate Disarm and browser-client Revoke act only on continuation state and must not rewrite the running server configuration or stop CodexPro/tunnel/browser/process/job/Goal/Git work.
- `continuationCount` counts successful dispatches only. A successful dispatch enters acknowledgement-pending state, requires a later CodexPro/model interaction before another cycle, obeys the configured cooldown/max-dispatch ceiling, and never allows a browser notification click to authorize or send a message by itself.
- If the user ignores a ready continuation and sends a prompt, the manual turn atomically stales browser/Telegram actions without capturing text. On the next CodexPro interaction the model reconciles it as resume, redirect, supersede-new-task, or cancel; ambiguity remains paused.

## Browser authentication stop rule
- For Plans 29–37 implementation or live browser verification, any ChatGPT/provider sign-in, CAPTCHA, passkey, 2FA, email confirmation, or similar security verification is a mandatory human boundary.
- Launch/open only the dedicated managed browser profile, then **STOP** and report `WAITING_FOR_USER_AUTH`. Never ask for credentials/codes in chat/terminal and never capture login screenshots/keystrokes.
- Resume only after the user completes authentication directly in the browser and sends `continue`; recover repository/process/browser/task state first, then verify only coarse signed-in health.
- Branded Chrome/Edge uses the browser-supported manual **Load unpacked** flow for the CodexPro companion; do not depend on removed/ignored command-line unpacked-extension flags.
- MV3 service-worker timers are not authoritative liveness. A coarse content-script heartbeat may wake the worker, but every reconnect must fetch fresh server task/revision state before controls become available.
- ChatGPT DOM integration must prefer the primary `#prompt-textarea`/ProseMirror editor and composer-scoped send control over hidden fallback textareas. Extension-generated fixed-message insertion must be distinguished from trusted user input so only genuine user activity triggers `recent_user_input`/manual-turn precedence.
- Authentication stop requirements override continuous batch execution.

## Runtime lifecycle rule
- Detect whether CodexPro is already running before any step that could require replacing the global installation, changing its tunnel/runtime state, or terminating processes.
- If CodexPro is running, **do not stop it without explicit user approval for that specific stop**. Explain why stopping is required before requesting approval.
- Agents must **never start or restart CodexPro**. This prohibition applies even after an approved stop, successful reinstall, verification, commit, or push.
- If stop approval is granted, stop only the CodexPro-owned process tree necessary for the authorized operation, leave CodexPro stopped afterward, and do not terminate unrelated Node processes, tunnels, or other services.
- If an authorized global reinstall cannot proceed while CodexPro is running and stop approval is absent, leave the runtime untouched, skip/defer the reinstall, and report the reinstall as pending. Source integration/push may proceed when otherwise authorized and safe.

## Stop conditions
Stop and report instead of forcing progress when the exact workspace is uncertain, protected/unrelated changes would be overwritten, a security boundary cannot be preserved, required external authorization is absent, or evidence contradicts the plan's assumptions.

### Telegram continuation setup boundary

For future Plan 37 implementation, Telegram is optional/default-off and is not requested or started unless task continuation is already enabled and Telegram is explicitly enabled. It uses a dedicated private bot plus outbound long polling. If bot creation/token configuration is required, STOP and report `WAITING_FOR_TELEGRAM_BOT_TOKEN`; instruct the user to use `@BotFather` and CodexPro's masked local token-save command, never chat. Resume only after the user sends `continue`. Then generate the one-time private-bot pairing link/code, STOP as `WAITING_FOR_TELEGRAM_PAIR`, and resume only after the user presses Start/completes pairing and sends `continue`.

A Telegram callback is a one-shot user authorization source, not a watchdog action. It cannot bypass current task revision/nonce, terminal state, transport, browser authentication/binding/page safety, manual-user pause, or active durable-work suppression. Telegram failure falls back to the browser authorization surface without automatic submission.

Final acceptance after Plans 29–37 uses a new ChatGPT conversation with installed CodexPro Full to run the documented disposable acceptance matrix and emit a sanitized Markdown report. The user copies that report back for maintenance review; the test session does not mutate CodexPro source unless separately authorized.
Product defaults remain continuation=false and Telegram=false; during this user's later authorized local setup, save both true for their own profile as explicitly requested, without changing package defaults.
