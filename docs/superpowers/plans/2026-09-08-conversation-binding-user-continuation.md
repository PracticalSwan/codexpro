# Conversation Binding and User-Gated Continuation Dispatch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind an armed continuation task to one exact ChatGPT conversation and let the user explicitly dispatch a fixed continuation message only when the page is safely ready.

**Architecture:** The extension reports only current route/capability state; the user presses **Bind this chat** to associate the active conversation with an armed task. When CodexPro later marks continuation ready, the user presses **Continue task**, and only then may the extension populate and submit the fixed message.

**Tech Stack:** Manifest V3 extension, narrow continuation bridge from Plan 30, continuation state from Plan 29, DOM capability adapter isolated in one extension module.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- No implicit active-tab binding.
- No conversation-text extraction or storage.
- No automatic message submission; every dispatch requires a contemporaneous explicit user authorization. Plan 32 implements the managed-browser **Continue task** source; Plan 37 later adds an authenticated Telegram inline-button source using the same one-shot authorization contract.
- Never click login, approval, safety, payment, publish, or other blocking controls.
- Wrong/ambiguous route or DOM capability must fail closed.

---

### Task 1: Add coarse ChatGPT DOM/page adapter

**Files:**
- Create: `browser-extension/chatgpt-adapter.js`
- Modify: `browser-extension/content.js`
- Create: `scripts/chatgpt-browser-adapter-smoke.mjs`

**Interfaces:**
- Produces `observeChatGptPage()` with only canonical route fingerprint, auth state, conversation-route-present/stable, composer-ready, streaming, generic platform state (`idle | busy | error | blocked | unknown`), blocking-interaction, and recent-user-input signals.
- [ ] **Step 1: Add failing adapter fixture tests**

Cover signed-out page, signed-in chat, new chat without stable route identity, active generation, composer unavailable, generic platform-busy/error/retry UI, blocking modal/approval-like UI, recent user typing, recognized user Stop-generating action, manual user-message submission, and unknown markup. Tests must prove message bodies/status text are not returned or persisted.

Run: `node scripts/chatgpt-browser-adapter-smoke.mjs`
Expected: FAIL because the adapter does not exist.

- [ ] **Step 2: Implement resilient capability probes**

Prefer stable route patterns, semantic element roles, accessible labels, and composer/send capability checks. Canonicalize benign URL decoration but require a stable opaque conversation identity before binding. Do not depend on generated CSS class names. Centralize all ChatGPT-specific DOM assumptions in this one adapter so UI breakage fails closed rather than spreading across the extension. Generic busy/error/retry states suppress dispatch; the adapter never clicks Retry, switches models, or dismisses safety/approval UI.

- [ ] **Step 3: Add recent-user-input and manual-submit suppression**

Track only local timestamps/events for composer activity. A send triggered without the extension's currently consumed `ContinuationDispatchAuthorization` is a manual user turn: notify the controller with reason `manual_message`, clear cached readiness/actions, and let the user's message submit normally. Do not intercept, delay, copy, hash, or record the typed text. A recognized Stop-generating click similarly reports `stop_generating`.

### Task 2: Implement explicit conversation binding

