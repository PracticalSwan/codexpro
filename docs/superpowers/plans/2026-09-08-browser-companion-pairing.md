# Browser Companion Extension and Secure Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a least-privilege browser companion and loopback bridge that can report coarse ChatGPT page state and receive user-authorized continuation actions without exposing MCP authority.

**Architecture:** Reuse the existing HTTP runtime but add loopback-only `/continuation/v1/*` endpoints with a separate browser-client credential. Ship a small Manifest V3 extension with narrow ChatGPT/localhost permissions and no generic DOM-command interface.

**Tech Stack:** TypeScript/Express, WebExtension Manifest V3, plain browser JavaScript/HTML/CSS, existing profile/state helpers, Node smoke tests.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Bridge binds loopback only and is never exposed through OpenAI/Cloudflare/ngrok/Tailscale tunnels.
- Browser client credentials cannot authorize MCP, Bash, files, Git, Goals, or admin/profile APIs.
- Extension host scope is limited to `https://chatgpt.com/*` and the loopback bridge.
- No conversation/output extraction and no arbitrary selector/script execution endpoint.
- No automatic message submission.

---

### Task 1: Implement narrow continuation bridge authentication

**Files:**
- Create: `src/continuation/browserAuth.ts`
- Create: `src/continuation/browserBridge.ts`
- Create: `scripts/browser-continuation-smoke.mjs`
- Modify: `src/http.ts`

**Interfaces:**
- Produces one-time pairing codes, paired-client records, bearer verification, revocation, and loopback continuation routes.
- [ ] **Step 1: Write failing pairing/auth tests**

Assert an 8-character base32 pairing code expires after 5 minutes, allows at most 5 failed attempts, succeeds once, returns a random 32-byte browser credential, stores only a verifier/hash plus client metadata, and cannot be reused. Pairing a replacement client for the same managed profile revokes the previous client so one profile cannot create duplicate watchdog/notification actors.

Run: `node scripts/browser-continuation-smoke.mjs`
Expected: FAIL because browser continuation auth does not exist.

- [ ] **Step 2: Implement separate browser credential store**

Store paired-client metadata under the CodexPro state directory with restrictive permissions. Hash/verifier comparisons must be constant-time. Add explicit revoke and list-public-status operations; never return stored verifiers.

- [ ] **Step 3: Add loopback-only routes**

Routes include pairing, public task/status polling, heartbeat/page-state reporting, bind/dispatch event submission, and client revoke. Reject non-loopback requests even when the main HTTP server is publicly tunneled; validate loopback Host/origin expectations and do not enable permissive CORS that lets ordinary web pages call the bridge. The browser credential remains in the extension service worker/storage boundary and is never exposed to page JavaScript/content DOM. Add no route that accepts arbitrary MCP tool names, commands, selectors, or JavaScript.

### Task 2: Add Manifest V3 companion skeleton

**Files:**
- Create: `browser-extension/manifest.json`
- Create: `browser-extension/background.js`
- Create: `browser-extension/content.js`
- Create: `browser-extension/popup.html`
- Create: `browser-extension/popup.js`
- Create: `browser-extension/popup.css`
- Modify: `scripts/browser-continuation-smoke.mjs`

**Interfaces:**
- Extension stores only browser-client credential, bridge URL, paired-client ID, non-secret profile label, and local UI state in `chrome.storage.local`.

- [ ] **Step 1: Add static manifest/security assertions**

Assert Manifest V3, no wildcard host permissions, no `webRequestBlocking`, no `debugger`, no downloads/history/password permissions, and only required `storage`, `tabs`, and `notifications` capabilities.

- [ ] **Step 2: Implement background bridge polling**

Use authenticated `fetch` calls to loopback. Poll adaptively while an armed task exists; back off when idle/disconnected. If the bridge cannot be reached or authenticated, immediately mark companion state unavailable and disable/clear cached Bind/Continue actions until a fresh authenticated status response is received. Never include ChatGPT DOM/message text in requests.

- [ ] **Step 3: Implement minimal popup states**

Show paired/unpaired, browser auth state, armed task short ID/title, bound/unbound status, continuation-ready state, and explicit Pair/Bind/Continue buttons. Do not display full conversation URLs or account identity.
### Task 3: Pairing UX and extension install boundary

**Files:**
- Modify: `scripts/codexpro.mjs`
- Modify: `scripts/settings-smoke.mjs`
- Modify: `scripts/browser-continuation-smoke.mjs`

**Interfaces:**
- Adds `codexpro continuation browser pair` and public paired-client status output.

- [ ] **Step 1: Add CLI contract tests**

Verify pairing prints only the short-lived code, expiry, and instructions; it never prints the main MCP bearer, browser credential, or stored verifier.

- [ ] **Step 2: Add explicit manual extension-install gate**

During implementation/live setup, if the unpacked extension is not loaded in the managed profile, stop and instruct the user to load/approve it. Do not silently modify the user's normal browser profile or browser enterprise policy.

- [ ] **Step 3: Verify wrong-origin and revoked-client failures**

Run the bridge smoke with non-loopback/host/origin simulation, browser-page CSRF attempts, wrong/revoked credentials, expired code, replacement/duplicate pair, and extension-disconnected states. Prove ChatGPT page JavaScript cannot read the browser credential or call privileged bridge actions.

### Task 4: Package and commit the milestone

**Files:**
- Modify: `package.json` package file list
- Modify: `docs/agentic/PROJECT_MEMORY.md` after implementation

- [ ] **Step 1: Ensure extension files are included without browser state**

`npm pack --dry-run` must include the extension source/assets but exclude managed profiles, cookies, pairing records, `.playwright-cli`, screenshots, and browser caches.

- [ ] **Step 2: Run gates**

Run: `node scripts/browser-continuation-smoke.mjs`
Run: `node scripts/http-smoke.mjs`
Run: `npm run build`
Run: `npm audit --audit-level=high`
Run: `npm run release:pack`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/continuation/browserAuth.ts src/continuation/browserBridge.ts src/http.ts browser-extension scripts/browser-continuation-smoke.mjs scripts/codexpro.mjs scripts/settings-smoke.mjs package.json docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add paired browser continuation companion"
```

## Acceptance Criteria

- Browser companion has no MCP or arbitrary-command authority.
- Pairing is local, one-time, expiring, rate-limited, revocable, single-active-client-per-managed-profile, and separate from all existing CodexPro tokens.
- Extension permissions are narrowly scoped and no conversation content leaves the page.
- Bridge/auth loss immediately disables cached actionable controls; reconnect restores actions only from fresh authoritative task/revision state.
- Public tunnel traffic cannot reach continuation bridge endpoints.
- Extension artifacts package correctly while browser/session state never enters the package or repository.