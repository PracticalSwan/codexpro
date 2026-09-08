# Configurable Synchronous Deadline and Quality Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Enable tool-time awareness by default with a safe 20-minute bounded budget, while also providing an explicit Unlimited/observe-only discovery mode so users can measure their own ChatGPT tool window without ever turning that window into a task-quality target.

**Architecture:** Add a focused deadline context module whose normal default is bounded `1_200_000` ms and whose production mode/value come from validated runtime config; explicit observe mode keeps elapsed awareness without a cooperative cutoff. Persist the setting per workspace profile, expose it through `codexpro settings` and the authenticated local profile editor, and propagate the resolved value into MCP dispatch. Do not use unsafe `Promise.race` cancellation that could leave mutations running after a response; later plans make long subsystems cooperatively yield or route async.

**Tech Stack:** TypeScript, Node.js `AsyncLocalStorage`, existing profile/settings launcher, authenticated Express admin page, MCP registration wrapper, and smoke-test style.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Tool-time awareness is enabled by default. Normal mode is `bounded` with exactly `1_200_000` ms (20:00).
- Bounded values are 5–60 minutes (`300_000`–`3_600_000` ms); explicit `unlimited` selects `observe` mode and disables only CodexPro's cooperative cutoff, not diagnostics or conservative routing guidance.
- In bounded mode, the effective deadline applies to one MCP invocation, never to the user's overall task or Goal; observe mode has no CodexPro cooperative cutoff.
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
- Produces: `DEFAULT_SYNC_CALL_DEADLINE_MS`, `MIN_SYNC_CALL_DEADLINE_MS`, `MAX_SYNC_CALL_DEADLINE_MS`, `SyncCallDeadlineMode`, `normalizeSyncCallDeadlineConfig()`, `withSyncCallDeadline()`, `currentSyncCallDeadline()`, and `DeadlineBudget`.

- [x] **Step 1: Write the deadline smoke first**

Assert default mode/value are exactly `bounded`/20 minutes, finite bounds are 5/60 minutes, `unlimited` normalizes only to `observe`, invalid values fail closed, an injected fake clock reports decreasing `remainingMs` in bounded mode, observe mode reports elapsed time without deadline-yielding, and nested async work sees the same context through `AsyncLocalStorage`.

Run: `node scripts/deadline-smoke.mjs`
Expected: FAIL because `src/deadline.ts` does not exist.

- [x] **Step 2: Implement the minimal deadline module**

Use a shape equivalent to:

