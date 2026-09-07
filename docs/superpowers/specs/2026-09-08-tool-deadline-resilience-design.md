# Tool Deadline Resilience — Design

**Status:** Planned; user-authorized planning only on 2026-09-08
**Scope:** synchronous MCP deadline control, composite verification, durable structured jobs, execution routing, resumable non-process work, diagnostics, and ChatGPT guidance

## Problem

ChatGPT or another MCP host may terminate a plugin/tool invocation after a finite client-specific window. The user has observed a roughly 25-minute ChatGPT window, but CodexPro must not assume that value is universal or stable. CodexPro therefore needs a user-configurable synchronous deadline that stays below the operator's observed/documented host window while preserving the user's full goal and quality bar rather than making the model rush to finish.

## Non-negotiable timing contract

- Tool-time awareness is **enabled by default** and is independent of browser/Telegram continuation. The normal default is a bounded **20 minutes = 1,200,000 ms**.
- The effective deadline is a **blocking-call/transport deadline**, not a task deadline, quality deadline, or goal deadline.
- Normal bounded mode accepts **5 to 60 minutes** per saved workspace profile so it can stay below the operator's observed/documented ChatGPT or MCP-host closure window.
- A separately explicit **Unlimited / observe-only** mode disables CodexPro's cooperative synchronous cutoff while continuing elapsed-time diagnostics. It is intended only for temporary host-window discovery with a harmless diagnostic probe, not as the recommended production setting for mutating work.
- CodexPro does not claim to know, bypass, or extend the host's external limit. Current OpenAI ChatGPT MCP documentation does not publish one universal per-user tool-call window; operators therefore measure their own environment and then restore a bounded value with safety margin.
- A proportional internal handoff reserve stops *starting new synchronous phases* before the configured deadline so the handler can serialize a durable continuation response; this does not shorten the user's overall task.
- No test may wait for real configured minutes; deadline utilities must support an injected clock/budget for deterministic fast tests while production uses the resolved effective value.

## Configuration contract

The runtime contract uses `syncCallDeadlineMode: "bounded" | "observe"` plus `syncCallDeadlineMs`. Default mode is `bounded` with `syncCallDeadlineMs = 1_200_000`; bounded values are `300_000` through `3_600_000` ms (5–60 minutes). In `observe` mode, `syncCallDeadlineMs` remains the last/default finite reference value for routing/display but does not enforce a cooperative cutoff.

User-facing configuration is intentionally minutes-based:

```text
codexpro settings set --sync-call-deadline-minutes 20
codexpro settings set --sync-call-deadline-minutes unlimited
codexpro start --sync-call-deadline-minutes 20
```

The saved workspace profile stores `syncCallDeadlineMs`; `codexpro settings show` displays the effective saved value in minutes. The authenticated local profile editor exposes **Synchronous tool deadline (minutes)** in the Runtime policy section with the same 5–60 minute validation and explanatory text. Website/profile changes remain next-run settings and do not mutate the already-running CodexPro process.

Runtime precedence is: explicit launch CLI value → `CODEXPRO_SYNC_CALL_DEADLINE_MS` → saved workspace profile → 20-minute default. The launcher must resolve the saved profile consistently and pass the effective value to the HTTP/MCP runtime; `src/config.ts` remains the runtime source of truth.

The settings UI/CLI must explain that ChatGPT accounts/clients may have different or changing tool windows. Discovery guidance starts with a disposable new chat/workspace, temporarily selects **Unlimited / observe-only**, runs only the harmless `tool_time_probe`, notes when ChatGPT closes the tool invocation, then restores a bounded deadline below that observed window (20 minutes remains the normal default). Unlimited mode must show a prominent warning not to use it as the normal setting for long mutations. At the 20-minute bounded default, the existing 5-minute/15-minute routing thresholds remain unchanged; non-default bounded deadlines derive equivalent thresholds proportionally from the effective value. Observe mode keeps conservative routing guidance using the finite reference deadline instead of treating normal work as infinitely synchronous.

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
   +--> DeadlineBudget(config.syncCallDeadlineMs; default 1_200_000 ms)
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

