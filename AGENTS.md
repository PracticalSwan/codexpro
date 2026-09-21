# CodexPro Agent Instructions

Scope: this repository and all descendants.

## Start here
1. Read `docs/agentic/PROJECT_MEMORY.md` for durable current-state facts.
2. Read `docs/agentic/DEVELOPMENT_WORKFLOW.md` before planning or implementation.
3. Use `docs/agentic/PLAN_INDEX.md` as the roadmap/status source of truth. For implementation, read the selected plan and its linked spec in full. Plans 38–44 are the current planned implementation sequence.
4. Recover Git status/branch/remotes/upstream, touched paths/tests, relevant external state, and whether a CodexPro runtime is already running before mutation.

## Development rules
- Keep CodexPro a local MCP bridge for explicitly allowed workspaces. Preserve PathGuard, authentication, redaction, policy, project-trust, and capability gates.
- Prefer deep modules with small interfaces. Keep `src/server.ts` focused on registration/orchestration and reuse existing architecture/dependencies before adding tools, stores, state machines, or packages.
- Preserve unrelated dirty/staged/untracked work, profiles, secrets, tunnels, worktrees, and user-owned runtime state.
- Planning work may update planning/documentation only; plans are not evidence that runtime behavior exists.
- **Codex CLI is prohibited.** Do not invoke or delegate to any Codex CLI subcommand for implementation, debugging, tests, review, or mutation.
- Implementation begins only from user-authorized scope. For a single authorized implementation/defect, successful verification is standing authorization to update relevant docs, commit intended changes, push `origin/main`, and reinstall `codexpro-full` only when the runtime-lifecycle rule permits it. Multi-plan work keeps each plan independently reviewable and verified.
- Do not create new top-level MCP tools when an existing tool can be deepened safely. Do not add another workflow scheduler, model router, context database, generic browser automation layer, debugger platform, or autonomous repair loop without a new explicitly approved architecture decision.
- Tool-time awareness is baseline: normal bounded mode is 20 minutes (`1,200,000` ms), configurable 5–60 minutes; Unlimited/observe is temporary harmless host-window discovery only. Never reduce scope, review, verification, or safety to fit a call. Use the existing `proc_*`, `job_*`, `batch_*`, or Goal role appropriate to the work.
- Optional Docker support is frozen at the verified Windows Stage A scope for Bash/workspace processes. Goals remain host-only; do not reopen Linux/Goal Docker expansion without a concrete approved need.
- MCP Tasks/extra interactive-approval work beyond the delivered compatibility seam is retired from the active roadmap. Do not resurrect it from historical files/commits without a new requirement and current client-capability evidence.
- Do not add browser automation, messaging-control channels, or remote-desktop behavior as a CodexPro feature without a new explicitly approved architecture decision.
- Never persist or expose secrets, private browser state, personal identifiers, raw prompts/transcripts, or hidden reasoning in diagnostics, packages, logs, docs, or commits.

## Runtime lifecycle
- Detect whether CodexPro is running before reinstall, tunnel/runtime replacement, or process termination.
- If running, **do not stop it without explicit user approval for that specific stop**. Explain why a stop is required.
- Agents must **never start or restart CodexPro**, including after an approved stop, reinstall, commit, or release.
- If stopping is approved, terminate only the exact CodexPro-owned process tree required, verify ownership, leave it stopped, and do not touch unrelated Node processes/tunnels/services.
- If reinstall is blocked by a running runtime and stop approval is absent, defer reinstall while completing safe source/commit/push work.

## Git, maintenance, and release
- Never force-push, rewrite history, or publish a release/deployment without explicit authorization. Stage only intended paths and verify the final remote state after push.
- When the operator says **continue full maintenance**, recover local/origin/upstream/CI state, investigate evidence-backed defects, apply the smallest coherent fixes, update docs, verify proportionally, commit intended changes to `main`, push `origin/main`, and verify resulting CI. Runtime/release boundaries still apply.
- A **full release/publication** request authorizes SemVer selection, package/lock/changelog/public-doc synchronization, full release gate, main push, matching tag/GitHub Release/assets/checksum/CI/Pages verification, and exact released-artifact install when runtime rules allow. npm registry publication is separate and only when existing auth/trusted publishing can be independently verified.

## Verification
- Follow the selected plan. Start with the narrowest relevant regression/check, then `npm run build` for runtime/source changes.
- Run `npm run smoke` when shared MCP/runtime/CLI/admin behavior changes; run `npm run stress` only for concurrency/process/output-limit/release-risk changes.
- Dependency/release work adds `npm audit --audit-level=high` and release packaging checks.
- Documentation-only planning/cleanup requires Markdown/link/reference checks, factual/state reconciliation, `git diff --check`, and final diff review; do not run expensive runtime suites merely for documentation.
- Windows process/store changes must preserve existing PID/start-identity, bounded retry/backoff, canonical workspace identity, and exact-owner signaling semantics documented in `DEVELOPMENT_WORKFLOW.md`.
- Report exact verified scope, skipped checks, blockers, and residual risk. Never claim a complete test set passed unless it actually ran.

## Durable context
- Update `docs/agentic/PROJECT_MEMORY.md` only with durable verified facts, current blockers, or completed milestones; it is not a chronological diary.
- Record stable architecture choices in `docs/agentic/DECISIONS.md`.
- Keep current status/mapping in `docs/agentic/PLAN_INDEX.md`; keep implementation details in the selected spec/plan.
- Treat historical Git/planning material as history, not current instruction, when it conflicts with these files.
