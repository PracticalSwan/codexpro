# Task-Aware Browser Continuation — Design

**Status:** Planned; user-authorized planning only on 2026-09-08
**Scope:** durable continuation task state, browser companion, manual ChatGPT authentication, durable browser profile state, conversation binding, interruption detection, user-gated continuation, optional Telegram remote authorization, fresh-session acceptance reporting, settings, diagnostics, and integration with Plans 22–28

## Problem

Long CodexPro-assisted work may span more than one ChatGPT tool-call window. Plans 22–28 preserve local work across that boundary, but they do not initiate the next ChatGPT turn. The user wants the current task to remain aware of incomplete work and make continuation easy without reducing quality.

The continuation subsystem must not treat a host-enforced window as something to bypass. It must preserve the complete task, make interruption state durable, notify/focus the correct signed-in conversation, and require an explicit user action before another ChatGPT message is submitted.

## Product and compliance boundary

- Version 1 never automatically submits a ChatGPT message.
- The browser companion may detect coarse page state, bind a conversation, notify the user, focus the correct tab, and prepare a fixed continuation action.
- Every continuation submission requires a contemporaneous explicit user authorization: either **Continue task** in the managed browser or an authenticated one-shot Telegram inline-button callback from the paired private user. No timer/watchdog/page event may create that authorization.
- The extension must not scrape, export, summarize, or persist ChatGPT conversation/output text.
- It must not click login, CAPTCHA, 2FA/passkey, safety, approval, purchase, publish, or other consequential controls.
- It must not bypass rate limits, tool windows, safety mitigations, or product restrictions.
- Future autonomous submission requires a separately reviewed official host/API continuation mechanism or a fresh compliance review establishing that such behavior is permitted.

**Research basis reviewed 2026-09-08:** OpenAI Terms of Use effective 2026-01-01 explicitly prohibit automatically/programmatically extracting data or Output and circumventing restrictions/protective measures. OpenAI's published Operator/ChatGPT-agent guidance uses user takeover for login/security-sensitive input. Therefore this design intentionally avoids output scraping and autonomous submission intended to defeat a host window. The supported workaround is durable local work plus an explicit user continuation action, or a future first-party/API continuation primitive whose documented contract permits automation. Recheck only these feature-relevant clauses/guidance before live implementation/release; do not infer unrelated restrictions from unrelated policy text.
## Architecture

```text
ChatGPT semantic controller
        |
        | continuation_arm/checkpoint/request/complete
        v
CodexPro Continuation Manager
        |
        +--> bounded durable task record
        +--> deadline/proc/job/Goal awareness
        +--> narrow loopback browser bridge
                         |
                         v
              paired MV3 browser companion
                         |
                         +--> dedicated persistent browser profile
                         +--> coarse ChatGPT page-state adapter
                         +--> notification / focus / bind controls
                         +--> explicit Continue task button
                                          |
                                          v
                               same ChatGPT conversation
```

CodexPro remains the authoritative task-lifecycle store. The browser companion is an actuator and coarse state sensor only; it never decides semantically whether the engineering task is complete. Telegram is an optional remote notification/authorization surface only; it never becomes a second task controller or arbitrary command channel.

## Durable continuation record

Continuation state lives outside source workspaces under the CodexPro home directory and is bounded, atomic, and versioned. A record contains task identity, MCP/session association, monotonic `revision`, state, current phase, bounded completed evidence, bounded remaining work, conversation binding fingerprint, timestamps, continuation attempt counters, and active proc/job/Goal references. The record may keep a last-observed runtime generation/deadline for diagnostics, but **the deadline stored in task state is never authoritative for readiness**; readiness always reads the currently running CodexPro runtime snapshot.

It must never persist model chain-of-thought, complete prompts, raw conversation output, passwords, cookies, browser local storage, raw extension pairing secrets, or unrestricted environment data.
## Continuation state machine

```text
disarmed
   -> armed
   -> working
   -> continuation_requested
   -> continuation_ready
   -> awaiting_user_send
   -> dispatched
   -> working

working -> waiting_for_auth
working -> waiting_for_transport
working -> paused_by_user
working -> blocked_interaction
working -> completed  (terminal/inactive)
working -> canceled   (terminal/inactive)
working -> error -> disarmed/fail-closed
```

`completed` can only be written by the semantic controller after the original acceptance criteria and required verification are satisfied. Browser DOM state, assistant prose, or a lack of visible activity can never mark a task complete. `completed` and `canceled` are terminal and have precedence over browser/watchdog actions: they increment the record revision, clear outstanding continuation authorization, and invalidate any stale popup/notification state.

## Browser model

Version 1 uses a CodexPro-managed **dedicated Chrome/Edge profile** rather than attaching to the user's normal browser profile. The profile is stored under a protected CodexPro state directory and is owned by the browser; CodexPro does not copy cookies or passwords into its own records.