```ts
export const DEFAULT_SYNC_CALL_DEADLINE_MS = 1_200_000;
export const MIN_SYNC_CALL_DEADLINE_MS = 300_000;
export const MAX_SYNC_CALL_DEADLINE_MS = 3_600_000;
export type SyncCallDeadlineMode = "bounded" | "observe";
export function normalizeSyncCallDeadlineConfig(value: unknown): { mode: SyncCallDeadlineMode; deadlineMs: number };
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

- [x] **Step 3: Run the focused smoke**

Run: `node scripts/deadline-smoke.mjs`
Expected: PASS without real-time waiting.

### Task 2: Add the runtime configuration source of truth

**Files:**
- Modify: `src/config.ts`
- Modify: `src/server.ts` server-config response
- Modify: `scripts/deadline-smoke.mjs`

**Interfaces:**
- Adds `CodexProConfig.syncCallDeadlineMode: "bounded" | "observe"` and `syncCallDeadlineMs: number`.
- Consumes `CODEXPRO_SYNC_CALL_DEADLINE_MODE` plus `CODEXPRO_SYNC_CALL_DEADLINE_MS`, with `bounded`/20-minute fallback and 5–60 minute finite bounds.
- Exposes the effective runtime value through `server_config` so ChatGPT can reason from the actual current budget rather than assuming 20 minutes.

- [x] **Step 1: Add config-boundary tests**

Assert missing config resolves to `{ mode: "bounded", deadlineMs: 1_200_000 }`, valid min/default/max bounded values load exactly, explicit `unlimited`/`observe` loads observe mode while preserving the finite reference deadline, and invalid values fail only through one documented validator. Environment/profile/CLI precedence must never silently turn an invalid finite value into observe mode.

- [x] **Step 2: Wire config into MCP dispatch**

Wrap the existing validated/tagged handler with `withSyncCallDeadline(config.syncCallDeadlineMode, config.syncCallDeadlineMs, ...)`. Bounded calls receive independent start timestamps; observe-mode calls retain elapsed-time context but do not cooperatively yield on that deadline. Existing tool-specific/policy timeouts remain authoritative in both modes.

- [x] **Step 3: Verify runtime config behavior**

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
- Adds `WorkspaceProfile.syncCallDeadlineMode?: "bounded" | "observe"`, `syncCallDeadlineMs?: number`, and matching sanitized runtime-status fields.
- Adds user-facing `--sync-call-deadline-minutes <5-60|unlimited>` for `start`, `setup`, and `settings set`.
- `settings show` displays `Sync deadline` in minutes.
- Launcher precedence: explicit CLI mode/value → environment mode/value → saved mode/value → `bounded` 20-minute default. `unlimited` maps to `mode=observe`; it is never serialized as an arbitrarily huge millisecond value.

- [x] **Step 1: Extend profile/settings persistence tests**

Save 12 minutes and verify `mode=bounded` + `720000`; save `unlimited` and verify `mode=observe` without corrupting the finite reference value; `settings show` prints either `12 min` or `Unlimited (observe only)`; `settings use` copies both non-secret fields; unrelated settings preserve them; reset returns to bounded 20 minutes.

- [x] **Step 2: Add strict CLI validation and help**

Accept only integer `5..60` or the literal `unlimited`. Reject all other values. Help text must say: tool-time awareness is on by default; normal default is 20 minutes; ChatGPT does not publish one universal per-user MCP tool window; use `unlimited` only temporarily with the harmless probe to discover the host cutoff, then restore a bounded value below it; this setting cannot change the external limit.

- [x] **Step 3: Propagate the effective value to the child runtime**

The launcher must set `CODEXPRO_SYNC_CALL_DEADLINE_MS` for the spawned HTTP/MCP runtime and publish the effective value in its runtime-status record. Do not store an external ChatGPT timeout claim in the profile.

### Task 4: Add the authenticated local website setting

**Files:**
- Modify: `src/http.ts`
- Modify: `src/profileStore.ts`
- Modify: `scripts/http-smoke.mjs`

**Interfaces:**
- Adds admin form/API fields for `syncCallDeadlineMode` and `syncCallDeadlineMinutes` (integer 5–60 when bounded); profile storage remains mode + milliseconds.
- Adds a **Synchronous tool deadline** control under **Runtime policy** with finite 5–60 values plus **Unlimited (observe only)**.
- GET/profile responses distinguish the saved next-run value from the currently running effective value.

- [x] **Step 1: Add failing admin/UI assertions**

Assert the HTML defaults to bounded 20, finite input enforces 5–60, and an explicit Unlimited/observe option is present with warning copy. POST 12 stores bounded/720000; Unlimited stores observe mode; 4/61/non-integer finite values return structured 400 responses.
- [x] **Step 2: Implement one shared validation path**

Convert website minutes to internal milliseconds through the same bounds/constants used by runtime/CLI code. Do not create a different website-only range or hidden multiplier.

- [x] **Step 3: Explain next-run semantics clearly**

The local page must say that saving changes the next launch only and does not change the running MCP server. It should recommend safety margin below the user's host cutoff, avoid claiming all ChatGPT users have the same timeout, and warn that Unlimited/observe is for temporary harmless measurement rather than ordinary mutating work.

- [x] **Step 4: Verify authenticated settings behavior**

Run: `node scripts/http-smoke.mjs`
Run: `node scripts/settings-smoke.mjs`
Expected: PASS with no token/profile-secret leakage.

### Task 5: Lock the quality invariant and complete shared verification

**Files:**
- Modify: `docs/agentic/DECISIONS.md`
- Modify: `README.md` / `FEATURES.md` only after runtime implementation is verified
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after implementation is verified

- [x] **Step 1: Record the configuration invariant**

Document bounded 20 minutes as the normal default rather than a universal host constant. Tool-time awareness remains active by default in both bounded and observe modes. State that finite deadlines and observe mode cannot reduce task scope, review depth, verification, or safety gates.

- [x] **Step 2: Run the shared behavior gate**

Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [x] **Step 3: Commit milestone**

```bash
git add src/deadline.ts src/config.ts src/server.ts src/profileStore.ts src/http.ts scripts/codexpro.mjs scripts/deadline-smoke.mjs scripts/settings-smoke.mjs scripts/http-smoke.mjs docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md README.md FEATURES.md
git commit -m "feat: add configurable synchronous call deadline"
```

## Task-aware browser continuation integration

Plan 22 remains transport-only. It must not depend on browser continuation being available. When Plans 29–37 are later enabled, their watchdog must consume the **current running** `syncCallDeadlineMs` from runtime/config status, never `DEFAULT_SYNC_CALL_DEADLINE_MS` or the saved next-run profile. A runtime restart/config-generation change resets inferred timing. Browser continuation does not change deadline semantics or auto-submit a new ChatGPT turn.

## Acceptance Criteria

- Default tool-time mode is bounded with exactly 1,200,000 ms (20 minutes); awareness does not depend on continuation being enabled.
- Saved/launchable configuration accepts bounded 5–60 minutes or explicit Unlimited/observe through CLI and authenticated local website using one validation contract.
- Profile/runtime storage carries `syncCallDeadlineMode` plus `syncCallDeadlineMs`; user-facing settings use minutes or the literal Unlimited/observe option.
- `server_config` and runtime status expose the current effective value without claiming knowledge of ChatGPT's external cutoff; downstream continuation consumers can distinguish that current value from saved next-run settings.
- Saved website changes apply only after restart/next launch; the current runtime is not mutated.
- A deadline context is available to every MCP handler without unsafe generic forced cancellation.
- Fake-clock tests prove remaining-budget and handoff behavior without long sleeps.
- Existing short tools retain behavior and result shapes.
- Documentation explicitly forbids deadline-driven quality reduction for every configured value.
- Unlimited/observe mode is clearly labeled as temporary host-window discovery, retains elapsed-time diagnostics/conservative routing, and never silently changes the user's saved finite safety margin.
