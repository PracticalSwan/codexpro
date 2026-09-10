# Continuation Live QA Checklist

Use this checklist only with disposable continuation state and the configured CodexPro-managed browser profile. Do not use the user's ordinary browser profile, inspect conversation text, export browser storage, or expose credentials/private identifiers.

## Preconditions

- [ ] Record the tested CodexPro version/source commit and current branch without copying secrets.
- [ ] `npm run build` passes.
- [ ] `node scripts/continuation-security-smoke.mjs` passes.
- [ ] Relevant browser, continuation, Telegram, HTTP, settings, and profile smokes pass.
- [ ] Read current runtime/transport state without stopping or restarting a running CodexPro instance.
- [ ] Confirm the managed browser is paired and report only coarse state (`paired`, auth enum, bound yes/no).
- [ ] If auth is not `signed_in`, STOP as `WAITING_FOR_USER_AUTH`; the user signs in directly and then sends `continue`.
- [ ] If Telegram is required but not configured/paired, follow the documented human token/pairing STOP boundaries. Never put the bot token or numeric chat/user IDs in this report.

## One disposable successful cycle

- [ ] Arm a disposable continuation task and record only its short ID, revision, state, and dispatch count.
- [ ] Explicitly bind the intended disposable ChatGPT conversation.
- [ ] Reach continuation-ready state with no productive proc/job/Goal/batch work remaining.
- [ ] User presses the managed-browser **Continue task** action once; verify exactly one fixed continuation dispatch.
- [ ] With Telegram enabled, user presses default **Continue** once; verify exactly one dispatch.
- [ ] User presses one bounded focused intent such as **Maintenance** or **Verification**; verify exactly one dispatch and no arbitrary prompt text.
- [ ] Confirm each successful send requires a current user action and a fresh route/revision/nonce/page-safety check.

## Fail-closed regression matrix

Use deterministic fixtures/fake clocks for these cases rather than disrupting live services:

- [ ] bounded deadline versus Unlimited/observe, including current-vs-saved deadline mismatch
- [ ] runtime-generation change, stopped/unavailable transport, reconnect gap, sleep/clock jump
- [ ] continuation disabled, completed/canceled task, stale popup/revision, replayed/expired nonce
- [ ] wrong/changed chat route, multiple tabs, extension disconnect/reconnect, bridge unavailable
- [ ] streaming, recent user typing, Stop-generating, manual prompt, busy/error/retry/unknown/blocking UI
- [ ] signed-out/auth-required state and max-dispatch/manual-rearm boundary
- [ ] active proc/job/Goal/batch suppression
- [ ] Telegram wrong user/chat, replayed/expired callback, duplicate/backlogged updates, webhook conflict, disabled/unavailable bot
- [ ] arbitrary MCP/DOM/remote-command payloads and approval/safety/model-switch/login automation remain rejected

For manual-turn testing, verify the semantic controller can reconcile exactly one pending turn as `resume`, `redirect`, `supersede`, or `cancel`; ambiguity remains paused.

## Terminal invalidation

- [ ] Complete or cancel the disposable task.
- [ ] Verify old browser/Telegram actions are stale/expired and cannot create another dispatch grant.
- [ ] Verify no duplicate Telegram notification remains active for the terminal task.
- [ ] Verify task-scoped temporary authorization/action state is cleaned without deleting unrelated user state.

## Sanitized evidence

Record only version/commit, short task ID, revision/state, dispatch count, coarse browser/Telegram/runtime enums, test names, pass/fail, and timestamps when useful. Never include bot/browser tokens, pairing codes, callback tokens, numeric Telegram IDs, cookies/storage, account email, conversation fingerprint, full private ChatGPT URL, prompt/output text, or secret-bearing commands.
