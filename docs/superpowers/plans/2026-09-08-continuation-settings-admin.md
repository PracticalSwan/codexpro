# Continuation Settings, CLI, and Admin UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose safe opt-in browser-continuation configuration and live status through existing CodexPro CLI/profile/admin surfaces without mixing browser credentials into workspace profiles.

**Architecture:** Extend the existing workspace profile for non-secret next-run defaults and the authenticated local admin page for operator controls. Browser pairing/auth/session data remain in dedicated continuation/browser state stores.

**Tech Stack:** Existing `scripts/codexpro.mjs`, `src/profileStore.ts`, `src/http.ts`, settings/admin smokes.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Continuation defaults off globally. Tool-time awareness remains on independently. Telegram defaults off and is not configured/started unless continuation itself is enabled.
- Profile settings are non-secret and apply next launch unless explicitly documented as live continuation-state controls.
- Pairing credentials, cookies, account identity, and full conversation URLs never enter workspace profiles.
- Disarm/cancel is always available and takes effect immediately on current continuation state.
- No setting enables automatic message submission in version 1.

---

### Task 1: Extend profile/config contracts

**Files:**
- Modify: `src/profileStore.ts`
- Modify: `src/config.ts`
- Modify: `scripts/settings-smoke.mjs`

**Interfaces:**
- Adds `continuationEnabled`, `continuationBrowser`, `continuationProfile`, `continuationCooldownMs`, `continuationMaxDispatches`, `continuationUnexpectedGraceMs`, `continuationNotificationsEnabled`, and preserves Plan 37's `continuationTelegramEnabled` when present.
- [x] **Step 1: Add failing profile/default tests**

Assert defaults: continuation off, Telegram off, browser `chrome`, profile `default`, cooldown 60,000 ms, max dispatches 20, unexpected-interruption grace 120,000 ms, notifications on. With continuation off, browser auth/pair/watchdog and Telegram setup/worker report disabled/not-required rather than prompting setup. Tool-time settings remain available. Validate bounded profile label and supported browser choices.

Run: `node scripts/settings-smoke.mjs`
Expected: FAIL until fields are implemented.

- [x] **Step 2: Add strict validation**

Use one shared validator for CLI/admin/profile persistence. Reject invalid browser names, unsafe profile labels/paths, cooldown below 10 seconds or above 10 minutes, max dispatches outside 1–100, and grace outside 30 seconds–10 minutes.

- [x] **Step 3: Preserve unrelated settings**

Changing deadline/tunnel/bash/profile settings must preserve continuation fields and vice versa. `settings use` copies only non-secret continuation preferences, never paired-client or browser session state.

### Task 2: Add CLI commands and status

**Files:**
- Modify: `scripts/codexpro.mjs`
- Modify: `scripts/settings-smoke.mjs`
- Modify: `scripts/browser-profile-smoke.mjs`

**Interfaces:**
- Adds `codexpro continuation status`, `arm-status`, `disarm`, `browser status|open|auth|pair`, plus `codexpro settings set --continuation enabled|disabled` for the next-run profile default. Browser setup requiring continuation fails clearly while disabled; Plan 37 Telegram setup does the same.

- [x] **Step 1: Add help/parse tests**

Verify clear command help, no secrets in output, exact next-run/live-state distinction, and failure when browser continuation is disabled but a browser action requiring enablement is requested.

- [x] **Step 2: Add safe public status**

Show task state/revision, task short ID/title, current phase, remaining-work count, paired-browser status, auth enum, bound/unbound, continuation-ready, dispatch count, **current runtime deadline**, saved next-run deadline when different, runtime/transport availability, and whether local durable work is active. Never print full conversation URL, account identity, cookies, browser-client token, or main MCP token. If no current runtime snapshot exists, show transport unavailable rather than substituting the 20-minute default.

**Plan boundary:** Plan 34 reports durable-work status truthfully as `unknown until runtime integration (Plan 35)`. Canonical proc/job/batch/Goal aggregation is intentionally implemented in Plan 35 so this milestone does not duplicate those stores or infer from OS-wide process state.

- [x] **Step 3: Add immediate disarm**

`codexpro continuation disarm --task <id>` cancels only continuation automation state; it does not kill proc/job/Goal work, browser processes, CodexPro runtime, or Git operations. The terminal revision must invalidate outstanding nonce/readiness and cause the paired companion to clear any badge/notification/button on its next authoritative-state refresh.

- [x] **Step 4: Add explicit managed-profile clear/revoke**

`codexpro continuation browser clear-profile --profile <label> --yes` is a destructive privacy operation: require explicit `--yes`, resolve the exact managed profile under the CodexPro browser-state root, refuse while that managed browser is running, revoke its paired browser client, and delete only that selected managed profile. Never touch normal Chrome/Edge profiles or other managed profiles.
### Task 3: Add authenticated local admin controls

**Files:**
- Modify: `src/http.ts`
- Modify: `scripts/http-smoke.mjs`

**Interfaces:**
- Adds a **Task continuation** section beside existing runtime/profile controls.

- [x] **Step 1: Add HTML/API contract assertions**

Require a clearly labeled **Enable task continuation** toggle defaulting off, browser/profile selectors and tuning fields shown/enabled only when relevant, paired/auth/bound live status, active task revision/summary, current-runtime vs saved-next-run tool-time mode/deadline, transport availability, and immediate Disarm/Revoke browser controls. Telegram controls are hidden/disabled with `Requires task continuation` while continuation is off. No auto-send or auto-reconnect-tunnel option is present.

- [x] **Step 2: Separate saved defaults from current state**

Clearly label profile fields as next-run defaults. Live task disarm, browser-client revoke, and continuation-state actions use separate authenticated endpoints and do not rewrite the running server configuration.

- [x] **Step 3: Redact sensitive browser state**

Admin HTML/JSON must never include browser client credentials, cookie values, account email/name, full conversation URL, message text, or browser profile file listings.

### Task 4: Verify and commit the milestone

- [x] **Step 1: Run focused settings/admin gates**

Run: `node scripts/settings-smoke.mjs`
Run: `node scripts/http-smoke.mjs`
Run: `node scripts/browser-profile-smoke.mjs`
Run: `npm run build`
Run: `git diff --check`
Expected: PASS.

- [x] **Step 2: Commit milestone**

```bash
git add src/profileStore.ts src/config.ts src/http.ts scripts/codexpro.mjs scripts/settings-smoke.mjs scripts/http-smoke.mjs scripts/browser-profile-smoke.mjs
git commit -m "feat: add continuation controls and settings"
```

## Acceptance Criteria

- Continuation is opt-in and cannot be enabled accidentally by unrelated settings changes.
- CLI/admin distinguish saved defaults from live task/browser state.
- Immediate disarm/revoke controls are available without stopping CodexPro.
- No secret browser/auth/conversation data is exposed through profiles, CLI, or admin page.
- Version 1 exposes no automatic-send setting.
- Continuation can remain disabled permanently without disabling default tool-time awareness or durable long-work primitives; Telegram setup is skipped entirely in that state.