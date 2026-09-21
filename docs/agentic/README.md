# CodexPro Agentic Development Workspace

This directory is the durable navigation layer for CodexPro Full development.

## Read order
1. Repository `AGENTS.md` — operating, security, release, and runtime-lifecycle rules.
2. `PROJECT_MEMORY.md` — verified durable state and current external baselines.
3. `DEVELOPMENT_WORKFLOW.md` — implementation/review/verification contract.
4. `PLAN_INDEX.md` — authoritative roadmap/status router.
5. The selected subsystem's linked design + implementation plan.
6. `DECISIONS.md` and `ARCHITECTURE_ROADMAP.md` when architecture trade-offs matter.

## Sources of truth
- Runtime behavior: source + tests + current execution evidence.
- Repository state: current Git/local/origin/upstream evidence.
- Architecture choices: `DECISIONS.md`.
- Durable current state: `PROJECT_MEMORY.md`.
- Future work/status: `PLAN_INDEX.md` plus linked specs/plans.
- A plan is never evidence that its feature exists.

## Current roadmap
The expansion-heavy 2026-09-05/08 roadmap is complete or retired. Current planned implementation is the consolidation-first sequence Plans 38–44: runtime lifecycle/provenance, operator UX/diagnostics, context-provider integration, read-only notebook inspection, workspace briefing, verification failure context, and read-only table inspection.

Refresh moving external state before implementation. Do not resurrect retired protocol/Tasks/Docker-expansion work from Git history unless a new concrete requirement and current evidence justify it.
