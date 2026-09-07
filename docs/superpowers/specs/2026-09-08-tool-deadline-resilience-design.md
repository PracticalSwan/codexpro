# Tool Deadline Resilience — Design

**Status:** Planned; user-authorized planning only on 2026-09-08
**Scope:** synchronous MCP deadline control, composite verification, durable structured jobs, execution routing, resumable non-process work, diagnostics, and ChatGPT guidance

## Problem

ChatGPT may terminate a plugin/tool invocation that remains open for roughly 25 minutes. CodexPro must therefore ensure that no ordinary synchronous MCP call intentionally depends on remaining open that long. The solution must preserve the user's full goal and quality bar rather than making the model rush to finish.

## Non-negotiable timing contract

- The CodexPro synchronous MCP call deadline is **exactly 20 minutes = 1,200,000 ms**.
- This is a **blocking-call/transport deadline**, not a task deadline, quality deadline, or goal deadline.
- The 20-minute value is a product constant, not a profile knob and not user-raiseable beyond the external platform boundary.
- A small internal handoff reserve may stop *starting new synchronous phases* before 20:00 so the handler can serialize a durable continuation response; this does not change the 20:00 deadline.
- No test may wait 20 real minutes; deadline utilities must support an injected clock/budget for deterministic fast tests while production uses the fixed constant.

## Quality-preservation contract

CodexPro and its ChatGPT instructions must explicitly prohibit deadline-driven shortcuts. The agent must not reduce requested scope, skip required inspection/review/tests, lower acceptance criteria, omit safety checks, or claim completion merely to fit one call. When the remaining work cannot be completed correctly within the current call, the system must preserve state and continue through a managed process, durable job, Durable Goal, or resumable cursor.

Every call in a continued workflow should make **material, durable progress**: complete an atomic phase, produce verified evidence, advance a persisted job/task state, or return a continuation token. Busy-waiting and repeated no-op status calls do not count as progress.

## Execution classes

1. **Synchronous** — bounded reads, edits, Git inspection, small checks/builds, and other work expected to complete comfortably inside one call.
2. **Managed process / structured job** — long or high-variance commands and verification that should continue locally while MCP calls return quickly.
3. **Durable Goal** — multi-stage engineering work needing isolated worktrees, dependency scheduling, review, and explicit projection.

## Architecture

```text
MCP tool dispatch
   |
   +--> fixed DeadlineBudget(1_200_000 ms)
   |       |
   |       +--> cooperative synchronous work
   |       +--> remaining-budget propagation to child checks/processes
   |       +--> deadline-yield result when more work remains
   |
   +--> duration/risk router
           |
           +--> sync tool
           +--> existing proc_* manager for long shell commands
           +--> structured job_* store/worker for long verification/non-shell work
           +--> existing goal_* lifecycle for multi-stage engineering

Persisted continuation/evidence
   +--> job_* state + bounded output/progress
   +--> batch_* continuation cursor
   +--> existing task snapshots, activity ledger, operation receipts, Goal state
```

The design deepens existing seams. `src/server.ts` remains registration/orchestration only. Deadline accounting belongs in a focused `src/deadline.ts`; durable structured jobs live under `src/jobs/`; existing `WorkspaceProcessManager` remains the command-process owner; existing Goal orchestration remains the multi-stage workflow owner.

## Public behavior

- Synchronous tools that can contain multiple long phases receive one shared 20-minute budget rather than a fresh timeout per phase.
- `run_checks` and `verify_changes` must stop scheduling new checks when the shared budget cannot safely accommodate another phase and return explicit partial/continuation metadata instead of silently dropping work.
- Structured asynchronous verification gets explicit start tools that return `job_*` immediately; generic `job_start(command)` is intentionally rejected to avoid duplicating unrestricted Bash/process execution.
- Job status/output/cancel/resume calls are short polling operations and never wait for job completion.
- Expensive non-process scans may return an opaque resumable `batch_*` cursor so later calls continue from persisted state.
- Diagnostics expose the fixed 1,200,000 ms contract, deadline yields, async routing, active durable jobs, and tools at elevated timeout risk.

## Duration-aware routing guidance

- Expected <= 5 minutes: synchronous is preferred when otherwise appropriate.
- Expected 5–15 minutes: synchronous remains allowed, but structured async execution is preferred when variance is high.
- Expected >= 15 minutes, unknown/high-variance heavy work, or work composed of several potentially long phases: route async before starting.
- The 15-minute routing threshold is **not** the deadline. The hard synchronous deadline remains exactly 20 minutes.

## Recommended-solution mapping

| Recommendation | Plan |
|---|---|
| Exact 20-minute synchronous MCP deadline | 22 |
| Quality preservation and material-progress invariant | 22, 26 |
| Shared deadline propagation through `run_checks` / `verify_changes` | 23 |
| Durable structured job core with persistence/recovery | 24 |
| Heartbeat/progress metadata and short polling | 24 |
| Asynchronous verification | 25 |
| Teach ChatGPT to choose long-running primitives | 26 |
| Expected-duration routing and three execution classes | 26 |
| Prefer Durable Goals for substantial multi-stage work | 26 |
| Resumable non-process batch/cursor operations | 27 |
| Deadline-risk diagnostics/telemetry | 28 |

## Safety and compatibility

- Existing synchronous tool signatures remain backward compatible; new fields are additive.
- No deadline path may leave an unowned child process or continue a mutation after returning a result unless that work was deliberately transferred to an existing managed process, structured job, or Goal with a durable handle.
- Cancellation must target only CodexPro-owned process/job identities and must defend against PID reuse.
- Job metadata is bounded, sanitized, and stored outside source workspaces under the CodexPro state directory; it stores no prompts, chain-of-thought, raw secrets, or unrestricted environment data.
- Workspace policy, PathGuard, hook trust, write mode, Bash mode, Git gates, and redaction remain authoritative before any routing decision.
- The design does not rely on MCP Tasks support; if Tasks later becomes available, it may adapt to the same canonical `proc_*`, `job_*`, and `goal_*` state.

## Verification strategy

Each subsystem requires a focused smoke with fake/short budgets, then `npm run build`. Shared MCP registration or instruction changes also require `npm run smoke`. Process/job concurrency or shutdown semantics require `npm run stress`. Dependency changes are not expected; if introduced, add audit and release-package checks.

The final cumulative implementation gate must demonstrate: a synthetic composite operation that would exceed 20 minutes yields/resumes without losing required work; a long verification runs through `job_*` while status calls remain short; short work remains synchronous; Goal/process routing preserves full acceptance criteria; and no test or implementation claims an external ChatGPT limit was bypassed.

## Non-goals

- Do not bypass, extend, spoof, or disable ChatGPT's external tool window.
- Do not make the model answer faster by lowering reasoning/task quality.
- Do not create a second generic command runner beside `WorkspaceProcessManager`.
- Do not create a second multi-stage workflow DSL beside Durable Goals.
- Do not automatically push, merge, deploy, publish, or approve projection as part of deadline recovery.
