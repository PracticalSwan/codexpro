# Telegram Remote Continuation Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Telegram Bot control surface that notifies the paired user when continuation is ready and lets one explicit inline-button click authorize exactly one default or focused continuation action.

**Architecture:** Use the official Telegram Bot API over outbound HTTPS long polling; do not add a public webhook. A dedicated bot token lives in protected per-user secret storage, one private Telegram user/chat is paired by a short-lived code, and callback buttons carry only opaque action tokens. Telegram never owns task semantics: CodexPro validates task revision/nonce/intent, browser/transport safety, and one-shot authorization immediately before the managed browser submits the fixed continuation template.

**Tech Stack:** Existing CodexPro TypeScript/Node runtime, Telegram Bot API HTTPS methods (`getMe`, `getUpdates`, `sendMessage`, `editMessageText`/`editMessageReplyMarkup`, `answerCallbackQuery`), continuation/browser modules from Plans 29–35, existing protected-secret patterns.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`


> **Execution status (2026-09-10):** Tasks 1?6 are implemented and deterministically verified. Live private-bot QA has now passed one focused **Maintenance** authorization and one default **Continue** authorization into the explicitly bound managed-browser conversation, each exactly once. Live QA also exposed and fixed retry-burning, duplicate browser-snapshot authority, explicit ready-state rebind, five-hour action availability, duplicate Telegram notification churn, and current ChatGPT **Stop generating** selector coverage. Task 7 is verified: the terminal stale-button callback returned **Expired** with no third dispatch, and this milestone commit records the completed Plan 37 scope; the protected 8787 runtime remained outside the disposable test lifecycle.

## Global Constraints

- Telegram is optional and disabled by default. It is not initialized, paired, polled, or requested unless `continuationEnabled=true` **and** `continuationTelegramEnabled=true`; browser **Continue task** remains a fallback authorization surface when continuation is enabled.
- Version 1 supports one paired private Telegram user/chat per CodexPro installation; groups/channels are ignored.
- The Telegram button click is a contemporaneous human authorization, not autonomous continuation. It authorizes at most one current task revision/nonce/intent.
- No callback may bypass current transport, browser auth, bound-chat, page-idle, terminal-state, user-pause, or durable-work safety predicates.
- Bot token, Telegram API request URLs containing the token, callback credentials, and private identifiers never enter Git, workspace profiles, logs, telemetry, MCP results, or test reports.
- Telegram messages never contain full paths, conversation URLs, prompts, output text, credentials, or unrestricted remaining-work text.
- Do not implement arbitrary remote commands, arbitrary ChatGPT message bodies, Telegram group control, Mini Apps, or webhooks in version 1.
- Do not auto-start/restart CodexPro, its tunnel, browser, or Telegram worker after an explicit user stop.

---

### Task 1: Add protected Telegram bot-token storage and API client

**Files:**
- Create: `src/continuation/telegramClient.ts`
- Create: `src/continuation/telegramSecrets.ts`
- Create: `scripts/telegram-continuation-smoke.mjs`
- Modify: `scripts/codexpro.mjs`

**Interfaces:**
- Produces `TelegramBotApiClient`, `resolveTelegramBotToken()`, `saveTelegramBotToken()`, `clearTelegramBotToken()`, and sanitized bot-health metadata.
- Uses the same secret-storage discipline as the OpenAI runtime-key workflow but a distinct secret path such as `~/.codexpro/secrets/telegram-bot-token`.

- [x] **Step 1: Write failing token/API tests**

Use a local fake HTTP adapter, never the real Telegram service. Assert token precedence is explicit environment override (if supported) then protected file; workspace profiles never contain the token; error/redaction output cannot reveal a token embedded in the Bot API URL.

Run: `node scripts/telegram-continuation-smoke.mjs`
Expected: FAIL because Telegram modules do not exist.

- [x] **Step 2: Implement the minimal Bot API client**

Centralize requests in one client that validates Bot API `{ ok, result, description, parameters }` envelopes, applies request timeouts, redacts the token-bearing URL from errors, and exposes only the Telegram methods required by this plan. Honor `parameters.retry_after` for flood-control responses rather than hard-coding Telegram rate limits.

- [x] **Step 3: Add masked local token commands**

Plan commands: `codexpro continuation telegram token save|status|clear`. `save` accepts the token only from a masked local prompt or explicit environment source; never from a command-line argument that would leak into shell history/process listings. `clear` requires explicit confirmation.

### Task 2: Implement BotFather/user pairing with mandatory user setup stops

**Files:**
- Modify: `src/continuation/telegramClient.ts`
- Create: `src/continuation/telegramPairing.ts`
- Modify: `scripts/codexpro.mjs`
- Modify: `scripts/telegram-continuation-smoke.mjs`
- Modify: `docs/agentic/DEVELOPMENT_WORKFLOW.md`

**Interfaces:**
- Produces a one-time pairing record, `getMe` bot identity check, and one paired `{ telegramUserId, privateChatId, botId }` record with no username/name persistence.
- Pairing code is random, single-use, expires after 5 minutes, and is suitable for a Telegram `/start` deep-link parameter.

- [x] **Step 1: Add pairing and identity tests**

Assert only a private-chat update from the user who presents the live pairing code can claim it. Reject groups/channels, expired/reused codes, changed bot identity, wrong user/chat, and duplicate pairing. Store numeric IDs safely without 32-bit truncation.

- [x] **Step 2: Add the BotFather/token hard stop**

Only after continuation and Telegram have both been explicitly enabled: if no valid token exists during implementation/setup, report `WAITING_FOR_TELEGRAM_BOT_TOKEN` and **STOP**. Guide the user to create a dedicated bot with `@BotFather`, then run the masked local `codexpro continuation telegram token save` command themselves. Never ask them to paste the token into ChatGPT. Resume only after the user sends `continue`.

- [x] **Step 3: Add the `/start` pairing hard stop**

After `getMe` succeeds, generate `codexpro continuation telegram pair` output containing the bot username and a short-lived `https://t.me/<bot>?start=<opaque-code>` link. Report `WAITING_FOR_TELEGRAM_PAIR` and **STOP** while the user opens the bot and presses **Start**. Resume only after the user sends `continue`, then verify the paired private chat from canonical local state.

