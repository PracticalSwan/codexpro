# Plan 43 — Verification Failure Context Pack Implementation Plan

> **For agentic workers:** collect evidence only. ChatGPT diagnoses and repairs; CodexPro must not become an autonomous repair agent.

**Goal:** Make failed verification immediately actionable by attaching bounded related source/test/reproduction evidence to existing results.

**Architecture:** Add one shared failure-context composer above existing parser/change-impact/context primitives and call it from both synchronous and structured-job verification completion.

**Tech Stack:** TypeScript/Node, existing verification/check/analysis/context modules only.

**Spec:** `docs/superpowers/specs/2026-09-22-verification-failure-context-design.md`

## Global constraints

- Additive result contract only.
- No automatic edits/reruns/model calls.
- No new job producer/scheduler.
- Every path normalized/guarded before output.
- Keep durable records bounded; do not persist unnecessary source bodies.
- A context-enrichment failure must not hide the real check failure.

---

## Task 1: Inventory existing structured failure evidence

**Files:**
- Inspect/modify only as needed: `src/checksOps.ts`, verification/job result types, repair metadata modules
- Test: extend existing verification smoke

- [ ] Document exact current failure-location/result shapes in code comments/types rather than duplicating parsers.
- [ ] Add regression fixtures for compiler/test failures with path/line information.
## Task 2: Create shared failure-context composer

**Files:**
- Create: `src/verificationFailureContext.ts`
- Reuse: change-impact, context ranking, guarded reads, failure parser outputs
- Test: create `scripts/verification-failure-context-smoke.mjs`

- [ ] Normalize primary failure path/line/column/message.
- [ ] Attach bounded changed paths and related tests from existing evidence.
- [ ] Select bounded context files/reasons without claiming root cause.
- [ ] Add optional small source line windows only under current read budgets.
- [ ] Convert all enrichment failures to bounded warnings.

## Task 3: Add trusted focused reproduction guidance

**Files:**
- Modify: `src/verificationFailureContext.ts`
- Reuse: trusted check definitions/parsers

- [ ] Derive argv/display only when runner/check metadata supports an exact safe target.
- [ ] Never build a shell string from arbitrary failure text.
- [ ] Fall back to the original trusted check label/invocation or omit focused reproduction.

## Task 4: Integrate synchronous verification

**Files:**
- Modify: verification result assembly in current checks/verification modules
- Test: focused + existing verification smoke

- [ ] Add `failure_context` only for failed checks/results.
- [ ] Preserve existing repair metadata keys and PASS/FAIL/incomplete semantics.
- [ ] Cap number of enriched failures.
## Task 5: Integrate async structured verification jobs

**Files:**
- Modify: existing verification job producer/runner/result projection only
- Test: async verification/job smoke

- [ ] Reuse the same composer after completed check evidence is available.
- [ ] Prove sync/async parity for identical fixture failures.
- [ ] Preserve resume semantics: completed checks are not rerun just to regenerate context.
- [ ] Do not persist large source bodies in job state.

## Task 6: Documentation and gate

**Files:**
- Modify: `FEATURES.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Document evidence-only semantics and non-autonomous boundary.
- [ ] Run focused failure-context smoke.
- [ ] Run existing verification/job regressions.
- [ ] Run `npm run build` and `npm run smoke`.
- [ ] Run `git diff --check` and final diff review.
