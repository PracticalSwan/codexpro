# Structured Verification Repair Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Planned only on 2026-09-06. This plan is **not execution-authorized** by the planning request that created it.

**Goal:** Enrich `verify_changes` with bounded deterministic repair evidence that helps the host model choose the next focused action without adding an autonomous repair loop.

**Architecture:** Add one pure `verificationEvidence.ts` module that synthesizes existing `ChangeAnalysis` and `CheckExecutionResult[]`. Keep check discovery/execution in `checksOps.ts`; keep MCP registration/result shaping in `server.ts`. The new metadata is additive and contains no side effects or new persistent state.

**Tech Stack:** Node.js 20+, TypeScript, existing analysis/check/test-result modules, existing MCP smoke harness.

**Spec:** `docs/superpowers/specs/2026-09-06-verification-repair-metadata-design.md`

## Global Constraints
- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, provider routing, quota bypass, hosted source-code storage, or unrestricted remote execution.
- Preserve current `PathGuard`, redaction, tool/write/Bash gates, and workspace-policy authority.
- The module is evidence synthesis only: no commands, writes, model calls, or automatic repair iterations.
- Keep output bounded to the exact limits in the spec.
- Preserve existing `verify_changes` fields and behavior; the repair contract is additive.
- Windows remains a first-class target and paths exposed to callers remain workspace-relative.
- Do not commit, push, publish, deploy, install packages, or mutate external services unless later explicitly authorized.

**Plan dependencies:** 05, 07, 16.

---
## File Structure
- Create: `src/verificationEvidence.ts` — pure failure classification/path ranking/repair-contract synthesis.
- Create: `scripts/verification-repair-smoke.mjs` — focused contract coverage.
- Modify: `src/checksOps.ts` — attach the repair contract to `VerificationPlanResult`.
- Modify: `src/testResultOps.ts` only when a focused parser regression requires it.
- Modify: `src/server.ts` — expose additive structured content; no new tool required.
- Modify: `scripts/checks-smoke.mjs` and `scripts/smoke.mjs` — integration coverage/suite registration.
- Modify after verification: `FEATURES.md`, `CHANGELOG.md`, and durable roadmap status docs.

## Planned Interfaces
```ts
export type VerificationFailureCategory =
  | "test" | "typecheck" | "lint" | "build"
  | "runtime" | "timeout" | "toolchain" | "unknown";

export interface VerificationFailureEvidence {
  checkId: string;
  category: VerificationFailureCategory;
  summary: string;
  likelyPaths: string[];
  relatedTests: string[];
  exitCode: number | null;
  truncated: boolean;
}

export interface VerificationRepairContract {
  status: "passed" | "failed" | "not_run";
  retryRecommended: boolean;
  maxSuggestedRepairAttempts: 2;
  failures: VerificationFailureEvidence[];
  nextActions: string[];
}
```

```ts
export function buildVerificationRepairContract(
  analysis: ChangeAnalysis,
  results: CheckExecutionResult[]
): VerificationRepairContract;
```

### Task 1: Define RED contracts against current verification behavior

**Files:**
- Create: `scripts/verification-repair-smoke.mjs`
- Read: `src/checksOps.ts`, `src/testResultOps.ts`, `src/analysis/impact.ts`

**Produces:** focused failing assertions for the missing additive repair contract.

- [ ] **Step 1: Recover execution-time state and re-read the spec plus existing verification modules.**
- [ ] **Step 2: Build OS-temp fixtures for five cases: passing test; failing test with file/line; failing typecheck; missing/unavailable toolchain; `verifyChanges(..., run:false)`.**
- [ ] **Step 3: Assert the exact planned shape and limits.**

```js
assert.equal(result.repair.status, "failed");
assert.equal(result.repair.maxSuggestedRepairAttempts, 2);
assert.ok(result.repair.failures.length <= 8);
assert.ok(result.repair.failures.every((f) => f.likelyPaths.length <= 16));
assert.ok(result.repair.nextActions.length <= 8);
```

- [ ] **Step 4: Add a safety case where a parser sees an absolute or escaping path and assert it never appears in `likelyPaths`.**
- [ ] **Step 5: Run `npm run build && node scripts/verification-repair-smoke.mjs`; expected RED is absence of the new `repair` contract while fixture setup/current verification still works.**
- [ ] **Step 6: Commit only if a later execution request authorizes commits. Suggested message: `test: define verification repair metadata contracts`.**
### Task 2: Implement the pure evidence-synthesis module

**Files:**
- Create: `src/verificationEvidence.ts`
- Test: `scripts/verification-repair-smoke.mjs`

**Consumes:** `ChangeAnalysis`, `CheckExecutionResult[]`.
**Produces:** `buildVerificationRepairContract(...)` and the public types above.

- [ ] **Step 1: Implement ordered deterministic classification.**