The managed browser loads a narrow Manifest V3 companion extension. Its host permissions are restricted to `https://chatgpt.com/*` and the loopback continuation bridge. It may read only route/URL identity and coarse UI capability signals such as signed-in vs signed-out, composer available, response streaming, or blocking interaction present.

A user may open an existing ChatGPT conversation URL in this managed profile after signing in. Version 1 does not attach to arbitrary existing personal-browser tabs or copy a personal Chrome profile.
## Authentication workflow

Authentication is always human-controlled. `codexpro continuation browser auth` opens the dedicated managed profile on `https://chatgpt.com/`. If ChatGPT is signed out, the controller enters `waiting_for_auth` and does nothing else.

During implementation/live verification, this is a mandatory hard stop:

1. Launch the managed browser/auth workflow.
2. **STOP execution and report `WAITING_FOR_USER_AUTH`.**
3. Tell the user to sign in directly in the browser and complete Google/Microsoft/Apple login, password, CAPTCHA, passkey, email confirmation, or 2FA as required.
4. Never request or receive those credentials/codes in chat or terminal input.
5. The user sends `continue` in the controlling ChatGPT conversation after authentication is complete.
6. Only then may implementation/live verification resume and perform a minimal session-health probe.

Runtime session expiry follows the same fail-closed model: notify `authentication required`, disable continuation dispatch, and wait for manual sign-in.

## Secure browser pairing

The browser companion does not receive the main CodexPro MCP bearer token. A separate loopback-only continuation bridge owns narrower credentials.

Initial pairing uses a short-lived, rate-limited one-time code shown by the CLI/admin page. The extension exchanges that code for a random 32-byte browser-client credential stored only in extension-local storage. CodexPro stores only the client identity plus a verifier/hash and revocation metadata.

Pairing codes expire after five minutes and permit at most five failed attempts. One managed profile has one active paired browser client; replacement pairing revokes the previous client. Browser-client credentials authorize only continuation bridge endpoints, stay outside page JavaScript, and cannot call MCP tools, filesystem operations, Bash, Git, Goals, or profile administration.
## Conversation binding and continuation action

A continuation task is not allowed to target whichever ChatGPT tab happens to be active. Binding is explicit:

1. ChatGPT arms a CodexPro continuation task.
2. The user opens the intended conversation in the managed browser profile.
3. The extension shows the armed task's short title/ID and a non-sensitive current-chat indicator.
4. The user presses **Bind this chat**.
5. CodexPro stores only an opaque conversation fingerprint; the reconstructable canonical route remains extension-local and no message content is stored.

When continuation is needed, the extension may focus that exact bound conversation and show **Continue task**. Pressing that button is the user authorization to insert and submit the fixed continuation message:

```text
Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.
```

The extension must verify the bound route, signed-in state, non-streaming state, available composer, no blocking interaction, and a fresh continuation nonce immediately before dispatch. Ambiguity fails closed.

## Runtime deadline and transport synchronization

Continuation timing is derived from a **current runtime snapshot**, never from the 20-minute default and never from a saved next-run profile value. The snapshot includes the effective `syncCallDeadlineMs`, a per-launch `runtimeGenerationId`, and local transport availability. Saving a new deadline while CodexPro is already running does not change that running deadline; the admin/CLI must show both values clearly.

On CodexPro restart, transport loss/recovery, browser bridge reconnect after a long gap, or other observation-generation change, inferred-interruption timing starts from a fresh local baseline. This prevents a shorter new deadline, machine sleep, clock adjustment, or a long disconnected period from instantly producing a stale continuation opportunity. Explicit semantic `continuation_request` may survive restart, but dispatch still requires current transport/browser/page safety plus the user's click.

If the current CodexPro runtime/tunnel is absent or not ready, continuation enters/surfaces `waiting_for_transport`, clears ready notifications/nonces, and **never starts or reconnects CodexPro/tunnels itself**. Once transport returns, inferred readiness requires the fresh baseline; no stale heartbeat alone may trigger it.


## Conversation-route and user-interaction safety

The full bound conversation route stays extension-local; CodexPro stores only an opaque fingerprint. Binding is allowed only after ChatGPT has assigned a stable conversation identity. Query strings, locale prefixes, and other benign URL decoration are canonicalized; a genuinely different conversation identity invalidates eligibility and requires explicit rebind.

A manually submitted user message, a recognized user **Stop generating** action, or an explicit continuation Disarm/Cancel invalidates any ready nonce/notification. A manual message or Stop action is treated as `paused_by_user`/needs-reconciliation, not as semantic task completion. Inferred continuation remains suppressed until a later validated CodexPro checkpoint/request establishes that the task is still active.

