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
Implementation begins only when the user authorizes the exact plan scope. Read the selected plan and its referenced spec in full immediately before implementation. `PLAN_INDEX.md` is the status/router source of truth; Plans 38–46 are implemented and verified; future feature work requires a fresh approved plan. Historical completed umbrella execution plans are not active instructions. If multiple current plans are explicitly authorized together, keep each subsystem's acceptance criteria, focused tests, review, and milestone evidence distinct even when one integration branch/worktree is used.

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
- Durable task checkpoints are available; use them when cross-session task facts materially help, while Git/worktree state remains authoritative for repository changes.

## Verification policy
- Documentation-only planning: inspect generated Markdown, links/paths, feature coverage, and Git diff; do not run runtime test suites.
- Local module behavior: focused smoke + `npm run build`.
- Shared MCP/tool registration/config: focused smoke + `npm run build` + `npm run smoke`.
- Process/concurrency/output budgets: add `npm run stress`.
- Windows smoke tests that spawn child processes and then remove temporary trees must use bounded `fs.rm` retries for transient `EBUSY`/`EPERM`/`ENOTEMPTY` cleanup races after real teardown completion; prefer condition-based teardown evidence over arbitrary sleeps.
- Windows user-state stores that atomically replace an existing file must tolerate short-lived `EPERM`/`EACCES`/`EBUSY` rename locks with bounded retry/backoff and retain temp-file cleanup on terminal failure; when practical, cover the contract with an exclusive-lock regression rather than timing-only repetition.
- Structured detached workers that depend on parent-side PID/start-identity attestation must keep the nonce/start-key-gated pre-claim window longer than the parent's bounded identity-probe budget; before owner attestation, temporary identity unavailability is tolerated only within the bounded startup grace. After a worker has proved ownership with the launch nonce and parent-attested start key, read-only reconciliation may preserve `running` while the PID is alive and a fresh OS identity probe is temporarily unavailable; dead PIDs or concrete non-null start-key mismatches still interrupt immediately, and any cancellation or signal must still re-read and match the current OS start identity plus PID + nonce + start key. Do not weaken signaling or PID-reuse checks to solve startup latency.
- HTTP/MCP/admin/tunnel durability or continuity tests that persist or compare workspace-owned state must carry the server `workspace_id` when applicable and persist/compare server or `realpath`-canonical workspace roots rather than input/temp aliases; session-local workspace selection and Windows 8.3 path aliases are not durable identity.
- Hosted Windows smoke paths that launch structured workers or MCP clients must emit phase labels and use bounded per-phase timeouts below the workflow-level timeout, so a hosted-only stall fails with the exact phase instead of exhausting the entire CI job.
- Generic MCP smoke clients must identify the timed-out tool in failures and keep ordinary tool calls at the 15-second budget; the composite `codexpro_self_test` may use a dedicated 60-second budget because it performs inventory/global-skill discovery plus Git, Bash/toolchain, and Pro-context diagnostics. Do not widen all tool-call timeouts to accommodate it.
- OpenAI tunnel-client response forwarding must outlive CodexPro's maximum bounded synchronous call deadline by a small explicit transport margin; do not inherit a shorter upstream default that can terminate a still-valid CodexPro call. Post-startup tunnel supervision may replace only a persistently unhealthy/exited tunnel-client child after consecutive readiness failures with bounded backoff. Keep the local MCP server, runtime generation, workspace selection, auth boundary, and tunnel lease stable, and publish `transportState=unavailable` during recovery then `ready` only after `/readyz` succeeds.
- Local handoff execution treats remote publication and interruption as separate safety boundaries: standard Git/GitHub remote mutations stay blocked unless `--allow-remote-mutations` is explicitly authorized, inherited GitHub credentials are removed from the guarded child environment, interruption records `interrupting` until child teardown, stale in-flight receipts become `orphaned` only when recorded processes are gone, and interrupted/orphaned material operations require reconciliation before retry.
- Dependency/release work: add `npm audit --audit-level=high` and release packaging checks.
- Plan 45 dependency inspection must preserve the generic `node_modules` block and verify its dedicated package-root resolver cannot escape the workspace or execute package code.
- Plan 46 local-service observation must verify package-default-off gating, per-OS-user opt-in/future-profile inheritance with explicit workspace opt-out, loopback-only HTTP, GET/HEAD-only methods, no redirect following, no credentials/proxy/browser behavior, bounded bodies/timeouts, and redaction. Keep OS-user preferences outside packages and global default configuration.
- For single user-authorized CodexPro implementation or defect-fix work, after successful verification automatically update relevant docs/instructions, commit the intended change, integrate into `main`, push `origin/main`, and reinstall the global `codexpro-full` package when that install can be performed without violating the runtime-lifecycle rule below. For an explicitly authorized multi-plan batch, create verified milestone commits during the batch but perform integration, push, and global reinstall only once after the final cumulative gate. Releases/publication/deployment, force operations, and unrelated external mutations still require separate authorization; directly verify every external action actually performed.