### Task 3: Add outbound long-poll update worker and ownership safeguards

**Files:**
- Create: `src/continuation/telegramWorker.ts`
- Modify: `src/continuation/telegramClient.ts`
- Modify: `scripts/telegram-continuation-smoke.mjs`

**Interfaces:**
- Uses `getUpdates` long polling with only `message` and `callback_query` updates, a persisted update offset, bounded reconnect backoff, and one local worker owner for the configured bot.
- Telegram worker lifecycle is subordinate to the running CodexPro runtime. It does not keep CodexPro alive and does not restart the runtime/tunnel after user shutdown.

- [x] **Step 1: Test webhook/update-mode conflict**

Call `getWebhookInfo` during setup/doctor. If a webhook is configured, fail closed with instructions to use a dedicated bot or explicitly remove the webhook outside this feature; do not silently delete another integration. Verify long polling is never started while a webhook is active.

- [x] **Step 2: Implement condition-based long polling**

Use a positive Bot API long-poll timeout and persist `highest_update_id + 1` only after an update is safely classified/handled. On network failure, back off with a bounded exponential policy and Telegram `retry_after` when supplied. Do not busy-poll.

- [x] **Step 3: Make stale/backlogged updates harmless**

Telegram may retain unconsumed updates for up to 24 hours. Every callback/message handler must still validate pairing, action expiry, current task revision, and current nonce. A callback received after restart/offline time can never reconstruct or authorize stale continuation state.

- [x] **Step 4: Guard duplicate consumers**

Use a local ownership/lease record so two CodexPro processes on the same machine do not long-poll the same bot concurrently. `telegram doctor` warns that the bot should be dedicated to one active CodexPro installation because another machine using the same token cannot be reliably detected locally.

### Task 4: Render continuation notifications and opaque inline actions

