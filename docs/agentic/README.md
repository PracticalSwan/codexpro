# CodexPro Agentic Development Workspace

This directory is the durable navigation layer for future CodexPro development.

## Read order
1. Repository `AGENTS.md` — always-loaded operating rules.
2. `PROJECT_MEMORY.md` — verified durable state and architecture facts.
3. `DEVELOPMENT_WORKFLOW.md` — lifecycle, review, verification, and stop gates.
4. `PLAN_INDEX.md` — choose one subsystem.
5. The linked design + implementation plan for that subsystem.
6. `CONTEXT_MAP.md` and `DECISIONS.md` when architecture/risk context is needed.

## Sources of truth
- Runtime behavior: source + tests + current execution evidence.
- Repository history/state: Git and current upstream/PR data.
- Architecture decisions: `DECISIONS.md`.
- Durable working context: `PROJECT_MEMORY.md`.
- Future work: subsystem specs/plans. A plan is not evidence that a feature exists.

## Planning baseline
The roadmap was generated on 2026-09-05 from local integration HEAD `01f0130`, upstream main `587f7fd`, current source layout, and the existing upstream issue/PR backlog. Refresh all moving state before implementation.