```ts
function categoryFor(result: CheckExecutionResult): VerificationFailureCategory {
  const command = result.check.command.toLowerCase();
  if (result.terminationReason === "timeout") return "timeout";
  if (/typecheck|\btsc\b|cargo check/.test(command)) return "typecheck";
  if (/\blint\b|eslint|ruff|clippy/.test(command)) return "lint";
  if (/\bbuild\b|compile/.test(command)) return "build";
  if (result.check.framework !== "generic" || /\btest\b|pytest/.test(command)) return "test";
  return result.exitCode === null ? "toolchain" : "runtime";
}
```

- [ ] **Step 2: Implement path collection from structured failure paths first, then `analysis.changedPaths`, `dependentFiles`, and `relatedTests`; normalize/dedupe and cap before returning.**
- [ ] **Step 3: Implement bounded summaries from check ID/category/exit state and existing redacted structured failure messages; never include full `structured.evidence`.**
- [ ] **Step 4: Implement deterministic `nextActions` and `retryRecommended`; toolchain/setup failures return a setup action and `false`, code-level failures return at most one focused repair/rerun sequence and `true`.**
- [ ] **Step 5: Run the focused smoke; expected GREEN for pure-module cases.**
- [ ] **Step 6: Commit if authorized. Suggested message: `feat: add structured verification repair evidence`.**
### Task 3: Integrate with `verifyChanges` without changing execution semantics

**Files:**
- Modify: `src/checksOps.ts`
- Modify: `src/server.ts`
- Test: `scripts/verification-repair-smoke.mjs`
- Test: `scripts/checks-smoke.mjs`

**Consumes:** `buildVerificationRepairContract(...)`.
**Produces:** additive `repair: VerificationRepairContract` on `VerificationPlanResult` and the existing MCP tool result.

- [ ] **Step 1: Extend `VerificationPlanResult` with `repair` and build it after existing analysis/check execution completes.**
- [ ] **Step 2: For `run=false`, build `status="not_run"`; for no discovered/selected checks, keep existing `ok` semantics while clearly marking the repair evidence as not executed.**
- [ ] **Step 3: Do not add a new MCP tool. Update the existing `verify_changes` handler to pass through the additive structured field and keep existing text/result fields stable.**
- [ ] **Step 4: Add integration assertions that direct `verify_changes` and supertool dispatch return the same repair contract.**
- [ ] **Step 5: Run `npm run build && node scripts/verification-repair-smoke.mjs && node scripts/checks-smoke.mjs`; expected all focused checks PASS.**

### Task 4: Close parser, security, and boundedness edge cases

**Files:**
- Modify only if proven necessary: `src/testResultOps.ts`
- Modify: `scripts/verification-repair-smoke.mjs`
- Modify: `scripts/checks-smoke.mjs`

- [ ] **Step 1: Test Windows drive-letter paths, Unix absolute paths, `../` escapes, duplicate paths, unknown frameworks, null exit codes, timeout termination, and truncated evidence.**
- [ ] **Step 2: If existing `StructuredTestFailure.file` parsing cannot represent a supported test format required by the RED cases, make the smallest parser change and add a parser-specific regression; otherwise leave `testResultOps.ts` untouched.**
- [ ] **Step 3: Verify every returned path originated from normalized analysis/structured evidence and every summary is redacted/bounded.**
- [ ] **Step 4: Verify a synthesis exception preserves the original failing verification state and returns only a bounded warning.**
- [ ] **Step 5: Run focused tests, `npm run build`, and then `npm run smoke` because the shared MCP output contract changed.**
### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after implementation verification: `FEATURES.md`, `CHANGELOG.md`, `docs/agentic/PLAN_INDEX.md`, `docs/agentic/PROJECT_MEMORY.md`

- [ ] **Step 1: Document that CodexPro returns repair evidence but never performs an autonomous repair loop or model call.**
- [ ] **Step 2: Document the meanings of `retryRecommended` and `maxSuggestedRepairAttempts=2` as host guidance, not a server-side retry counter.**
- [ ] **Step 3: Run `git diff --check`; inspect `git diff --stat` and the complete relevant diff.**
- [ ] **Step 4: Run `npm run build` and `npm run smoke`; add `npm run stress` only if implementation unexpectedly changes concurrency/process/resource behavior.**
- [ ] **Step 5: Perform two reviews: spec compliance first, then defect-first code quality/security/portability. Fix findings and rerun affected checks.**
- [ ] **Step 6: Update durable plan/memory status only from verification evidence. Commit/push/release only if separately authorized.**

## Non-goals for this plan
- automatic code edits
- automatic rerun loops
- a model/provider integration
- persistent repair sessions
- replacing existing verification selection
- generalized log intelligence

## Self-review checklist before implementation handoff
- [ ] Every V-001 through V-010 requirement maps to a task above.
- [ ] The new module has one small interface and no side effects.
- [ ] Existing `verify_changes` callers remain valid.
- [ ] No unbounded stdout/stderr or absolute path can enter the repair contract.
- [ ] Suggested retries remain advisory and capped at two in the contract.
