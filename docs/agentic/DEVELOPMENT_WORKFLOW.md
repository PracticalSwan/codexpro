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
Implementation begins only when the user authorizes execution of a selected plan. Read that plan and its referenced spec in full; do not execute multiple independent subsystem plans as one undifferentiated change.

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
- For user-authorized CodexPro implementation or defect-fix work, after successful verification automatically update relevant docs/instructions, commit the intended change, integrate into `main`, push `origin/main`, and reinstall the global `codexpro-full` package. This repository instruction supplies the routine post-verification authorization; still require separate authorization for releases/publication/deployment, force operations, or unrelated external mutations, and directly verify every performed integration/install/push.

## Stop conditions
Stop and report instead of forcing progress when the exact workspace is uncertain, protected/unrelated changes would be overwritten, a security boundary cannot be preserved, required external authorization is absent, or evidence contradicts the plan's assumptions.
