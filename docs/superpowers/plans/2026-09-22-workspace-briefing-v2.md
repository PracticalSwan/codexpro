# Plan 42 — AI-Ready Workspace Briefing v2 Implementation Plan

> **For agentic workers:** deepen `workspace_snapshot`; do not create a parallel context/task/workspace-summary subsystem.

**Goal:** Make one read-only snapshot call sufficient for first-turn project orientation by aggregating existing authoritative evidence.

**Architecture:** Add a focused pure briefing composer that calls/reuses existing bounded read APIs, then project its result through the existing `workspace_snapshot` response.

**Tech Stack:** TypeScript/Node and existing CodexPro modules only.

**Spec:** `docs/superpowers/specs/2026-09-22-workspace-briefing-v2-design.md`

## Global constraints

- Read-only; no automatic remediation.
- No new MCP tool unless additive snapshot compatibility is impossible and explicitly re-approved.
- No new store/cache beyond existing analysis/cache infrastructure.
- Reuse existing Git/instruction/check/durable-work/capability helpers rather than reimplementing them.
- Keep output bounded and redacted.
- Do not make snapshot depend on optional providers or Plan 38/39 completion.

---

## Task 1: Define briefing types and pure composer

**Files:**
- Create: `src/workspaceBriefing.ts`
- Test: create `scripts/workspace-briefing-smoke.mjs`
- [ ] Define bounded structured types for Git, project, instructions, checks, active work, capabilities, warnings, and attention entries.
- [ ] Compose from existing read-only helpers/interfaces; add small adapter helpers only where existing APIs are too presentation-specific.
- [ ] Make every optional source independently fallible.
- [ ] Unit/smoke fixtures cover clean workspace, dirty files, detached HEAD, and no-checks state.

## Task 2: Add durable-work aggregation

**Files:**
- Modify: `src/workspaceBriefing.ts`
- Reuse: process/job/batch/Goal stores/managers
- Test: `scripts/workspace-briefing-smoke.mjs`

- [ ] Count active processes/jobs/batches/Goals without consuming output/log cursors.
- [ ] Surface interrupted/reconciliation-required states as deterministic attention codes.
- [ ] Do not scan OS-wide processes or unrelated workspaces.
- [ ] Verify no durable-state mutation occurs.

## Task 3: Add instructions/project/check evidence

**Files:**
- Modify: `src/workspaceBriefing.ts`
- Reuse: `instructionOps`, `analysis`, `checksOps`

- [ ] Return applicable instruction paths/scopes only, not full instruction bodies.
- [ ] Return bounded languages/project types/entrypoints/package manager from existing inventory.
- [ ] Return trusted check IDs/labels only.
- [ ] Preserve bounded behavior in large repositories.
## Task 4: Add capability summary and attention rules

**Files:**
- Modify: `src/workspaceBriefing.ts`
- Reuse: existing config/effective policy/diagnostics helpers
- Test: restricted-policy fixtures

- [ ] Derive major capability states from existing gates; never widen authority.
- [ ] Add stable attention codes for dirty work, detached HEAD, divergence, active/reconciliation work, unavailable configured providers, restrictive development gates, and missing trusted checks.
- [ ] Do not add subjective quality/risk scores.

## Task 5: Integrate with `workspace_snapshot`

**Files:**
- Modify: `src/server.ts`
- Test: existing MCP smoke + focused briefing smoke

- [ ] Add `briefing` as additive structured data.
- [ ] Add concise bounded text rendering if useful without changing existing headings/contracts relied on by smoke tests.
- [ ] Preserve connection-test/read-only behavior.
- [ ] Verify snapshot stays responsive when optional sources fail.

## Task 6: Documentation and gate

**Files:**
- Modify: `FEATURES.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Document the single-call orientation use case and deterministic attention semantics.
- [ ] Run focused briefing smoke.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Run `git diff --check` and final diff review.
