# Managed Browser Authentication and Durable State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Provide a CodexPro-managed Chrome/Edge profile whose ChatGPT sign-in state persists across continuation sessions without CodexPro handling user credentials.

**Architecture:** Launch an installed system Chrome or Edge with a dedicated user-data directory under the CodexPro state directory and the unpacked continuation extension. Browser-owned cookies/session data stay inside that profile; CodexPro records only profile metadata and coarse auth health.

**Tech Stack:** Node child-process launcher, installed Chrome/Edge, Manifest V3 extension from Plan 30, existing platform/runtime helpers.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Never automate username/password, CAPTCHA, passkey, email code, or 2FA entry.
- Never ask the user to paste credentials or verification codes into ChatGPT/terminal.
- Default uses a dedicated profile; version 1 does not attach to/copy the normal user browser profile.
- Browser profile/state is sensitive local data and must never be committed, packaged, logged, or exposed through MCP.
- Implementation live-auth verification has a mandatory STOP-for-user-auth gate.

---

### Task 1: Add managed browser profile metadata and executable discovery

**Files:**
- Create: `src/continuation/browserProfile.ts`
- Create: `scripts/browser-profile-smoke.mjs`

**Interfaces:**
- Produces `resolveManagedBrowserProfile()`, `discoverBrowserExecutable()`, `browserProfileStatus()`, and sanitized public profile metadata.
- [x] **Step 1: Add failing discovery/path tests**

Cover Windows Chrome/Edge discovery, explicit executable override, unsupported/missing browser failure, profile-label sanitization, state-directory containment, and rejection of paths inside a source workspace.

Run: `node scripts/browser-profile-smoke.mjs`
Expected: FAIL because managed-browser helpers do not exist.

- [x] **Step 2: Implement dedicated profile resolution**

Use a path equivalent to `~/.codexpro/browser/chatgpt/<profile-id>/user-data`. Create only the required parent directory with restrictive local permissions. Public status returns browser kind, profile label, running/not-running, paired/not-paired, and auth-state enum—not cookies, account email, or profile contents.

- [x] **Step 3: Verify no primary-profile discovery/copy exists**

Add an assertion that implementation never searches for or imports the user's normal Chrome/Edge `User Data` directory.

### Task 2: Add managed-browser launcher and lifecycle ownership

**Files:**
- Create: `src/continuation/browserLauncher.ts`
- Modify: `scripts/browser-profile-smoke.mjs`
- Modify: `scripts/codexpro.mjs`

**Interfaces:**
- Adds `codexpro continuation browser open|status|auth` using the configured dedicated profile.

- [x] **Step 1: Add launcher argument tests**

Assert launch uses the dedicated `--user-data-dir`, opens `https://chatgpt.com/`, and never enables remote-debugging, disables browser security, or reuses a personal profile path. For branded Chrome/Edge builds that no longer honor command-line unpacked-extension loading, use the browser-supported manual **Load unpacked** flow inside the dedicated profile; synthetic/non-branded test launchers may opt into command-line extension loading explicitly. Browser crash/update/extension-unload states must degrade to `unknown/unavailable` rather than silently recreating trust or switching to another profile.

- [x] **Step 2: Implement owned-process metadata**

Track only the browser process CodexPro launches. Do not kill unrelated Chrome/Edge processes. A normal `browser open` reuses/focuses the managed instance when possible; browser process termination remains an explicit user action.

- [x] **Step 3: Verify restart durability**

Use a fixture profile marker to prove closing/reopening the managed browser preserves the same profile directory and extension-local state without CodexPro copying browser data.
### Task 3: Implement coarse ChatGPT authentication health

**Files:**
- Modify: `browser-extension/content.js`
- Modify: `browser-extension/background.js`
- Modify: `src/continuation/browserBridge.ts`
- Modify: `scripts/browser-profile-smoke.mjs`

**Interfaces:**
- Produces auth states `unknown | signed_out | signed_in | authentication_required | ambiguous` using URL/UI capability signals only.

- [x] **Step 1: Add signed-in/signed-out fixture assertions**

Use synthetic page-state fixtures. Detect sign-out/login state and signed-in composer availability without reading message bodies, account name, email, or conversation content.

- [x] **Step 2: Fail closed on ambiguity**

If ChatGPT markup changes and neither auth state can be established safely, report `ambiguous`, suppress bind/continue actions, and require user inspection. A browser/extension reconnect must fetch fresh server task/revision state before restoring any controls; extension-local cached readiness is never authoritative.

### Task 4: Mandatory live authentication stop gate

**Files:**
- Modify: `docs/agentic/DEVELOPMENT_WORKFLOW.md`
- Modify: `scripts/browser-profile-smoke.mjs` only for pre/post-auth probes

- [x] **Step 1: Reach the manual-auth boundary**

After the launcher/extension/pairing implementation is locally verified, run the managed browser auth command for the disposable/selected browser profile.

- [x] **Step 2: STOP for user authentication**

**MANDATORY:** stop all implementation/live-browser execution and report exactly that the workflow is waiting for user authentication. Tell the user to sign in to ChatGPT directly in the managed browser, complete any provider login, CAPTCHA, passkey, email confirmation, or 2FA, and then send `continue` in the controlling ChatGPT conversation.

Do not request credentials/codes, do not inspect keystrokes, do not take screenshots while credentials are entered, and do not continue automatically.

- [x] **Step 3: Resume only after user's `continue`**

On the next user turn, recover repository/process state first. Verify only that the managed browser/extension reports `signed_in`; do not read account identity or historical conversation content.

- [x] **Step 4: Verify session persistence**

Close/reopen only the managed browser if the test scope explicitly authorizes that action, then confirm coarse auth health remains `signed_in`. If browser closure is not authorized, use non-destructive profile/status evidence and leave this live persistence check pending.
### Task 5: Verify and commit the milestone

- [x] **Step 1: Run non-secret gates**

Run: `node scripts/browser-profile-smoke.mjs`
Run: `node scripts/browser-continuation-smoke.mjs`
Run: `npm run build`
Run: `git diff --check`
Expected: PASS.

- [x] **Step 2: Inspect privacy artifacts**

Confirm `git status`, package dry-run, and logs contain no managed-browser profile directories, cookies, login screenshots, account identity, or extension client credential.

- [x] **Step 3: Commit milestone**

```bash
git add src/continuation/browserProfile.ts src/continuation/browserLauncher.ts src/continuation/browserBridge.ts browser-extension scripts/browser-profile-smoke.mjs scripts/codexpro.mjs docs/agentic/DEVELOPMENT_WORKFLOW.md
git commit -m "feat: add durable managed ChatGPT browser state"
```

## Acceptance Criteria

- Dedicated managed Chrome/Edge state persists independently from CodexPro task records.
- User credentials are entered only into ChatGPT/browser-controlled UI and are never visible to CodexPro/ChatGPT implementation logic.
- Implementation stops at authentication and resumes only after the user's explicit `continue`.
- Session expiry disables continuation and requires the same manual sign-in flow.
- Browser crash/update/reload or missing extension state fails closed and cannot resurrect stale continuation authorization.
- Version 1 never copies or controls the user's normal browser profile.