Multiple tabs are permitted for viewing, but dispatch is allowed only from the exact active bound conversation at click time. Stale popup state must include the task `revision` and be rejected after completion/cancel/rebind or any newer lifecycle transition.

## Continuation intents and Telegram remote authorization

A continuation request may expose one default `resume_all` intent plus up to three bounded focused intents that reference work already recorded as remaining. Each intent has an opaque ID, versioned template key, sanitized short display label, optional opaque focus reference, and the task revision that created it. Focused intents such as **Maintenance** or **Verification** change only the first remaining item/category to address; they cannot add work outside the original task or carry arbitrary prompt text.

Telegram is optional and uses a dedicated private bot over outbound Bot API long polling. The bot token is stored only in protected per-user secret storage. Setup validates the bot with `getMe`, refuses to compete with an existing webhook, and pairs one private Telegram user/chat using a short-lived one-time `/start` deep-link code. Telegram usernames/display names are not used as authorization identity.

When continuation becomes ready, CodexPro may send one privacy-bounded Telegram notification for the current task revision/nonce. Inline `callback_data` contains only an opaque action token; all task/intent metadata remains server-side. The paired user's button click may authorize one current dispatch, but CodexPro and the managed browser must immediately re-check terminal revision, nonce, transport, auth, binding, stable-idle page state, user-pause state, and durable-work status. The resulting authorization expires quickly and is consumed once. Failed safety checks never auto-retry.

Telegram messages do not include full paths, prompts, ChatGPT output, conversation URLs, credentials, or unrestricted remaining-work text. Version 1 supports no Telegram group/channel control, no webhook endpoint, no Mini App, and no arbitrary remote command/message facility. Browser **Continue task** remains the fallback if Telegram is disabled, blocked, offline, or unpaired.


## Unknown ChatGPT/platform states

The browser adapter does not infer why ChatGPT is delayed. States such as capacity delays, safety review, network retry UI, or the currently reported “systems are thinking a bit more” experience are represented only as generic `platform_busy`, `platform_error`, `blocking_interaction`, or `unknown` capability states. The companion must not read or persist response text to classify them, must not automatically click **Retry**, switch models, dismiss safeguards, or resubmit a message, and must suppress continuation until the page is stably idle and user-actionable again.


## Interruption/watchdog behavior

The watchdog creates a continuation opportunity; it never submits a message. `continuation_ready` may be reached from an explicit ChatGPT `continuation_request`, or from conservative interruption inference when an armed task is incomplete, the bound page is idle, the current MCP/session heartbeat is stale beyond the effective configured deadline plus grace, and no owned proc/job/Goal is still expected to produce progress.

Recent user typing, authentication pages, approvals/dialogs, active generation, disconnected bridge state, missing task binding, stale nonce, or ambiguous DOM state suppress continuation readiness.
## Anti-loop and acknowledgement rules

- Only one continuation nonce may be outstanding per task.
- Default cooldown after a dispatch is 60 seconds.
- Default maximum continuation dispatches per task is 20; reaching the limit requires manual re-arm.
- A dispatched continuation must be acknowledged by a later CodexPro checkpoint/tool call before another continuation can become ready.
- Retrying the same nonce is forbidden.
- Browser/server reconnect must not replay an already-dispatched nonce.
- A new meaningful checkpoint or explicit continuation request is required to advance the cycle.

## Integration with deadline, processes, jobs, and Goals

Plans 22–28 remain the mechanism that preserves actual work. Browser continuation is a separate conversation-resume layer and must not replace `proc_*`, structured `job_*`, `goal_*`, or `batch_*` state.

Near the effective synchronous deadline, ChatGPT should checkpoint material progress and explicitly request continuation only when more semantic work remains. Long local processes/jobs/Goals should continue locally without forcing a new ChatGPT turn; the browser watchdog should wait until the local durable work reaches a state that actually needs model attention.

## Settings and defaults

Browser continuation is opt-in and disabled by default. Planned saved settings include `continuationEnabled`, managed browser profile label, browser choice (`chrome` or `edge`), cooldown, maximum dispatches, unexpected-interruption grace, browser notifications, and optional `continuationTelegramEnabled`. Security-sensitive browser pairing credentials, Telegram bot token, Telegram paired user/chat IDs, and callback/action records are never stored in workspace profiles.

The authenticated local admin page must show current continuation task state, paired-browser health, auth state, bound-chat status, current-runtime vs saved-next-run settings, and a kill/disarm control. It must not display ChatGPT cookies, account identity, conversation text, pairing secrets, or full private conversation URLs.

## Security boundaries