**Files:**
- Create: `src/continuation/telegramNotifications.ts`
- Modify: `src/continuation/types.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `scripts/telegram-continuation-smoke.mjs`

**Interfaces:**
- Creates at most one active Telegram notification message per semantic continuation opportunity and up to four buttons: default continuation plus up to three safe focused intents registered in current continuation state. Revision/nonce churn caused by temporary browser unreadiness refreshes that message's keyboard in place instead of sending duplicate notices.
- `callback_data` contains only an opaque server-side action token and is explicitly constrained to Telegram's 1–64 byte Bot API limit; it does not embed task IDs, work text, intent labels, or secrets.

- [x] **Step 1: Add continuation-intent contracts**

Extend Plan 29's record contract with bounded `ContinuationIntent` entries: opaque ID, versioned template key, sanitized display label, optional opaque focus reference, and task revision. Provide a default `resume_all` intent. Focused intents may reference only work already recorded as remaining; they cannot expand task scope or contain arbitrary message bodies.

- [x] **Step 2: Add privacy-safe Telegram rendering tests**

Default Telegram message shows only a short task ID, coarse current phase/status, and buttons. Focused button labels are bounded/sanitized (for example **Maintenance**, **Verification**, **Documentation**) and never include full file paths, URLs, prompts, outputs, emails, token-like strings, or unrestricted remaining-work text.

- [x] **Step 3: Add action-token lifecycle**

Action tokens are random, server-side, bound to exact paired user/chat + task revision + continuation nonce + intent, and remain available for at most five hours. Completion/cancel/rebind/new revision **or any manual user-message/Stop event** invalidates those exact tokens. If the same semantic continuation opportunity becomes ready again after temporary browser unreadiness, CodexPro replaces the existing Telegram message keyboard with fresh revision/nonce-bound actions instead of sending another message. Best-effort edit/removal of stale Telegram keyboards improves UX, but server rejection remains authoritative if Telegram message editing fails.

### Task 5: Treat Telegram callback as one-shot remote user authorization

**Files:**
- Modify: `src/continuation/telegramWorker.ts`
- Modify: `src/continuation/telegramNotifications.ts`
- Modify: `src/continuation/ops.ts`
- Modify: `src/continuation/browserBridge.ts`
- Modify: `browser-extension/background.js`
- Modify: `scripts/telegram-continuation-smoke.mjs`
- Modify: `scripts/browser-continuation-smoke.mjs`

**Interfaces:**
- Adds a source-neutral `ContinuationDispatchAuthorization` bound to `source = browser | telegram`, current task revision, nonce, selected intent, and short expiry.
- The managed browser consumes an authorization only after re-checking the exact bound conversation and all existing page/auth/transport safety predicates.

- [x] **Step 1: Acknowledge callback queries promptly**

For every legitimate or rejected inline callback, call `answerCallbackQuery` promptly so Telegram clears the client progress indicator. The callback response may say `Request received`, `Expired`, `Task already completed`, or `Browser not ready`; it must not expose private state.

- [x] **Step 2: Validate the remote authorization at every layer**

Require the exact paired Telegram user ID/private chat ID, valid opaque action token, current task revision, current continuation nonce, non-terminal task, current transport ready, browser paired/signed-in/bound, no `manualTurnPending`/user pause, and no productive durable work. A stale callback, copied button, forwarded bot message, or replayed update cannot authorize anything.

- [x] **Step 3: Keep authorization contemporaneous and one-shot**

A successful Telegram click creates a short-lived dispatch authorization (target: no more than 30 seconds). The browser extension must fetch and atomically consume it immediately before submission. If the page becomes busy/wrong/signed-out or the authorization expires, no send occurs and there is no automatic retry; the user receives/refetches a fresh Telegram action later.

- [x] **Step 4: Support focused continuation without arbitrary remote prompts**

The browser always submits a versioned fixed product message. For a focused Telegram action, CodexPro stores `selectedContinuationIntentId`; the next ChatGPT turn recovers that intent through `continuation_status` and focuses the referenced remaining work first while preserving the original task and acceptance criteria. Telegram never supplies an arbitrary ChatGPT prompt body.

### Task 6: Add Telegram status, revocation, and admin controls

**Files:**
- Modify: `scripts/codexpro.mjs`
- Modify: `src/http.ts`
- Modify: `src/diagnosticsOps.ts`
- Modify: `scripts/settings-smoke.mjs`
- Modify: `scripts/http-smoke.mjs`
- Modify: `scripts/telegram-continuation-smoke.mjs`

**Interfaces:**
- Adds `codexpro continuation telegram setup|status|pair|test|doctor|disable|revoke` plus authenticated local-admin status/controls.
- Workspace profile stores only non-secret enable/preference fields; bot token and paired Telegram IDs live in dedicated protected user state.

- [x] **Step 1: Define non-secret settings**

Add only `continuationTelegramEnabled` and notification preferences needed for UX. `continuationTelegramEnabled` defaults false and cannot become operational while `continuationEnabled=false`; CLI/admin explain the dependency instead of starting setup. Do not store bot token, Telegram user/chat IDs, bot API URLs, callback tokens, or pending action records in workspace profiles. Settings changes must preserve deadline/browser continuation fields and vice versa.

- [x] **Step 2: Add truthful status/doctor output**

Report enabled/disabled, token configured yes/no, bot identity short/sanitized, paired yes/no, worker state, webhook-conflict yes/no, last successful Bot API contact time, and notification availability. Redact numeric user/chat IDs by default and never print the token.

- [x] **Step 3: Add revoke/disable behavior**

Revoke invalidates pairing and outstanding Telegram action tokens immediately but does not cancel the underlying continuation task, browser pairing, local durable work, or CodexPro runtime. Disable stops new Telegram notifications/actions while browser user-gated continuation remains available.

- [x] **Step 4: Handle bot blocked/API outage safely**

If the user blocks the bot or Telegram is unavailable, mark Telegram unavailable and fall back to browser notification/authorization. Do not convert delivery failure into task failure and do not auto-submit through another channel.

### Task 7: Verify, document, and commit the milestone

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `FAQ.md`
- Modify: `SECURITY.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after verified implementation

