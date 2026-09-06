# Structured Verification Repair Metadata Design

**Date:** 2026-09-06
**Status:** Verified
**Priority:** P1
**Plan ID:** 20
**Depends on:** 05, 07, 16

## Goal
Make `verify_changes` return compact, machine-actionable repair evidence so the host model can decide what to inspect or fix next without CodexPro becoming a self-healing model loop.

## Feature covered
- **#51 — structured verification repair metadata**

## Research rationale
Aider-style lint/test feedback is useful because the harness turns failed checks into actionable evidence. CodexPro should adopt that evidence contract, not embed a model or autonomously retry edits.

## Current-state fit
- `discoverTrustedChecks()` selects commands from project manifests/scripts.
- `runChecks()` returns exit state plus `StructuredTestResult`.
- `verifyChanges()` already returns `ChangeAnalysis`, selected checks, and results.
- `StructuredTestFailure` already captures file/line/column/message when parsable.
- The missing piece is bounded synthesis that classifies failures and connects them to likely source/test paths.

## Architecture
Create a pure `verificationEvidence.ts` deep module behind one interface. It consumes existing `ChangeAnalysis` and `CheckExecutionResult[]`, returns bounded repair metadata, and performs no filesystem mutation, command execution, model invocation, or retry loop. `checksOps.ts` remains responsible for verification execution; `server.ts` only exposes the richer result.

## Proposed files
**Create**
- `src/verificationEvidence.ts`
- `scripts/verification-repair-smoke.mjs`
**Modify when implementation is authorized**
- `src/checksOps.ts`
- `src/testResultOps.ts` only if a focused RED case proves a parser change is necessary
- `src/server.ts`
- `scripts/checks-smoke.mjs`
- `scripts/smoke.mjs`
- `FEATURES.md`
- `CHANGELOG.md`

## Planned interfaces
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
  maxSuggestedRepairAttempts: 2;  failures: VerificationFailureEvidence[];
  nextActions: string[];
}

export function buildVerificationRepairContract(
  analysis: ChangeAnalysis,
  results: CheckExecutionResult[]
): VerificationRepairContract;
```

## Requirements
- V-001: Derive the contract only from already-collected verification/change-analysis evidence; do not execute commands, edit files, or call a model.
- V-002: Classify failures deterministically from trusted check command/framework/termination state, not arbitrary free-form model reasoning.
- V-003: `likelyPaths` may contain only normalized workspace-relative paths already present in structured failures, changed paths, dependents, or related tests.
- V-004: Bound output to at most 8 failure records, 16 likely paths per record, 16 related tests per record, and 8 next actions.
- V-005: Redact and bound messages; never duplicate full stdout/stderr into the repair contract.
- V-006: `retryRecommended=true` means a host-side repair attempt is plausibly useful. It is false for missing toolchain, explicit cancellation, and setup/infrastructure failures unless evidence identifies a code-level failure.
- V-007: `maxSuggestedRepairAttempts` is advisory host guidance only. CodexPro does not create an autonomous retry loop or hidden retry state.
- V-008: Passing verification returns `status="passed"`, no failures, `retryRecommended=false`, and no synthetic repair actions.
- V-009: `run=false` or no selected checks returns `status="not_run"` without inventing execution evidence.
- V-010: Existing `verify_changes` fields remain backward compatible; the contract is additive structured content.

## Deterministic classification
Use a small ordered table: timeout termination -> `timeout`; typecheck/tsc/cargo-check command -> `typecheck`; lint/eslint/ruff/clippy -> `lint`; build/compile -> `build`; recognized test framework or test command -> `test`; unavailable executable/toolchain evidence -> `toolchain`; non-zero generic execution -> `runtime`; otherwise `unknown`.
## Path ranking
1. Prefer `StructuredTestFailure.file` when it maps to an analyzed workspace-relative file.
2. Add directly changed paths connected to that failure by deterministic filename/path evidence.
3. Add existing `ChangeAnalysis.dependentFiles` and `relatedTests` connected to the changed paths.
4. Deduplicate while preserving evidence priority.
5. Do not trigger another repository search from this module.

## Next-action generation
Return only deterministic bounded suggestions, for example:
- inspect the first structured failure location before changing additional files;
- review changed source paths associated with the failing test;
- rerun the same selected checks after one focused repair;
- resolve a missing toolchain/setup issue before attempting a code repair.

Do not generate patches or speculative root-cause prose beyond available evidence.

## Security and privacy
- No new persistence, model calls, prompts, or chain-of-thought storage.
- No full command transcript duplication.
- No absolute path disclosure; use existing normalized analysis paths.
- Secret-looking messages remain under existing redaction rules.

## Error and failure model
- Ignore malformed structured failure paths rather than trusting them.
- Unsupported check/framework names fall back to `unknown`.
- Propagate `truncated=true` when source test evidence is truncated.
- A synthesis error must never convert a real failing check into a passing result; preserve original verification status and return a bounded synthesis warning.
## Verification strategy
- `node scripts/verification-repair-smoke.mjs`
- `node scripts/checks-smoke.mjs`
- `npm run build`
- `npm run smoke` because shared MCP `verify_changes` output changes
- `git diff --check`

## Alternatives considered
1. **Automatic edit/test retry loop.** Rejected because CodexPro is a harness, not a model host.
2. **Parse arbitrary logs with a new general parser.** Rejected; reuse bounded structured test results and deterministic check metadata.
3. **Persist retry counters.** Rejected for this plan; advisory repair limits are sufficient and avoid another state subsystem.

## Non-goals
- model invocation or provider routing
- autonomous edit/test loops
- persistent retry counters
- automatic application of suggested fixes
- replacing `StructuredTestResult`
- arbitrary unbounded log/stack-trace ingestion

## Completion criteria
The real `verify_changes` MCP surface returns additive bounded repair metadata for pass/fail/not-run cases; every path/message is safe and deterministic; no autonomous repair action occurs; existing verification consumers remain compatible; focused and full smoke tests pass on Windows and Unix CI targets.