- Loopback bridge only; no tunnel exposure.
- Separate least-privilege browser credential.
- Telegram Bot API uses a distinct protected bot token and one paired private user/chat; callback payloads are opaque, short-lived, and one-shot.
- Dedicated browser profile by default.
- No credential automation or credential capture.
- No conversation/output scraping.
- No automatic continuation submission.
- No approval/safety/consequential-action clicking.
- No arbitrary DOM scripting endpoint.
- No browser-to-MCP privilege escalation.
- Existing CodexPro policy, PathGuard, hooks, Git gates, Goal review/projection, and runtime lifecycle rules remain authoritative.
## Edge-case requirements

| Situation | Required behavior |
|---|---|
| Saved deadline differs from current runtime | Watchdog uses current runtime value only; UI shows both. |
| Runtime restarts with a new deadline | New `runtimeGenerationId`; inferred timer baseline resets. |
| CodexPro/tunnel is deliberately closed or crashes | No continuation readiness/dispatch; show waiting for transport; never auto-start/reconnect. |
| Machine sleeps/wakes or clocks jump | Browser/runtime observation gap resets inferred baseline; browser timestamps are not trusted as authority. |
| Task completes or is canceled while popup is open | Terminal revision invalidates nonce/button/notification before dispatch. |
| User manually submits a message or presses Stop generating | Clear readiness and pause inference until semantic reconciliation. |
| ChatGPT is streaming, delayed, showing retry/error/safety/approval UI, or markup is unknown | Fail closed; no Retry/model-switch/approval action. |
| New chat has not yet acquired a stable conversation identity | Bind disabled until a stable route exists. |
| Conversation route changes to another chat | Binding becomes ineligible; explicit rebind required. |
| Extension/browser/bridge disconnects and later returns | Fetch fresh record/runtime state before showing actions; never replay old nonce. |
| Auth expires | Invalidate readiness and require manual user authentication workflow. |
| Long proc/job/Goal remains productive | Suppress new ChatGPT turn until model attention is needed. |
| ChatGPT-side connector has been disabled but local runtime still appears ready | Companion cannot reliably verify that remote setting; disclose this limitation and keep the final continuation send user-gated. |
| Telegram bot is blocked/offline/API unavailable | Mark Telegram unavailable, do not fail the task, and keep browser authorization available; no autonomous fallback send. |
| Telegram callback arrives late/duplicated/forwarded | Validate exact paired user/chat, opaque action expiry, current task revision/nonce, and one-shot consumption; reject stale/replayed actions. |
| Bot token changes to a different bot identity | Invalidate Telegram pairing/action state and require fresh user pairing. |
| Telegram bot already has a webhook | Do not delete it automatically; refuse long polling and require a dedicated bot or explicit operator resolution. |

These cases are covered primarily with deterministic fixtures/fake clocks. Live QA stays narrow: one normal continuation cycle plus only the critical fail-closed cases that can be exercised safely without disrupting unrelated user state.


## Verification strategy

Implementation uses fake clocks, DOM fixtures, and a fake Telegram Bot API transport for the broad state-machine/watchdog/route/transport/Telegram matrix. Real verification begins only after the manual browser-auth and Telegram setup stop gates. Live testing uses the configured managed browser for one browser-authorized continuation cycle and, when Telegram is enabled, one paired private-bot continuation cycle with one focused intent; alternate-browser and broad failure coverage remain static/fixture-based unless separately needed. Do not induce safety/capacity errors, Telegram flood limits, or stop an active user-owned tunnel merely to create a live test condition.

The live test must not inspect or export historical conversation content. It may create one disposable test conversation and send only the fixed continuation message after an explicit user click.

## Planned subsystem split

| Plan | Subsystem |
|---|---|
| 29 | Durable continuation lifecycle and MCP API |
| 30 | Browser companion extension and secure loopback pairing |
| 31 | Managed browser profile, authentication, and durable browser state |
| 32 | Conversation binding and user-gated continuation dispatch |
| 33 | Watchdog, interruption recovery, acknowledgement, and anti-loop controls |
| 34 | CLI/settings/admin controls and operator UX |
| 35 | Deadline/process/job/Goal integration and ChatGPT guidance |
| 36 | Security, observability, packaging, fresh-session acceptance report, and final live regression verification |
| 37 | Telegram Bot notification and remote one-shot continuation authorization |

## Non-goals

- No automatic ChatGPT message submission in version 1; every submission requires a current browser-button or paired-Telegram-button user authorization.
- No browser credential/password manager implementation.
- No use of the user's normal Chrome/Edge profile by default.
- No conversation scraping, export, summarization, or hidden monitoring.
- No CAPTCHA/2FA/passkey automation.
- No automation of approval, safety, purchase, publication, deployment, or account-management controls.
- No replacement for official ChatGPT Work/cloud-browser continuation features when those satisfy the user's workflow.
- No attempt to defeat or extend a host-enforced tool/session window.
- No Telegram groups/channels, webhooks, Mini Apps, arbitrary bot commands, or arbitrary remote ChatGPT prompts in version 1.