## Full release workflow
An explicit **complete everything fully** instruction for a verified release-ready feature batch includes the complete scoped release workflow below, not merely source integration or global installation. Keep all release gates and final external verification; a running-runtime stop still requires reason-specific approval and npm publication still requires verified existing authentication.
When the operator explicitly authorizes release/publication, treat the release as one verified transaction rather than stopping at a source commit:
1. Recover `main`, origin/upstream/tag/release state, current runtime ownership, and release instructions; confirm unrelated work is clean or preserved.
2. Choose the next SemVer version from the verified compatibility/risk of the accumulated user-visible changes. Update package/lock metadata, move `CHANGELOG.md` Unreleased entries into a dated release section, and synchronize README/FAQ/feature/security/getting-started/Pages/install commands and release checklists.
3. Run from the canonical repository root: `npm ci`, `npm run release:check`, `git diff --check`, public-doc/link checks, staged-secret/path checks, and final diff review. Do not tag a dirty or partially verified tree.
4. Commit and push the release candidate to `main`; require fresh hosted Windows/Node 24, Ubuntu/Node 20, Release Integrity, and Pages checks for that exact commit before tagging.
5. Create/push the matching `v<version>` tag only at that verified commit. Verify the tag-triggered Release workflow, GitHub Release title/tag/target, tarball and SHA-256 sidecar, and live Pages/install instructions. Perform a disposable install from the public GitHub Release URL and verify `codexpro --version`.
6. If runtime stop was explicitly authorized, stop only the owned CodexPro process tree, install the exact released artifact into the intended global Node environment, and verify critical source/install hashes plus protected profile/hook settings. Leave CodexPro stopped. The operator must start it manually; only after a later user-started runtime exists may an agent verify live health/version/tunnel arguments. Never touch unrelated tunnel clients.
7. npm-registry publication is independent of the canonical GitHub Release. Publish there only when npm authentication/trusted publishing is already configured, then independently verify the public package/version/integrity. Missing registry authentication is an external blocker, not permission to solicit credentials in chat or to claim npm publication.
8. Record durable release evidence in project memory after external state is verified. Report exact release/tag/asset/checksum/CI/Pages/runtime evidence and any intentionally unavailable publication channel.

## Long-running tool design rule
- Tool-time awareness (verified Plans 22–28) is baseline behavior. Normal mode is bounded at 20 minutes (`1,200,000` ms), finite range 5–60 minutes; explicit Unlimited/observe is temporary discovery mode and retains elapsed diagnostics/conservative routing without a cooperative cutoff. The configured value is per MCP tool call and restarts on each invocation; it is not a cumulative timer for an entire ChatGPT response/tool-access window. Routing derives centrally from finite reference `D`: sync-preferred is `min(5 minutes, 25% of D)` and async-preferred begins at `75% of D`; low-variance work between may remain synchronous.
- New or modified potentially-long tools must declare their execution class: synchronous, existing workspace process (`proc_*`), structured durable job (`job_*`), Durable Goal (`goal_*`), or resumable in-process batch (`batch_*`). When explicit duration/risk metadata exists, use the shared deterministic execution-guidance thresholds and surface an additive `execution_hint`; never infer duration from prompt text or silently start a more privileged primitive.
- Never reduce requested scope, acceptance criteria, review depth, required verification, or safety checks to fit one call. If correct work will not comfortably fit, persist truthful progress and continue through the appropriate resumable primitive.
- Composite synchronous operations must share one remaining effective deadline budget across phases; they may not reset the configured budget for each child operation.
- Status/polling calls should return promptly and use condition-based progress. Repeated polling with no state change is not material progress.
- For first-time host-window discovery, guide the user to a disposable new chat, temporarily select Unlimited/observe, run only the mutation-free `tool_time_probe`, note the ChatGPT-side closure time, then restore a bounded value with safety margin. Never measure by leaving real project mutations open-ended.

## Runtime lifecycle rule
- Detect whether CodexPro is already running before any step that could require replacing the global installation, changing its tunnel/runtime state, or terminating processes.
- If CodexPro is running, **do not stop it without explicit user approval for that specific stop**. Explain why stopping is required before requesting approval.
- Agents must **never start or restart CodexPro**. This prohibition applies even after an approved stop, successful reinstall, verification, commit, or push.
- If stop approval is granted, stop only the CodexPro-owned process tree necessary for the authorized operation, leave CodexPro stopped afterward, and do not terminate unrelated Node processes, tunnels, or other services.
- If an authorized global reinstall cannot proceed while CodexPro is running and stop approval is absent, leave the runtime untouched, skip/defer the reinstall, and report the reinstall as pending. Source integration/push may proceed when otherwise authorized and safe.

## Stop conditions
Stop and report instead of forcing progress when the exact workspace is uncertain, protected/unrelated changes would be overwritten, a security boundary cannot be preserved, required external authorization is absent, or evidence contradicts the plan's assumptions.
