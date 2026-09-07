# Configurable Synchronous Deadline and Quality Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every synchronous CodexPro MCP call one bounded, user-configurable wall-clock budget with a 20-minute default, while ensuring the budget can never pressure ChatGPT to reduce task quality.

**Architecture:** Add a focused deadline context module whose default is `1_200_000` ms but whose production duration comes from validated runtime config. Persist the setting per workspace profile, expose it through `codexpro settings` and the authenticated local profile editor, and propagate the resolved value into MCP dispatch. Do not use unsafe `Promise.race` cancellation that could leave mutations running after a response; later plans make long subsystems cooperatively yield or route async.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, existing profile/settings launcher, authenticated Express admin page, MCP registration wrapper, and smoke-test style.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Default synchronous deadline is exactly `1_200_000` ms (20:00).
- Supported configured range is 5–60 minutes (`300_000`–`3_600_000` ms).
- The effective deadline applies to one MCP invocation, never to the user's overall task or Goal.
- No handler may lower acceptance criteria, skip required verification/review, or claim completion because time is low.
- CodexPro does not detect or extend ChatGPT's external closure window; users choose a safe value below their known host limit.
- Saved website/profile changes apply on the next CodexPro launch and must not mutate an already-running process.
- Do not force-return while an unmanaged mutation/child process is still running.
- Tests use injected clocks/short budgets and never sleep for real minutes.

---

### Task 1: Add the configurable deadline primitive

**Files:**
- Create: `src/deadline.ts`
- Create: `scripts/deadline-smoke.mjs`

**Interfaces:**
- Produces: `DEFAULT_SYNC_CALL_DEADLINE_MS`, `MIN_SYNC_CALL_DEADLINE_MS`, `MAX_SYNC_CALL_DEADLINE_MS`, `normalizeSyncCallDeadlineMs()`, `withSyncCallDeadline()`, `currentSyncCallDeadline()`, and `DeadlineBudget`.

- [ ] **Step 1: Write the deadline smoke first**

Assert defaults/bounds are exactly 20/5/60 minutes, invalid values fail closed, an injected fake clock reports decreasing `remainingMs`, and nested async work sees the same context through `AsyncLocalStorage`.

Run: `node scripts/deadline-smoke.mjs`
Expected: FAIL because `src/deadline.ts` does not exist.

- [ ] **Step 2: Implement the minimal deadline module**

Use a shape equivalent to:

```ts
export const DEFAULT_SYNC_CALL_DEADLINE_MS = 1_200_000;
export const MIN_SYNC_CALL_DEADLINE_MS = 300_000;
export const MAX_SYNC_CALL_DEADLINE_MS = 3_600_000;
export function normalizeSyncCallDeadlineMs(value: unknown): number;
```
```ts
export class DeadlineBudget {
  readonly totalMs: number;
  remainingMs(): number;
  handoffReserveMs(): number;
  shouldYield(requiredMs?: number): boolean;
  childTimeoutMs(requestedMs: number, minimumMs?: number): number;
}
export function withSyncCallDeadline<T>(deadlineMs: number, fn: () => Promise<T>, options?: TestClockOptions): Promise<T>;
export function currentSyncCallDeadline(): DeadlineBudget | undefined;
```

Use a proportional reserve such as `min(60_000, max(15_000, floor(totalMs * 0.05)))`; at the 20-minute default this preserves the planned 60-second reserve. `childTimeoutMs()` must never exceed remaining budget minus reserve.

- [ ] **Step 3: Run the focused smoke**

Run: `node scripts/deadline-smoke.mjs`
Expected: PASS without real-time waiting.

### Task 2: Add the runtime configuration source of truth

**Files:**
- Modify: `src/config.ts`
- Modify: `src/server.ts` server-config response
- Modify: `scripts/deadline-smoke.mjs`

**Interfaces:**
- Adds `CodexProConfig.syncCallDeadlineMs: number`.
- Consumes `CODEXPRO_SYNC_CALL_DEADLINE_MS` with 20-minute fallback and 5–60 minute bounds.
- Exposes the effective runtime value through `server_config` so ChatGPT can reason from the actual current budget rather than assuming 20 minutes.

- [ ] **Step 1: Add config-boundary tests**

Assert missing config resolves to `1_200_000`, valid min/default/max values load exactly, and values outside `300_000..3_600_000` fail or clamp only according to one documented validator (prefer explicit rejection for CLI/admin/profile writes and bounded parsing for raw environment input).

- [ ] **Step 2: Wire config into MCP dispatch**

Wrap the existing validated/tagged handler with `withSyncCallDeadline(config.syncCallDeadlineMs, ...)`. Separate tool calls receive independent start timestamps but the same configured total unless the runtime itself is restarted with new settings.

- [ ] **Step 3: Verify runtime config behavior**

Run: `node scripts/deadline-smoke.mjs`
Run: `node scripts/mcp-compat-smoke.mjs`
Run: `npm run build`
Expected: PASS.

### Task 3: Persist and expose the deadline in CLI workspace settings