- Synchronous tools that can contain multiple long phases receive one shared effective configured budget rather than a fresh timeout per phase.
- `run_checks` and `verify_changes` must stop scheduling new checks when the shared budget cannot safely accommodate another phase and return explicit partial/continuation metadata instead of silently dropping work.
- Structured asynchronous verification gets explicit start tools that return `job_*` immediately; generic `job_start(command)` is intentionally rejected to avoid duplicating unrestricted Bash/process execution.
- Job status/output/cancel/resume calls are short polling operations and never wait for job completion.
- Expensive non-process scans may return an opaque resumable `batch_*` cursor so later calls continue from persisted state.
- Diagnostics expose the current effective deadline plus default/min/max values, deadline yields, async routing, active durable jobs, and tools at elevated timeout risk.

## Duration-aware routing guidance

- In bounded mode let `D` be the effective configured deadline. `sync_preferred = min(5 minutes, 25% of D)` and `async_preferred = 75% of D`. In Unlimited/observe mode, derive routing from the stored finite reference `D` (20 minutes by default) so discovery mode does not classify arbitrary long work as synchronously preferred.
- Work between those cutoffs may remain synchronous when low variance; unknown/high-variance heavy work routes async before starting.
- At the 20-minute default, these formulas preserve the original 5-minute and 15-minute thresholds.
- Routing cutoffs are **not** deadlines; the effective deadline remains the configured `D`.

## Recommended-solution mapping

| Recommendation | Plan |
|---|---|
| Configurable synchronous MCP deadline (20-minute default) | 22 |
| CLI/local website profile deadline setting | 22 |
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
| Harmless per-user host-window discovery probe / Unlimited observe mode | 22, 28 |

## Safety and compatibility

- Existing synchronous tool signatures remain backward compatible; new fields are additive.
- No deadline path may leave an unowned child process or continue a mutation after returning a result unless that work was deliberately transferred to an existing managed process, structured job, or Goal with a durable handle.
- Cancellation must target only CodexPro-owned process/job identities and must defend against PID reuse.
- Job metadata is bounded, sanitized, and stored outside source workspaces under the CodexPro state directory; it stores no prompts, chain-of-thought, raw secrets, or unrestricted environment data.
- Workspace policy, PathGuard, hook trust, write mode, Bash mode, Git gates, and redaction remain authoritative before any routing decision.
- The design does not rely on MCP Tasks support; if Tasks later becomes available, it may adapt to the same canonical `proc_*`, `job_*`, and `goal_*` state.

## Verification strategy

Host-window discovery is verified separately from normal deadline behavior. Plan 28 adds a read-only `tool_time_probe` that performs no workspace I/O, child-process launch, Git mutation, network action, or browser automation. In Unlimited/observe mode it may remain pending until its operator-selected harmless probe duration or client disconnect. If the transport exposes a trustworthy abort signal, diagnostics may record observed elapsed time; otherwise the UI instructs the user to note the ChatGPT-side closure time manually. This measurement is advisory and never silently rewrites the saved deadline.


Each subsystem requires a focused smoke with fake/short budgets, then `npm run build`. Shared MCP registration or instruction changes also require `npm run smoke`. Process/job concurrency or shutdown semantics require `npm run stress`. Dependency changes are not expected; if introduced, add audit and release-package checks.

The final cumulative implementation gate must demonstrate: synthetic composite operations that exceed both the default and a shorter configured deadline yield/resume without losing required work; a long verification runs through `job_*` while status calls remain short; short work remains synchronous; Goal/process routing preserves full acceptance criteria; and no test or implementation claims an external ChatGPT limit was bypassed.

## Non-goals

- Do not bypass, extend, spoof, or disable ChatGPT's external tool window.
- Do not make the model answer faster by lowering reasoning/task quality.
- Do not create a second generic command runner beside `WorkspaceProcessManager`.
- Do not create a second multi-stage workflow DSL beside Durable Goals.
- Do not automatically push, merge, deploy, publish, or approve projection as part of deadline recovery.

## Conversation-resume boundary

Plans 22–28 deliberately stop at preserving/recovering work across MCP calls. They do not drive ChatGPT Web or initiate another conversation turn. Optional task-aware browser continuation is specified separately in `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md` and Plans 29–37.

That later layer remains human-gated: browser state may notify/focus/prepare one explicitly bound conversation, but every continuation dispatch requires the user's explicit action. Deadline resilience must remain fully functional when browser continuation is disabled, unavailable, signed out, or unpaired.