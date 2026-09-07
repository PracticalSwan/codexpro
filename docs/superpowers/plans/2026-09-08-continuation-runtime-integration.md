# Continuation Runtime Integration and ChatGPT Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate task-aware continuation with the configurable deadline, composite verification, durable jobs, processes, batches, Durable Goals, and ChatGPT instructions without duplicating those execution systems.

**Architecture:** Continuation remains a conversation-resume layer. Existing execution primitives own actual long work; continuation state observes their durable status plus a launcher/runtime snapshot (`runtimeGenerationId`, current effective deadline, transport readiness), and ChatGPT uses semantic lifecycle tools to checkpoint/request/complete only when another model turn is genuinely required. Saved next-run settings never substitute for current runtime truth.

**Tech Stack:** Existing Plans 22–28 modules, continuation modules from Plans 29–34, server instructions, activity/evidence ledger.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Plans 22–28 remain authoritative for deadline/process/job/batch/Goal execution.
- Browser continuation never turns synchronous work into a lower-quality rushed result.
- Local durable work should continue without unnecessary browser/model turns.
- ChatGPT must explicitly complete/cancel the continuation task after verified semantic completion.
- User-gated dispatch is the only send path in version 1: Plan 32 browser click or, when Plan 37 is enabled, a validated paired Telegram callback. Watchdogs/timers never create dispatch authorization.

---

### Task 1: Associate continuation heartbeat with MCP tool activity

**Files:**
- Modify: `src/server.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `scripts/codexpro.mjs` runtime-status writer
- Modify: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- Every MCP dispatch associated with an armed session refreshes continuation heartbeat after normal auth/policy validation and before tool execution. Generate one opaque random `runtimeGenerationId` per launcher start and persist it only in the sanitized runtime-status record alongside current `syncCallDeadlineMs` and `transportState=ready` after the selected tunnel/local transport is actually ready. Cleanup, user quit, or tunnel child exit removes/invalidates that snapshot rather than leaving stale `ready` state.
- [ ] **Step 1: Add session-association tests**

Prove unrelated MCP sessions/workspaces cannot refresh another task, and a resumed continuation turn can re-associate only through the task ID plus validated workspace/session state. Prove restart creates a new runtime generation, current runtime status carries the configured non-default deadline, transport exit/removal cannot remain `ready`, and a stale pre-restart heartbeat is not reused for inferred interruption.

- [ ] **Step 2: Keep heartbeat non-authoritative**

Heartbeat indicates activity only; it may not mutate current phase, remaining work, completion, or authorization state.

### Task 2: Integrate configurable deadline and cooperative yields

**Files:**
- Modify: `src/deadline.ts`
- Modify: `src/checksOps.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- On a truthful deadline yield with semantic work remaining, ChatGPT instructions call `continuation_checkpoint` then `continuation_request`; runtime helpers never auto-request based solely on elapsed time.

- [ ] **Step 1: Add default/custom-deadline cases**

With fake 20-minute, 12-minute, and boundary 5/60-minute budgets, verify continuation readiness consumes the **current runtime snapshot value** and configured grace without altering the underlying verification/check result. Add a saved-profile-20/current-runtime-12 case and the inverse so any code reading the profile/default instead of current runtime fails.

- [ ] **Step 2: Preserve incomplete verification semantics**

A deadline-yielded `run_checks`/`verify_changes` result remains incomplete exactly as Plan 23 defines. Continuation metadata may reference pending check IDs but cannot turn partial verification into success.

### Task 3: Integrate proc/job/batch/Goal state

**Files:**
- Modify: `src/continuation/watchdog.ts`
- Modify: relevant public status adapters only; do not duplicate process/job/Goal stores
- Modify: `scripts/continuation-watchdog-smoke.mjs`

- [ ] **Step 1: Add durable-work suppression matrix**

Cover running `proc_*`, running `job_*`, active `goal_*`, active `batch_*`, terminal success/failure, and states requiring model review. Read canonical subsystem status rather than copying PID/task state into continuation records.

- [ ] **Step 2: Request model attention only at meaningful boundaries**

