# Tool Deadline Resilience Unified Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Plans 22–28 as one coherent deadline-resilience program while preserving each subsystem's tests, review boundary, and milestone commit.

**Architecture:** Establish default-on tool-time awareness first (bounded 20-minute normal mode, finite 5–60 minute range, explicit Unlimited/observe discovery mode), then make composite verification cooperative, add durable structured jobs and async verification, teach ChatGPT execution routing, add resumable batches, and finish with diagnostics plus the harmless host-window probe. Use one isolated cumulative worktree/branch if later authorized.

**Tech Stack:** Existing CodexPro TypeScript/MCP runtime, Node workers, Git worktrees, current smoke/stress harness.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- **Tool-time awareness is enabled by default. Normal mode is bounded at 1,200,000 ms (20 minutes), finite range 300,000–3,600,000 ms (5–60 minutes); explicit Unlimited/observe is temporary discovery only.**
- Deadline is transport-only; the user's goal, scope, acceptance criteria, reasoning quality, review, and required verification remain unchanged.
- If correct work cannot fit one call, preserve state and continue; never rush or falsely claim completion.
- No generic arbitrary-command `job_start`; keep long shell ownership in `proc_*` and multi-stage engineering in `goal_*`.
- No Codex CLI usage for implementation/testing/review.
- Preserve unrelated worktrees, runtime/tunnels, staged/untracked work, credentials, and release state.
- A running CodexPro instance cannot be stopped without explicit stop approval and must never be automatically restarted.

## Dependency Order

`22 → 23 → 24 → 25 → 26 → 27 → 28`

Plan 23 and Plan 24 are architecturally independent after Plan 22, but the sequence above reduces integration ambiguity. Plan 25 requires Plan 24. Plan 26 should describe only capabilities already implemented by 22–25. Plan 27 uses the deadline context from 22 but not the job core. Plan 28 integrates evidence from all earlier plans.

## Milestone 22 — Configurable deadline, settings surfaces, and quality invariant

- [x] Implement `src/deadline.ts` with `bounded | observe` mode, 20-minute finite default/reference, 5–60 minute bounded validation, proportional reserve, elapsed awareness, and fake-clock tests.
- [x] Add deadline mode + milliseconds to runtime/profile status and expose `--sync-call-deadline-minutes <5-60|unlimited>` through launcher/settings plus the authenticated website profile editor.
- [x] Wrap MCP dispatch in cooperative deadline context using the effective runtime value.
- [x] Verify focused deadline smoke, MCP compatibility smoke, and build.
- [x] Review for unsafe generic cancellation or any path that could return while an unmanaged mutation continues.
- [x] Make the Plan 22 milestone commit.

## Milestone 23 — Composite verification budgeting

- [x] Give `run_checks` / `verify_changes` one shared remaining budget.
- [x] Add explicit incomplete/deadline-yielded/remaining-check metadata.
- [x] Prove a synthetic multi-check call cannot accumulate independent timeouts past the effective configured deadline, including default and shorter custom-budget cases.
- [x] Verify focused checks/repair smokes, full smoke, and milestone commit.

## Milestone 24 — Durable structured jobs

- [x] Add bounded persisted `job_*` records, progress/output cursors, worker ownership, recovery, cancel/resume.
- [x] Keep public job creation restricted to registered structured producers.
- [x] Prove polling calls are short and PID-reuse protections work.
- [x] Verify focused jobs/continuity smokes plus stress, then milestone commit.

## Milestone 25 — Async verification

- [x] Register the verification job producer and `start_checks` / `start_verification`.
- [x] Persist each completed check before starting another.
- [x] Prove sync/async structured-result parity and cross-call recovery.
- [x] Verify focused async/check/continuity smokes plus stress, then milestone commit.

## Milestone 26 — Execution routing without quality loss

- [x] Add deterministic execution hints and server guidance for sync / `proc_*` / `job_*` / `goal_*`.
- [x] State explicitly that the configured deadline (20 minutes by default) is never a quality/completeness target.
- [x] Require material persisted progress across continued calls and condition-based polling.
- [x] Update ChatGPT/operator/developer instructions only to advertise capabilities already present.
- [x] Verify routing/instruction smoke, full smoke, and milestone commit.

## Milestone 27 — Resumable non-process batches

- [x] Add bounded `batch_*` state with request/source fingerprints.
- [x] Integrate continuation into `gather_context` and large `inspect_workspace` paths.
- [x] Compare resumed vs uninterrupted deterministic outputs.
- [x] Verify context/analysis/resumable smokes, full smoke, and milestone commit.

## Milestone 28 — Observability and diagnostics

- [x] Add bounded/redacted deadline/job/batch lifecycle telemetry.
- [x] Expose current effective/default/min/max deadline values and continuation capability state through existing diagnostics.
- [x] Add timeout-risk inventory, current-runtime versus saved-next-run mode/deadline display, and the mutation-free `tool_time_probe` used only for host-window discovery; reuse Plan 22 for editing rather than creating a second settings control.
- [x] Verify diagnostics/full smoke and stress if shared concurrency instrumentation changed.
- [x] Make the final subsystem milestone commit.

## Final Cumulative Review

- [x] Spec-compliance review: map every recommendation in the design table to implemented evidence.
- [x] Quality review: confirm no path reduces requested scope/test coverage/review depth to fit the deadline.
- [x] Safety review: policy/PathGuard/hooks/redaction/process ownership remain authoritative.
- [x] Portability review: Windows first-class; macOS/Linux semantics covered by unit/smoke evidence and live checks where required.

## Final Verification Gate

Run, in order:

```bash
npm run build
npm run smoke
npm run stress
npm audit --audit-level=high
npm run release:pack
git diff --check
```

Also run each new focused smoke individually first. Do not simulate correctness only at the 20-minute default: use injected short budgets and at least one non-default configured budget to prove yield/resume deterministically, then one realistic end-to-end async workflow to prove the MCP calls themselves stay short while local work continues.

## Integration / Release Boundary

If the user later authorizes Plans 22–28 as one batch, use one isolated cumulative integration worktree and one milestone commit per plan. Integrate to `main` only after the final cumulative gate. Push only when that implementation authorization includes the repository's standing integration rule. Reinstall the global package only when it can be done without violating the running-runtime lifecycle rule; otherwise report reinstall pending. Publication/release remains separately authorized.

## Final Acceptance Criteria

- In normal bounded mode, no synchronous CodexPro MCP operation intentionally requires more open-call time than the effective configured deadline; the default remains exactly 20 minutes. Unlimited/observe is exempt only because it is a temporary harmless discovery mode, not the recommended normal execution policy.
- Long work continues via `proc_*`, `job_*`, `goal_*`, or `batch_*` without reducing the user's original quality bar.
- A deadline yield preserves completed evidence and exact remaining work.
- ChatGPT guidance tells the agent to continue the same goal across calls, not compress it into a lower-quality answer.
- Diagnostics make deadline routing/recovery inspectable without leaking sensitive data.

## Optional follow-on: task-aware browser continuation

This controller ends after Plan 28. If the user separately authorizes browser-continuation work, continue with `docs/superpowers/plans/2026-09-08-task-aware-browser-continuation-execution.md` (Plans 29–37).

Do not make Plans 22–28 depend on browser automation. Tool-time awareness remains useful/enabled by default even if continuation is never enabled. The follow-on layer is opt-in, uses a dedicated manually authenticated browser profile, and requires explicit user action for every continuation dispatch.