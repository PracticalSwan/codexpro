# Plan 43 — Verification Failure Context Pack Design

Created: 2026-09-22
Status: Planned
Priority: P0/P1

## Problem

`verify_changes` and asynchronous verification already identify failures and emit repair metadata, but the AI often needs follow-up calls to collect the changed file, related tests, nearby failure location, and a focused reproduction command. The evidence exists across current verification, change-impact, structured failure parsing, and context-ranking modules.

The useful improvement is a deterministic **failure context pack**, not an autonomous repair loop.

## Goals

- Add bounded context evidence to verification failures.
- Reuse parsed failure locations, changed paths, related tests, change impact, and context ranking.
- Provide exact focused reproduction guidance when it can be derived safely.
- Keep sync and durable async verification result contracts aligned.
- Never modify code or recursively retry repairs automatically.

## Non-goals

- No embedded LLM/model call.
- No autonomous edit/test/self-healing loop.
- No new scheduler/job type.
- No speculative root-cause assertion.
- No unbounded source/log capture.
## Proposed result

Add an optional field under each failed check or aggregate verification result:

```ts
interface VerificationFailureContext {
  failureId: string;
  checkId: string;
  primaryFailure?: { path?: string; line?: number; column?: number; message: string };
  changedPaths: string[];
  relatedTests: string[];
  contextLocations: Array<{ path: string; startLine?: number; endLine?: number; reasons: string[] }>;
  reproduce?: { argv?: string[]; display: string };
  warnings: string[];
}
```

Prefer argv-style internal representations. Text display is for the model/operator; do not introduce shell interpolation.

## Evidence derivation

1. Start from structured parser failure locations already produced by checks.
2. Normalize every path through current workspace-relative safeguards.
3. Intersect/relate with changed paths and change-impact analysis.
4. Use existing relationship/context ranking to choose a small set of likely relevant files/tests.
5. Create line windows only when a trusted failure location exists or a direct symbol/relationship can be resolved cheaply.
6. Derive a focused reproduction invocation only from the trusted check definition/parser; otherwise omit it.
## Truthfulness rules

- Call evidence `related`, `context`, or `likely_context`; never claim “root cause” unless a deterministic parser provides that fact.
- Preserve original check failure message separately from normalized context.
- If paths are outside the workspace, redact/omit rather than expose them.
- If a test runner cannot safely express a focused test target, return the original trusted check only.

## Budgeting

- Maximum failed checks enriched per verification result: small bounded number (recommended 5).
- Maximum context files per failure: recommended 6.
- Maximum line-window bytes per context item: use existing read/context limits.
- Do not persist source bodies in durable job records if current job design intentionally avoids them; store references/reasons and derive bounded text on read when appropriate.

## Compatibility

- Existing repair metadata remains valid.
- New `failure_context` is additive.
- Async verification jobs use the same normalizer/composer as synchronous verification.
- Failure-context generation errors never convert an otherwise truthful failed verification into an internal error.

## Acceptance criteria

- A compiler/test failure with a workspace-relative path yields primary failure location plus bounded nearby/related context.
- Changed paths and related tests are included when existing analysis proves the relationship.
- Focused reproduction is emitted only from trusted check metadata.
- Out-of-workspace and sensitive paths are omitted/redacted.
- Async and sync verification produce equivalent context from the same completed check evidence.
- No code mutation, automatic rerun, model call, new job type, or new dependency.

## Verification

- Focused verification/repair-context smoke with compiler, test, malformed-path, and async parity fixtures.
- `npm run build`.
- `npm run smoke`.
- `git diff --check`.