Examples: finished long verification needing interpretation, Goal reaching `awaiting_review`, batch continuation needing another semantic call, or process completion requiring next step. Running background work alone does not create browser continuation readiness.
### Task 4: Update ChatGPT/server instructions

**Files:**
- Modify: `src/server.ts` `serverInstructions()`
- Modify: `CHATGPT_PROMPT.md`
- Modify: `docs/agentic/DEVELOPMENT_WORKFLOW.md`
- Create: `scripts/continuation-instructions-smoke.mjs`

**Interfaces:**
- Instructions describe when to arm/checkpoint/request/complete continuation and preserve manual browser-send authority.

- [ ] **Step 1: Add failing instruction assertions**

Require guidance to arm continuation only for substantial tasks likely to span calls when the feature is enabled; checkpoint after material progress; register only bounded continuation intents that reference recorded remaining work; use `proc_*`/`job_*`/`goal_*`/`batch_*` for actual long work; request continuation before a truthful yield; complete only after acceptance criteria/verification; and call `continuation_cancel`/disarm when the user explicitly stops/cancels the overall task. A user Stop-generating/manual-turn browser event pauses inferred continuation until semantic reconciliation.

- [ ] **Step 2: Encode no-rush/no-auto-send behavior**

Instructions must state that configured deadlines are continuation boundaries, never quality targets, and that browser continuation is user-gated. ChatGPT must not wait/busy-poll merely to trigger another turn.

- [ ] **Step 3: Define recovery on next turn**

On a user-dispatched continuation message, ChatGPT first calls `continuation_status`, checks terminal/revision state and current transport/runtime snapshot, recovers canonical remaining work/durable subsystem state plus any `selectedContinuationIntentId`, avoids redoing verified work, then resumes the same goal. A focused intent changes priority within recorded remaining work only; it never expands scope. If the task is already completed/canceled or transport is unavailable, it must not recreate continuation state merely because the fixed message arrived.

### Task 5: Integrate bounded evidence/diagnostics hooks

**Files:**
- Modify: `src/activityLedger.ts` or canonical activity integration seam
- Modify: `src/diagnosticsOps.ts`
- Modify: `scripts/continuation-instructions-smoke.mjs`

- [ ] **Step 1: Record bounded lifecycle events**

Record arm/checkpoint/request/ready/dispatched/ack/completed/canceled/auth-required events with task short ID, timestamps, and reason codes only; no conversation text, browser URL, or credentials.

- [ ] **Step 2: Expose capability state**

Diagnostics report continuation feature enabled/disabled, paired browser available, auth enum, active task count, user-action-required state, current runtime generation/deadline, and transport availability. Do not expose private chat identifiers. Saved next-run deadline is separately labeled and never presented as the watchdog timing value for the current process.
### Task 6: Verify and commit the milestone

- [ ] **Step 1: Run focused integration gates**

Run: `node scripts/continuation-instructions-smoke.mjs`
Run: `node scripts/continuation-watchdog-smoke.mjs`
Run: `node scripts/checks-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Expected: PASS.

- [ ] **Step 2: Run stress because shared lifecycle/concurrency changed**

Run: `npm run stress`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/server.ts src/continuation src/checksOps.ts src/diagnosticsOps.ts src/activityLedger.ts scripts/codexpro.mjs CHATGPT_PROMPT.md docs/agentic/DEVELOPMENT_WORKFLOW.md scripts/continuation-instructions-smoke.mjs scripts/continuation-watchdog-smoke.mjs
git commit -m "feat: integrate task-aware continuation routing"
```

## Acceptance Criteria

- Continuation supplements rather than duplicates deadline/process/job/batch/Goal machinery.
- ChatGPT makes material durable progress and does not rush to meet a tool deadline.
- Background work suppresses unnecessary browser turns until semantic attention is needed.
- A resumed turn recovers durable state before doing more work.
- Completion/cancel remains explicit, terminal-state precedence invalidates stale browser/Telegram authorization, and every dispatch remains user-gated.
- Continuation timing stays synchronized to the actual current runtime deadline/transport generation and cannot silently fall back to the 20-minute default or saved next-run settings.
- Explicitly stopped/absent CodexPro transport suppresses continuation and is never automatically restarted by the continuation subsystem.