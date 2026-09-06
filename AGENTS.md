# CodexPro Agent Instructions

Scope: this repository and all descendants.

## Start here
1. Read `docs/agentic/PROJECT_MEMORY.md` for durable current-state facts.
2. Read `docs/agentic/DEVELOPMENT_WORKFLOW.md` before planning or implementation.
3. For roadmap work, open `docs/agentic/PLAN_INDEX.md`, then read only the selected subsystem spec and plan.
4. Inspect current Git status, branch, upstream state, touched execution paths, and relevant tests before changing source.

## Development rules
- Keep CodexPro a local MCP bridge for explicitly allowed workspaces. Preserve its trust boundary and mode gates.
- Prefer deep modules with small interfaces. Keep `src/server.ts` focused on registration/orchestration; put subsystem logic in focused modules.
- Reuse existing dependencies and architecture. Add dependencies only when the selected plan explicitly justifies them.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, and user-owned state.
- Planning tasks may create/update planning documentation only; they do not change runtime source.
- Implementation starts only from an approved subsystem plan. Use an isolated worktree/feature branch when the execution request authorizes implementation.
- For user-authorized CodexPro implementation or defect-fix work, successful verification is standing authorization to update relevant docs/instructions, commit the intended change, integrate it into `main`, push `origin/main`, and reinstall the global `codexpro-full` package without asking again. Preserve unrelated dirty/untracked work, never force-push, never publish a release/deployment unless separately authorized, and never persist or expose secrets outside approved secret storage.

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