**Files:**
- Modify: `src/profileStore.ts`
- Modify: `scripts/codexpro.mjs`
- Modify: `scripts/settings-smoke.mjs`

**Interfaces:**
- Adds `WorkspaceProfile.syncCallDeadlineMs?: number` and `RuntimeConnection.syncCallDeadlineMs?: number`.
- Adds user-facing `--sync-call-deadline-minutes <5-60>` for `start`, `setup`, and `settings set`.
- `settings show` displays `Sync deadline` in minutes.
- Launcher precedence: explicit CLI minutes → `CODEXPRO_SYNC_CALL_DEADLINE_MS` → saved `syncCallDeadlineMs` → 20-minute default.

- [ ] **Step 1: Extend profile/settings persistence tests**

Save 12 minutes, verify the profile stores `720000`, `settings show` prints `12 min`, `settings use` copies the field, unrelated later `settings set` calls preserve it, and deleting/resetting the profile returns to the default.

- [ ] **Step 2: Add strict CLI validation and help**

Reject non-integer, `<5`, and `>60` minute values with actionable errors. Help text must say: default 20 minutes; choose a value below the observed/documented ChatGPT or MCP-host closure window; this setting does not change the external limit.

- [ ] **Step 3: Propagate the effective value to the child runtime**

The launcher must set `CODEXPRO_SYNC_CALL_DEADLINE_MS` for the spawned HTTP/MCP runtime and publish the effective value in its runtime-status record. Do not store an external ChatGPT timeout claim in the profile.

### Task 4: Add the authenticated local website setting

**Files:**
- Modify: `src/http.ts`
- Modify: `src/profileStore.ts`
- Modify: `scripts/http-smoke.mjs`

**Interfaces:**
- Adds admin form/API field `syncCallDeadlineMinutes` (integer 5–60) while profile storage remains `syncCallDeadlineMs`.
- Adds a **Synchronous tool deadline (minutes)** control under **Runtime policy**.
- GET/profile responses distinguish the saved next-run value from the currently running effective value.

- [ ] **Step 1: Add failing admin/UI assertions**

Assert the HTML includes the field, default 20, `min="5"`, `max="60"`, and explanatory text. POST 12 minutes must store `720000`; 4/61/non-integer values must return structured 400 responses.
- [ ] **Step 2: Implement one shared validation path**

Convert website minutes to internal milliseconds through the same bounds/constants used by runtime/CLI code. Do not create a different website-only range or hidden multiplier.

- [ ] **Step 3: Explain next-run semantics clearly**

The local page must say that saving changes the next launch only and does not change the running MCP server. It should recommend safety margin below the user's host cutoff and avoid claiming all ChatGPT users have the same timeout.

- [ ] **Step 4: Verify authenticated settings behavior**

Run: `node scripts/http-smoke.mjs`
Run: `node scripts/settings-smoke.mjs`
Expected: PASS with no token/profile-secret leakage.

### Task 5: Lock the quality invariant and complete shared verification

**Files:**
- Modify: `docs/agentic/DECISIONS.md`
- Modify: `README.md` / `FEATURES.md` only after runtime implementation is verified
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after implementation is verified

- [ ] **Step 1: Record the configuration invariant**

Document 20 minutes as the default rather than a universal constant. State that any configured value remains transport-only and cannot reduce task scope, review depth, verification, or safety gates.

- [ ] **Step 2: Run the shared behavior gate**

Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/deadline.ts src/config.ts src/server.ts src/profileStore.ts src/http.ts scripts/codexpro.mjs scripts/deadline-smoke.mjs scripts/settings-smoke.mjs scripts/http-smoke.mjs docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md README.md FEATURES.md
git commit -m "feat: add configurable synchronous call deadline"
```

## Task-aware browser continuation integration

Plan 22 remains transport-only. It must not depend on browser continuation being available. When Plans 29–36 are later enabled, their watchdog must consume the **current running** `syncCallDeadlineMs` from runtime/config status, never `DEFAULT_SYNC_CALL_DEADLINE_MS` or the saved next-run profile. A runtime restart/config-generation change resets inferred timing. Browser continuation does not change deadline semantics or auto-submit a new ChatGPT turn.

## Acceptance Criteria

- Default effective deadline is exactly 1,200,000 ms (20 minutes).
- Saved/launchable deadline is configurable from 5–60 minutes through CLI and authenticated local website using one validation contract.
- Profile storage uses `syncCallDeadlineMs`; user-facing settings use minutes.
- `server_config` and runtime status expose the current effective value without claiming knowledge of ChatGPT's external cutoff; downstream continuation consumers can distinguish that current value from saved next-run settings.
- Saved website changes apply only after restart/next launch; the current runtime is not mutated.
- A deadline context is available to every MCP handler without unsafe generic forced cancellation.
- Fake-clock tests prove remaining-budget and handoff behavior without long sleeps.
- Existing short tools retain behavior and result shapes.
- Documentation explicitly forbids deadline-driven quality reduction for every configured value.
