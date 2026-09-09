# Continuation Runtime Integration and ChatGPT Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Integrate task-aware continuation with the configurable deadline, composite verification, durable jobs, processes, batches, Durable Goals, and ChatGPT instructions without duplicating those execution systems.

**Architecture:** Continuation remains a conversation-resume layer. Existing execution primitives own actual long work; continuation state observes their durable status plus a launcher/runtime snapshot (`runtimeGenerationId`, current deadline mode/value, transport readiness), and ChatGPT uses semantic lifecycle tools to checkpoint/request/complete only when another model turn is genuinely required. Saved next-run settings never substitute for current runtime truth.

**Tech Stack:** Existing Plans 22–28 modules, continuation modules from Plans 29–34, server instructions, activity/evidence ledger.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Plans 22–28 remain authoritative for deadline/process/job/batch/Goal execution.
- Tool-time awareness exists regardless of continuation settings. Continuation logic is inert unless `continuationEnabled=true` and never turns synchronous work into a lower-quality rushed result.
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
- Every MCP dispatch associated with an armed session refreshes continuation heartbeat after normal auth/policy validation and before tool execution. Generate one opaque random `runtimeGenerationId` per launcher start and persist it only in the sanitized runtime-status record alongside current `syncCallDeadlineMode`, `syncCallDeadlineMs`, and `transportState=ready` after the selected tunnel/local transport is actually ready. Cleanup, user quit, or tunnel child exit removes/invalidates that snapshot rather than leaving stale `ready` state.
- [x] **Step 1: Add session-association tests**

Prove unrelated MCP sessions/workspaces cannot refresh another task, and a resumed continuation turn can re-associate only through the task ID plus validated workspace/session state. Prove restart creates a new runtime generation, current runtime status carries the configured non-default deadline, transport exit/removal cannot remain `ready`, and a stale pre-restart heartbeat is not reused for inferred interruption.

- [x] **Step 2: Keep heartbeat non-authoritative**

Heartbeat indicates activity only; it may not mutate current phase, remaining work, completion, or authorization state.

### Task 2: Integrate configurable deadline and cooperative yields

**Files:**
- Modify: `src/deadline.ts`
- Modify: `src/checksOps.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `scripts/continuation-watchdog-smoke.mjs`

**Interfaces:**
- On a truthful deadline yield with semantic work remaining, ChatGPT instructions call `continuation_checkpoint` then `continuation_request`; runtime helpers never auto-request based solely on elapsed time.

- [x] **Step 1: Add default/custom-deadline cases**

With fake bounded 20-minute, 12-minute, and boundary 5/60-minute budgets, verify continuation readiness consumes the **current runtime snapshot mode/value** and configured grace without altering the underlying verification/check result. Add saved-profile/current-runtime mismatch cases plus observe mode proving timeout inference is disabled rather than silently using the 20-minute reference.

- [x] **Step 2: Preserve incomplete verification semantics**

A deadline-yielded `run_checks`/`verify_changes` result remains incomplete exactly as Plan 23 defines. Continuation metadata may reference pending check IDs but cannot turn partial verification into success.

### Task 3: Integrate proc/job/batch/Goal state

**Files:**
- Modify: `src/continuation/watchdog.ts`
- Modify: relevant public status adapters only; do not duplicate process/job/Goal stores
- Modify: `scripts/continuation-watchdog-smoke.mjs`

- [x] **Step 1: Add durable-work suppression matrix**

Cover running `proc_*`, running `job_*`, active `goal_*`, active `batch_*`, terminal success/failure, and states requiring model review. Read canonical subsystem status rather than copying PID/task state into continuation records.

- [x] **Step 2: Request model attention only at meaningful boundaries**

Examples: finished long verification needing interpretation, Goal reaching `awaiting_review`, batch continuation needing another semantic call, or process completion requiring next step. Running background work alone does not create browser continuation readiness.
### Task 4: Update ChatGPT/server instructions

**Files:**
- Modify: `src/server.ts` `serverInstructions()`
- Modify: `CHATGPT_PROMPT.md`
- Modify: `docs/agentic/DEVELOPMENT_WORKFLOW.md`
- Create: `scripts/continuation-instructions-smoke.mjs`

**Interfaces:**
- Instructions describe when to arm/checkpoint/request/complete continuation and preserve manual browser-send authority.

- [x] **Step 1: Add failing instruction assertions**

Require guidance to arm continuation only when `continuationEnabled=true` and a substantial task is likely to span calls; never prompt for browser/Telegram setup when disabled. Checkpoint after material progress; register only bounded continuation intents that reference recorded remaining work; use `proc_*`/`job_*`/`goal_*`/`batch_*` for actual long work; request continuation before a truthful yield; complete only after acceptance criteria/verification; and call `continuation_cancel`/disarm when the user explicitly stops/cancels the overall task. A user Stop-generating/manual-turn browser event pauses inferred continuation until semantic reconciliation.

- [x] **Step 2: Encode no-rush/no-auto-send behavior**

Instructions must state that configured deadlines are continuation boundaries, never quality targets, and that browser continuation is user-gated. ChatGPT must not wait/busy-poll merely to trigger another turn.

- [x] **Step 3: Define recovery on next turn**

On a user-dispatched continuation message, ChatGPT first calls `continuation_status`, checks terminal/revision state and current transport/runtime snapshot, recovers canonical remaining work/durable subsystem state plus any `selectedContinuationIntentId`, avoids redoing verified work, then resumes the same goal. A focused intent changes priority within recorded remaining work only; it never expands scope. If the task is already completed/canceled or transport is unavailable, it must not recreate continuation state merely because the fixed message arrived.

- [x] **Step 4: Define manual-prompt reconciliation**

When `continuation_status` reports `manualTurnPending`, the host model uses the current user prompt already visible to ChatGPT—not browser scraping—to choose exactly one `continuation_reconcile` disposition. Simple continuation -> `resume`; changed priorities/requirements inside the same goal -> `redirect` with updated bounded checkpoint metadata; materially new task -> `supersede` old state and separately arm the new task only if continuation is enabled/warranted; explicit stop/cancel -> `cancel`; ambiguous relation -> leave paused. A manual `continue` therefore works naturally without clicking a continuation button.

### Task 5: Integrate bounded evidence/diagnostics hooks

**Files:**
- Modify: `src/activityLedger.ts` or canonical activity integration seam
- Modify: `src/diagnosticsOps.ts`
- Modify: `scripts/continuation-instructions-smoke.mjs`

- [x] **Step 1: Record bounded lifecycle events**

Record arm/checkpoint/request/ready/dispatched/ack/completed/canceled/auth-required events with task short ID, timestamps, and reason codes only; no conversation text, browser URL, or credentials.

- [x] **Step 2: Expose capability state**

Diagnostics report continuation feature enabled/disabled, paired browser available, auth enum, active task count, user-action-required state, current runtime generation/deadline mode/value, and transport availability. Do not expose private chat identifiers. Saved next-run deadline is separately labeled and never presented as the watchdog timing value for the current process.
### Task 6: Verify and commit the milestone

- [x] **Step 1: Run focused integration gates**

Run: `node scripts/continuation-instructions-smoke.mjs`
Run: `node scripts/continuation-watchdog-smoke.mjs`
Run: `node scripts/checks-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Expected: PASS.

