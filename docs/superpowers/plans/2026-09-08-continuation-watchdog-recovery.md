# Continuation Watchdog, Recovery, and Anti-Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect likely interrupted/incomplete ChatGPT work conservatively, notify the user that continuation is ready, and prevent duplicate or runaway continuation cycles.

**Architecture:** A deterministic watchdog evaluates durable continuation state plus a **current runtime snapshot** (runtime generation, effective deadline, transport readiness), MCP heartbeat, browser/page observation generation, and owned proc/job/Goal state. It may transition to `continuation_ready` and notify the browser, but it can never submit a ChatGPT message. Runtime/browser reconnects reset inferred-interruption baselines so stale wall-clock gaps cannot manufacture readiness.

**Tech Stack:** TypeScript, fake clock, existing process/job/Goal status APIs, continuation store, browser bridge, extension notifications.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Explicit `continuation_request` is preferred over inference.
- Inference must be conservative and fail closed on missing/ambiguous state.
- Active local durable work suppresses continuation until model attention is actually needed.
- Browser watchdog never submits messages; user click remains mandatory.
- No rapid polling/busy loops; state transitions and notifications are bounded/idempotent.

---

### Task 1: Add session heartbeat and acknowledgement model

**Files:**
- Create: `src/continuation/watchdog.ts`
- Modify: `src/continuation/types.ts`
- Modify: `src/continuation/ops.ts`
- Create: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- Produces `recordContinuationHeartbeat`, `acknowledgeContinuationDispatch`, `recordContinuationUserInteraction`, and `evaluateContinuationReadiness` with injectable clock/runtime snapshot. Server receive time/monotonic elapsed time is authoritative; browser-supplied timestamps are advisory only.
- [ ] **Step 1: Write failing heartbeat/ack tests**

Assert every relevant MCP tool call for an armed session refreshes `lastHeartbeatAt`, a dispatched nonce becomes `awaiting_ack`, a later checkpoint/heartbeat acknowledges it, and duplicate/stale acknowledgements cannot create a new cycle. Completion/cancel or a newer task revision invalidates outstanding ready/dispatch state and cannot be reversed by a late heartbeat/ack.

Run: `node scripts/continuation-watchdog-smoke.mjs`
Expected: FAIL because watchdog helpers do not exist.

- [ ] **Step 2: Implement nonce/ack invariants**

Only one outstanding nonce is allowed. Dispatch increments `continuationCount` once. A new continuation nonce cannot be created until the prior dispatch is acknowledged by a later model/CodexPro interaction or manually canceled/re-armed.

### Task 2: Implement conservative readiness evaluation

**Files:**
- Modify: `src/continuation/watchdog.ts`
- Modify: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- Consumes `RuntimeContinuationSnapshot { runtimeGenerationId, syncCallDeadlineMs, transportState, observedAt }`, grace setting, browser/page observation generation + coarse state, last server-received user interaction, and owned durable-work status. It must never fall back to `DEFAULT_SYNC_CALL_DEADLINE_MS` or a saved next-run profile value while a current runtime snapshot exists.

- [ ] **Step 1: Add explicit-request readiness tests**

An armed incomplete task with explicit `continuation_request`, current transport `ready`, correct bound chat, signed-in stable-idle page, no blocking interaction, no recent manual user turn/Stop event, current task revision, and no outstanding nonce becomes `continuation_ready`. Explicit request bypasses only the elapsed-time inference; it never bypasses transport/auth/page/user safety predicates.

- [ ] **Step 2: Add inferred-interruption tests**

Without explicit request, require stale MCP heartbeat beyond the **current runtime** `syncCallDeadlineMs + unexpectedInterruptionGraceMs`, current transport `ready`, page stably idle (not streaming/busy/error/blocked/unknown), task incomplete, valid binding/current revision, and no active proc/job/Goal requiring patience. Missing one condition keeps the task non-ready. Add 20-minute-default and non-default 5/12/60-minute fixtures so a hidden hard-coded 20-minute assumption fails tests.

- [ ] **Step 3: Integrate durable-work awareness**

Use existing ownership/status APIs; do not infer process state from OS-wide process lists. If an owned process/job/Goal is running, readiness waits unless its persisted state explicitly says model attention is required.

- [ ] **Step 4: Reset inference baselines on generation/reconnect gaps**