- [x] **Step 1: Run deterministic Telegram gates**

Run: `node scripts/telegram-continuation-smoke.mjs`
Run: `node scripts/browser-continuation-smoke.mjs`
Run: `node scripts/continuation-watchdog-smoke.mjs`
Run: `node scripts/settings-smoke.mjs`
Run: `node scripts/http-smoke.mjs`
Run: `npm run build`
Expected: PASS using fake Bot API transport except for the separately authorized live setup check.

- [x] **Step 2: Perform one live private-bot authorization cycle**

After the mandatory BotFather/token/pairing stop gates are complete, use one disposable continuation task. Verify one Telegram notification, one **Continue** callback, one focused action such as **Maintenance** when that intent exists, and stale-button rejection after completion. Do not intentionally trigger Telegram flood limits or ChatGPT safety/capacity errors.

- [x] **Step 3: Verify privacy/package boundaries**

Run repository/package scans proving the Telegram token, token-bearing API URLs, paired IDs, update backlog, callback tokens, and test chat data are absent from Git, npm package contents, logs, diagnostics, and generated test reports.

- [x] **Step 4: Commit milestone**

```bash
git add src/continuation browser-extension scripts/codexpro.mjs scripts/telegram-continuation-smoke.mjs scripts/browser-continuation-smoke.mjs scripts/settings-smoke.mjs scripts/http-smoke.mjs src/http.ts src/diagnosticsOps.ts README.md FEATURES.md FAQ.md SECURITY.md docs/agentic/DEVELOPMENT_WORKFLOW.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add Telegram continuation authorization"
```

## Implementation Evidence ? 2026-09-10

- Real Telegram `doctor` and fixed `telegram test` passed against the configured dedicated private bot without exposing token or numeric identity material.
- Disposable task `09510b9e` live QA verified one focused **Maintenance** Telegram callback and one default **Continue** callback; both reached the explicitly bound managed ChatGPT conversation exactly once. Dispatch count reached 2, then the user deliberately pressed **Stop generating** and the disposable task was preserved as a manual-stop event before terminal cancellation.
- Telegram ready-action availability is five hours; the actual post-click browser dispatch authorization remains <=30 seconds and one-shot.
- Explicit rebind of a `continuation_ready` task now invalidates stale nonce/dispatch state and returns to `continuation_requested` until the newly bound page passes fresh safety evaluation.
- Readiness churn no longer spams Telegram: one semantic continuation opportunity owns one Telegram message and refreshes its keyboard in place when a fresh revision/nonce is required.
- Current ChatGPT `button[aria-label="Stop generating"]` is recognized as a manual stop in addition to the existing tested Stop controls.
- Fresh verification after live fixes: TypeScript build passed; the exact 46-command package smoke sequence passed in package order (`FULL_SMOKE_SEQUENCE_PASS`, 150.26s); release-pack dry run passed; `git diff --check` passed; conservative changed-file/package privacy scan reported zero Telegram-token, long Telegram-ID, token-bearing Bot API URL, private ChatGPT conversation URL, or forbidden private-state package-path hits.
- Final live stale-button rejection passed after terminal cancellation: Telegram returned **Expired**, the task remained `canceled` at revision 24 with dispatch count 2, no Telegram dispatch grant existed, and task-scoped obsolete action records were cleaned to zero.

## Acceptance Criteria

- User receives continuation-ready Telegram notifications only in the explicitly paired private bot chat.
- One Telegram button click authorizes at most one current continuation revision/nonce/intent; all browser/transport/page safety checks still apply.
- Focused buttons select only bounded server-side continuation intents and never inject arbitrary remote prompts or expand task scope.
- Long polling is outbound-only, condition-based, offset-persisted, webhook-conflict-aware, and safe against duplicate/backlogged updates.
- Telegram failures never cause autonomous fallback submission or restart CodexPro/tunnels.
- Bot token and private Telegram state remain outside profiles, logs, Git, packages, MCP output, and user-copyable QA reports.
- Browser **Continue task** remains available when Telegram is disabled/unavailable.
- No BotFather/token/pairing step is requested while continuation is disabled; manual user prompts immediately stale any pending Telegram actions until semantic reconciliation.