- [x] **Step 2: Run stress because shared lifecycle/concurrency changed**

Run: `npm run stress`
Expected: PASS.

- [x] **Step 3: Commit milestone**

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
- Continuation timing stays synchronized to the actual current runtime deadline mode/value/transport generation and cannot silently fall back to the 20-minute reference or saved next-run settings; observe mode disables timeout inference rather than substituting a finite value.
- Explicitly stopped/absent CodexPro transport suppresses continuation and is never automatically restarted by the continuation subsystem.
- Manual prompts supersede stale automation until semantic resume/redirect/supersede/cancel reconciliation; no prompt content is stored in continuation/browser state.
- With continuation disabled, server instructions still use deadline/process/job/Goal/batch awareness but never arm tasks, launch browser setup, or request Telegram setup.

## Implementation Evidence — 2026-09-10

- HTTP MCP continuation ownership now binds to the authoritative transport session. Unrelated sessions cannot refresh/steal a task; explicit MCP session termination removes server-side ownership, and validated same-workspace recovery advances the semantic revision once.
- Launcher runtime state carries a fresh opaque `runtimeGenerationId`, current deadline mode/value, and `transportState=ready` only at the real readiness boundary; cleanup removes stale ready state. Ordinary MCP heartbeats are revision-neutral, while the first post-dispatch model interaction acknowledges `awaiting_ack`.
- Watchdog tests cover current-runtime bounded deadlines at 5/12/20/60 minutes plus observe mode. Existing check/verification tests prove deadline-yielded work stays incomplete with pending check IDs rather than becoming success.
- Canonical process/job/Goal/batch stores feed continuation readiness through a pure state classifier; productive durable work suppresses browser turns until semantic model attention is required. The browser bridge now evaluates the real watchdog from current runtime, durable state, and coarse capability observations only.
- Server/ChatGPT guidance covers enabled/disabled continuation, no-rush deadline handling, checkpoint/request/complete/cancel lifecycle, resumed-turn `continuation_status`, selected intent recovery, verified-work preservation, and manual-turn resume/redirect/supersede/cancel reconciliation. Dispatch remains user-gated and never auto-sends.
- Bounded activity evidence records continuation lifecycle actions using only an 8-character task short ID plus state/reason codes. Diagnostics expose continuation enablement, coarse browser/auth state, active-task/user-action state, and current runtime generation/deadline/transport while separately labeling saved-next-run deadline. No conversation route/text, browser credential, or authorization token is emitted.
- Operator-requested deadline UX refinement: the bounded tool access window remains default 20 minutes and valid 5–60 minutes, but the local admin page presents it as a typed numeric `Tool access window (minutes)` field rather than a predefined duration selector. Unlimited/observe is a separate checkbox; saved/runtime contracts remain compatible.
- Fresh focused gates passed: TypeScript build, activity ledger, continuation watchdog, browser continuation, diagnostics, continuation instructions, checks, HTTP, settings, and browser-profile smokes, plus `git diff --check`.
- Fresh full `npm run smoke` passed with exit code 0 in 152.72 seconds. Fresh `npm run stress` passed with exit code 0 in 31.55 seconds.