When `runtimeGenerationId` changes, transport goes unavailable→ready, browser/bridge observation generation changes after a long gap, or a simulated sleep/clock jump is detected by missing heartbeats, set a fresh server-side `interruptionBaselineAt`. Do not instantly infer interruption from timestamps accumulated before that boundary. Explicit semantic requests may remain pending but still require current safety predicates.

- [ ] **Step 5: Treat manual user/platform activity as a durable blocker**

A manual user message submission or recognized Stop-generating click clears ready nonce/notification and transitions to `paused_by_user`/needs-reconciliation. Generic ChatGPT busy/error/retry/unknown states suppress readiness indefinitely; watchdog never clicks Retry or changes models. Only a later semantic checkpoint/request or explicit operator re-arm can resume inference after user pause.
### Task 3: Add anti-loop, cooldown, and notification rules

**Files:**
- Modify: `src/continuation/watchdog.ts`
- Modify: `browser-extension/background.js`
- Modify: `browser-extension/popup.js`
- Modify: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- Default cooldown 60 seconds; default maximum dispatch count 20; notification keyed by task + nonce.

- [ ] **Step 1: Add cooldown/max-attempt tests**

Prove duplicate evaluations produce one notification, dispatch cannot recur inside cooldown, reaching max attempts changes state to manual-rearm-required, and restart/reconnect does not replay an old nonce.

- [ ] **Step 2: Add browser notification behavior**

When continuation becomes ready, set an extension badge and issue one browser notification keyed to task revision + nonce. Clicking the notification focuses the bound chat/popup; it does not submit the message. Completion/cancel, route invalidation, user pause, auth loss, or transport loss immediately clears the badge/notification when the companion next receives authoritative state.

- [ ] **Step 3: Suppress when user is active**

Recent composer interaction or manually focused blocking state suppresses readiness/notification until a fresh safe observation is received.

### Task 4: Add fail-closed disconnect/auth recovery

**Files:**
- Modify: `src/continuation/watchdog.ts`
- Modify: `src/continuation/browserBridge.ts`
- Modify: `scripts/continuation-watchdog-smoke.mjs`

- [ ] **Step 1: Test bridge disconnect**

If the extension/bridge heartbeat disappears, mark browser availability unknown/disconnected and never assume a continuation was delivered. On reconnect, fetch current task revision/runtime snapshot first and reset inferred-interruption baseline after a long observation gap; cached extension readiness is discarded.

- [ ] **Step 2: Test auth expiry**

When browser reports signed-out/authentication-required, move the task to `waiting_for_auth`, revoke any ready dispatch nonce, and require the Plan 31 manual sign-in flow before another continuation can be prepared. When the CodexPro runtime-status/transport snapshot is absent or not ready, use `waiting_for_transport`, revoke readiness, and never auto-start/restart CodexPro or any tunnel. Transport recovery alone does not reuse the pre-disconnect inference timer.
### Task 5: Verify and commit the milestone

- [ ] **Step 1: Run deterministic fake-clock gates**

Run: `node scripts/continuation-watchdog-smoke.mjs`
Run: `node scripts/continuation-state-smoke.mjs`
Run: `node scripts/browser-continuation-smoke.mjs`
Run: `npm run build`
Expected: PASS without waiting real deadline durations.

- [ ] **Step 2: Run stress for concurrent state transitions**

Run: `npm run stress`
Expected: PASS with no duplicate nonce/notification/dispatch state under concurrent status/heartbeat calls.

- [ ] **Step 3: Commit milestone**

```bash
git add src/continuation browser-extension scripts/continuation-watchdog-smoke.mjs
git commit -m "feat: add continuation watchdog and recovery"
```

## Acceptance Criteria

- Explicit continuation requests become ready quickly when safe.
- Unexpected interruption inference requires the **current runtime-configured** deadline + grace and all safety predicates; saved/default deadline values are never fallback timing authority.
- Runtime/tunnel loss, restart, browser reconnect after a long gap, sleep/clock jumps, manual user turns/Stop actions, and platform busy/error/unknown states reset or suppress inference rather than producing stale readiness.
- Completed/canceled terminal revisions clear prepared authorization and stale browser controls cannot revive them.
- Active proc/job/Goal work, user activity, auth problems, streaming, or ambiguous UI suppress readiness.
- One nonce yields at most one user notification and one user-authorized dispatch.
- Restart/reconnect cannot create duplicate continuation loops.