**Files:**
- Modify: `src/continuation/types.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `src/continuation/browserBridge.ts`
- Modify: `browser-extension/popup.js`
- Modify: `scripts/browser-continuation-smoke.mjs`

**Interfaces:**
- Adds a bounded conversation binding fingerprint and `Bind this chat` action; full private URLs remain extension-local where possible.

- [ ] **Step 1: Add wrong-chat and stale-binding tests**

Arm task A while chat X is open, bind only after explicit user action, then switch to chat Y and prove continuation is disabled. A new chat without stable identity cannot bind. Reloading/canonical URL decoration for chat X restores eligibility if the conversation identity is unchanged; a genuine identity change, branch/new-chat route, or lost extension-local route mapping requires explicit rebind. Cover multiple tabs showing X and require dispatch from the exact active bound tab at click time.

- [ ] **Step 2: Persist minimal binding metadata**

Store only a salted/opaque route fingerprint in CodexPro. The reconstructable canonical route needed to reopen/focus the chat stays in extension-local storage. CodexPro status output shows only bound/unbound and a short fingerprint suffix; it must not log the full conversation URL. If extension-local route state is lost, fail closed and require rebind rather than attempting to reconstruct private URLs from server state.

- [ ] **Step 3: Require explicit bind confirmation**

The popup must show the armed task title/short ID and a **Bind this chat** button. No background code may bind a chat merely because it is active.
### Task 3: Add user-gated continuation dispatch

**Files:**
- Modify: `browser-extension/chatgpt-adapter.js`
- Modify: `browser-extension/content.js`
- Modify: `browser-extension/popup.js`
- Modify: `src/continuation/ops.ts`
- Modify: `scripts/chatgpt-browser-adapter-smoke.mjs`

**Interfaces:**
- Consumes one fresh continuation nonce, current task revision/selected intent, and the fixed continuation template from the controller.
- Produces a source-neutral one-shot `ContinuationDispatchAuthorization` plus `continuation_dispatched` only after an allowed user authorization source and successful send-button activation. In Plan 32 the enabled source is `browser`; Plan 37 may add `telegram` without changing browser safety checks.

- [ ] **Step 1: Add dispatch precondition tests**

Reject dispatch when task is not continuation-ready, task revision is stale, nonce is stale/missing, wrong chat is active, signed out, response is streaming, platform state is not stable idle, composer/send control is unavailable, blocking interaction exists, `manualTurnPending`/user pause exists, transport is unavailable, or a dispatch is already awaiting acknowledgement. The user-click handler must fetch/consume the latest server revision+nonce immediately before DOM submission; stale popup state cannot authorize a send after completion/cancel/rebind.

- [ ] **Step 2: Implement the fixed message only**

The extension accepts no arbitrary message body from ChatGPT or page content. The controller supplies one versioned product template:

```text
Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.
```

- [ ] **Step 3: User click is the authorization boundary**

Only an active one-shot `ContinuationDispatchAuthorization` may call the content-script dispatch path. Plan 32 creates it only from the popup/button click handler; background polling, watchdog timers, page events, and MCP calls may prepare readiness but cannot create it. Plan 37 may create the same authorization from a validated paired-Telegram callback, still requiring immediate server/browser revalidation and one-shot consumption.

- [ ] **Step 4: Report dispatch outcome safely**

On success, emit nonce + task revision + server-received timestamp + route fingerprint only. On failure, return bounded reason codes such as `stale_revision`, `manual_turn_pending`, `wrong_chat`, `streaming`, `platform_busy`, `platform_error`, `composer_unavailable`, `transport_unavailable`, or `blocking_interaction`; never return DOM/message contents. Manual user message submission or a recognized Stop-generating click emits only an interaction event/timestamp, clears prepared readiness through the controller, and never captures what the user typed.
### Task 4: Verify and commit the milestone

- [ ] **Step 1: Run deterministic gates**

Run: `node scripts/chatgpt-browser-adapter-smoke.mjs`
Run: `node scripts/browser-continuation-smoke.mjs`
Run: `npm run build`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 2: Live disposable-chat verification**

After Plan 31 authentication is complete, create/use one disposable ChatGPT conversation in the managed profile, explicitly bind it, reach continuation-ready state, and have the user click **Continue task**. Verify the fixed message is sent once and only once. Do not inspect historical message content.

- [ ] **Step 3: Commit milestone**

```bash
git add browser-extension src/continuation scripts/chatgpt-browser-adapter-smoke.mjs scripts/browser-continuation-smoke.mjs
git commit -m "feat: add user-gated ChatGPT continuation dispatch"
```

## Acceptance Criteria

- An armed task targets one explicitly user-bound ChatGPT conversation.
- No active-tab heuristic can bind or dispatch to another conversation.
- Binding requires a stable canonical conversation identity; full private routes remain extension-local and stale/lost mappings require rebind.
- Manual user turns/Stop actions and generic ChatGPT busy/error/retry states invalidate or suppress prepared continuation without any automatic retry.
- A manual user prompt always wins the race against prepared browser/Telegram authorization; the extension records only the occurrence, and semantic resume/redirect/new-task decisions are deferred to `continuation_reconcile`.
- Plan 32 cannot submit without the user's current **Continue task** click; the source-neutral authorization contract may later accept Plan 37's paired Telegram click without enabling autonomous submission.
- Only the fixed continuation template is eligible for dispatch.
- Extension never extracts conversation/output text or clicks non-continuation controls.