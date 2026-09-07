# Exact 20-Minute Synchronous Deadline and Quality Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every synchronous CodexPro MCP call one exact 20-minute wall-clock budget without turning that budget into pressure to reduce task quality.

**Architecture:** Add a focused deadline context module with a production constant of `1_200_000` ms and cooperative remaining-budget helpers. Wrap MCP dispatch in the context, but do not use unsafe `Promise.race` cancellation that could leave mutations running after a response. Later plans make long subsystems cooperatively yield or route async.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, existing MCP registration wrapper and smoke-test style.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Production synchronous deadline is exactly `1_200_000` ms (20:00) and is not configurable.
- Deadline applies to one MCP invocation, never to the user's overall task or Goal.
- No handler may lower acceptance criteria, skip required verification, or claim completion because time is low.
- Do not force-return while an unmanaged mutation/child process is still running.
- Tests use injected clocks/short budgets and never sleep for 20 minutes.

---

### Task 1: Add the deadline context primitive

**Files:**
- Create: `src/deadline.ts`
- Create: `scripts/deadline-smoke.mjs`

**Interfaces:**
- Produces: `SYNC_CALL_DEADLINE_MS`, `SYNC_HANDOFF_RESERVE_MS`, `withSyncCallDeadline()`, `currentSyncCallDeadline()`, and `DeadlineBudget`.

- [ ] **Step 1: Write the deadline smoke first**

Assert the production constant is exactly `20 * 60_000`, an injected fake clock reports decreasing `remainingMs`, and `shouldYield()` becomes true only inside the handoff reserve. Also assert nested async work sees the same deadline context through `AsyncLocalStorage`.

Run: `node scripts/deadline-smoke.mjs`
Expected: FAIL because `src/deadline.ts` does not exist.

- [ ] **Step 2: Implement the minimal deadline module**

Use a shape equivalent to:

```ts
export const SYNC_CALL_DEADLINE_MS = 1_200_000;
export const SYNC_HANDOFF_RESERVE_MS = 60_000;
export class DeadlineBudget {
  remainingMs(): number;
  shouldYield(requiredMs?: number): boolean;
  childTimeoutMs(requestedMs: number, minimumMs?: number): number;
}
export function withSyncCallDeadline<T>(fn: () => Promise<T>, options?: TestClockOptions): Promise<T>;
export function currentSyncCallDeadline(): DeadlineBudget | undefined;
```

`childTimeoutMs()` must never return more than the remaining budget minus the handoff reserve. Production creation always uses the fixed 1,200,000 ms constant; only tests may inject a different clock/duration.

- [ ] **Step 3: Run the focused smoke**

Run: `node scripts/deadline-smoke.mjs`
Expected: PASS without real-time waiting.

### Task 2: Establish one deadline context per MCP tool dispatch

**Files:**
- Modify: `src/server.ts` around `registerWrappedToolCompat`
- Modify: `scripts/deadline-smoke.mjs`

**Interfaces:**
- Consumes: `withSyncCallDeadline()` from Task 1.
- Produces: every registered MCP tool handler executes inside exactly one deadline context.

- [ ] **Step 1: Extend the smoke with dispatch nesting**

Use a minimal registered test handler that reads `currentSyncCallDeadline()` and verifies the context exists for the handler and async descendants, while separate tool calls receive independent start/deadline timestamps.

- [ ] **Step 2: Wrap dispatch without forced cancellation**

Call the existing validated/tagged handler inside `withSyncCallDeadline`. Do not race the handler against a timer and do not kill work generically; cooperative yield is implemented by Plans 23/27 and async routing by Plans 24–26.

- [ ] **Step 3: Verify the shared MCP wrapper remains behavior-compatible**

Run: `node scripts/deadline-smoke.mjs`
Run: `node scripts/mcp-compat-smoke.mjs`
Run: `npm run build`
Expected: all PASS.

### Task 3: Document and lock the quality invariant

**Files:**
- Modify: `docs/agentic/DECISIONS.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after implementation is verified
- Modify: `SECURITY.md` if deadline cancellation/ownership behavior needs operator explanation

**Interfaces:**
- Produces: durable architecture decision that the deadline is transport-only and cannot reduce task quality.

- [ ] **Step 1: Record the exact invariant**

Document `1_200_000` ms as fixed. State that near-deadline work must yield to a durable continuation rather than skip scope, verification, review, or safety gates.

- [ ] **Step 2: Verify documentation and full shared behavior**

Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/deadline.ts src/server.ts scripts/deadline-smoke.mjs docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md SECURITY.md
git commit -m "feat: add exact synchronous call deadline"
```

## Acceptance Criteria

- Production deadline constant equals exactly 1,200,000 ms.
- A deadline context is available to every MCP handler without unsafe generic forced cancellation.
- Fake-clock tests prove remaining-budget and handoff behavior without long sleeps.
- Existing short tools retain their behavior and result shapes.
- Documentation explicitly forbids deadline-driven quality reduction.
