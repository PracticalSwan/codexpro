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
Implementation begins only when the user authorizes the exact plan scope. For single-plan work, read that plan and its referenced spec in full. For explicitly authorized Plans 12–21 batch execution, follow `docs/superpowers/plans/2026-09-06-roadmap-12-21-execution.md`. For explicitly authorized Plans 22–28 batch execution, follow `docs/superpowers/plans/2026-09-08-deadline-resilience-execution.md`. Use one dedicated cumulative integration worktree/branch for the authorized batch, then read each subsystem spec/plan immediately before its milestone. Batch execution is continuous, but subsystem acceptance criteria, focused tests, review, and milestone commits remain distinct; never collapse the batch into one undifferentiated implementation.

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
- Plans 22–28 define a future synchronous MCP deadline with a 20-minute (`1,200,000` ms) default and validated 5–60 minute per-profile setting. The effective value is a transport/blocking-call boundary only, never a task-quality deadline.
- New or modified potentially-long tools must declare their execution class: synchronous, existing workspace process (`proc_*`), structured durable job (`job_*`), Durable Goal (`goal_*`), or resumable in-process batch (`batch_*`).
- Never reduce requested scope, acceptance criteria, review depth, required verification, or safety checks to fit one call. If correct work will not comfortably fit, persist truthful progress and continue through the appropriate resumable primitive.
- Composite synchronous operations must share one remaining effective deadline budget across phases; they may not reset the configured budget for each child operation.
- Status/polling calls should return promptly and use condition-based progress. Repeated polling with no state change is not material progress.

## Runtime lifecycle rule
- Detect whether CodexPro is already running before any step that could require replacing the global installation, changing its tunnel/runtime state, or terminating processes.
- If CodexPro is running, **do not stop it without explicit user approval for that specific stop**. Explain why stopping is required before requesting approval.
- Agents must **never start or restart CodexPro**. This prohibition applies even after an approved stop, successful reinstall, verification, commit, or push.
- If stop approval is granted, stop only the CodexPro-owned process tree necessary for the authorized operation, leave CodexPro stopped afterward, and do not terminate unrelated Node processes, tunnels, or other services.
- If an authorized global reinstall cannot proceed while CodexPro is running and stop approval is absent, leave the runtime untouched, skip/defer the reinstall, and report the reinstall as pending. Source integration/push may proceed when otherwise authorized and safe.

## Stop conditions
Stop and report instead of forcing progress when the exact workspace is uncertain, protected/unrelated changes would be overwritten, a security boundary cannot be preserved, required external authorization is absent, or evidence contradicts the plan's assumptions.
