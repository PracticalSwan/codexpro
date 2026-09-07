# Composite Verification Deadline Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure `run_checks` and `verify_changes` share one effective configured synchronous call budget across all selected checks and return resumable partial state instead of accumulating per-check timeouts past the user's selected transport window.

**Architecture:** Propagate the current `DeadlineBudget` into `checksOps.ts`. Before each check, compute an effective child timeout from the remaining call budget; when the deadline prevents completing the current/next check, terminate only that owned child process and return explicit incomplete/remaining-check metadata. Do not mark unexecuted checks as passed or silently discard them.

**Tech Stack:** TypeScript, existing `runBash`, structured check results, MCP tool schemas, fake-budget integration smokes.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- One MCP invocation gets one `config.syncCallDeadlineMs` budget (20 minutes by default), not a fresh full budget per selected check.
- A deadline yield is not a verification failure and is not verification success.
- Required checks remain pending until actually completed.
- Check subprocesses must be terminated through existing owned-process termination semantics before the tool returns.
- Existing callers that ignore new additive fields continue to receive bounded results.

---

### Task 1: Extend check result contracts for incomplete work

**Files:**
- Modify: `src/checksOps.ts`
- Modify: `scripts/checks-smoke.mjs`

**Interfaces:**
- Produces additive `complete`, `deadlineYielded`, and `remainingCheckIds` fields on `CheckRunResult`.
- Extends `VerificationPlanResult` with the same completion information while preserving existing `ok` semantics.

- [ ] **Step 1: Add failing contract tests**

Create a short synthetic budget and two discovered checks. Assert the first completed check remains in `results`, the second remains in `remainingCheckIds`, `complete=false`, and `deadlineYielded=true`. For `verifyChanges`, assert `ok=null` while incomplete so callers cannot mistake partial evidence for a verified pass.

Run: `node scripts/checks-smoke.mjs`
Expected: FAIL because completion/deadline fields are absent.

- [ ] **Step 2: Add explicit completion fields**

Use result shapes equivalent to:

```ts
interface CheckRunResult {
  ok: boolean;
  complete: boolean;
  deadlineYielded: boolean;
  remainingCheckIds: string[];
  selectedChecks: TrustedCheck[];
  results: CheckExecutionResult[];
}
```

`ok` is true only when `complete=true` and every executed required check passed. `VerificationPlanResult.ok` becomes `null` whenever `complete=false`.

### Task 2: Propagate the shared deadline through sequential checks

**Files:**
- Modify: `src/checksOps.ts`
- Modify: `src/bashOps.ts` only if a small additive termination discriminator is required
- Modify: `scripts/checks-smoke.mjs`

**Interfaces:**
- Consumes: `currentSyncCallDeadline()` / `DeadlineBudget` from Plan 22.
- Produces: a per-check effective timeout capped by the remaining shared call budget.

- [ ] **Step 1: Add a fast synthetic deadline-yield test**

Use an injected/fake short budget. Prove that a check whose requested timeout exceeds the remaining call budget is deadline-limited, its owned subprocess is stopped, and its ID plus later IDs remain pending.

- [ ] **Step 2: Implement remaining-budget calculation**

Before each check, read the current deadline and calculate:

```ts
const effectiveTimeoutMs = deadline
  ? deadline.childTimeoutMs(requestedTimeoutMs ?? config.maxBashTimeoutMs, 1_000)
  : requestedTimeoutMs;
```

If there is not enough budget to safely start a phase, do not spawn it. If an already-running check reaches a deadline-limited timeout, classify the result as a deadline yield rather than a test assertion failure.

- [ ] **Step 3: Preserve full required-check intent**

`remainingCheckIds` must include the deadline-limited current check (if incomplete) followed by every selected check not yet started. Never shorten the list to make the result look complete.

- [ ] **Step 4: Verify module behavior**

Run: `node scripts/checks-smoke.mjs`
Run: `npm run build`
Expected: PASS.

### Task 3: Expose additive continuation metadata through MCP

**Files:**
- Modify: `src/server.ts` registrations for `run_checks` and `verify_changes`
- Modify: `scripts/verification-repair-smoke.mjs`
- Modify: `scripts/http-state-continuity-smoke.mjs` if cross-call continuation metadata is serialized there

**Interfaces:**
- Produces: structured MCP results that distinguish `complete`, `partial/deadline-yielded`, and true verification failure.

- [ ] **Step 1: Add MCP-level assertions**

Assert a partial verification response contains completed evidence plus the exact pending check IDs and does not say verification passed.

- [ ] **Step 2: Keep text summaries unambiguous**

Use wording such as `Verification incomplete: synchronous call budget reached; required checks remain pending.` Do not label this as PASS or FAIL.

- [ ] **Step 3: Verify shared registration behavior**

Run: `node scripts/verification-repair-smoke.mjs`
Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 4: Commit milestone**

```bash
git add src/checksOps.ts src/bashOps.ts src/server.ts scripts/checks-smoke.mjs scripts/verification-repair-smoke.mjs scripts/http-state-continuity-smoke.mjs
git commit -m "feat: bound composite verification calls"
```

## Acceptance Criteria

- At the default 20-minute setting, two 15-minute checks can no longer create one ~30-minute synchronous MCP call; at any configured value, child checks share that one effective call budget.
- Completed check evidence is retained; incomplete required checks remain explicitly pending.
- Deadline-limited subprocesses are stopped before return.
- Partial verification is represented as incomplete, never as a pass.
- All focused and shared MCP smokes pass using short synthetic budgets.
