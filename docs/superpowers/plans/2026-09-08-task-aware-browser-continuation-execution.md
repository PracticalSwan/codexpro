# Task-Aware Browser Continuation Unified Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Plans 29–37 as one coherent, human-gated continuation program after the deadline-resilience foundations are available, with Plan 36 retained as the final security/live/fresh-session acceptance gate.

**Architecture:** Build durable semantic continuation state first, then the least-privilege browser bridge/extension, managed browser authentication/state, explicit conversation binding/user dispatch, conservative watchdog, settings/admin UX, runtime integration, optional Telegram remote user authorization, and final security/live/fresh-session QA. Keep every subsystem independently reviewable and commit each milestone separately.

**Tech Stack:** Existing CodexPro TypeScript/MCP/HTTP runtime, Manifest V3 extension, system Chrome/Edge, Telegram Bot API over outbound HTTPS long polling, existing process/job/Goal/deadline infrastructure, smoke/stress/release harness.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Plans 22–28 should be implemented/verified first unless a narrower dependency review proves a selected Plan 29–37 milestone is independent.
- Version 1 never automatically submits ChatGPT messages or extracts conversation/output text.
- Every continuation dispatch requires a contemporaneous explicit user authorization: managed-browser **Continue task** or, when Plan 37 is enabled, an authenticated paired-Telegram inline-button click. No watchdog/timer may create that authorization.
- ChatGPT login/2FA/CAPTCHA/passkey is always manual.
- During implementation, reaching browser authentication is a mandatory STOP; resume only after the user authenticates and sends `continue`.
- Dedicated browser profile only by default; no normal-browser profile import/attachment in version 1.
- No Codex CLI usage.
- Preserve running CodexPro lifecycle: do not stop without explicit stop approval and never start/restart CodexPro automatically.
- Publication/release remains separately authorized.

## Dependency Order

`29 → 30 → 31 → 32 → 33 → 34 → 35 → 37 → 36`

Plan 35 assumes relevant Plans 22–28 are implemented because it integrates their runtime state. Plan 37 adds the optional Telegram authorization surface after the source-neutral dispatch contract exists. Plan 36 remains the final security/live/package/fresh-session gate and therefore depends on Plan 37 when Telegram is in the authorized implementation scope.
## Milestone 29 — Durable continuation lifecycle

- [ ] Implement bounded atomic continuation records and legal state transitions.
- [ ] Register semantic MCP lifecycle tools.
- [ ] Prove restart/idempotency/session isolation plus terminal revision precedence so completed/canceled tasks cannot be revived by stale browser/watchdog writes.
- [ ] Review no hidden reasoning/secrets in durable records.
- [ ] Make Plan 29 milestone commit.

## Milestone 30 — Browser companion and pairing

- [ ] Add separate loopback continuation bridge credential/pairing.
- [ ] Add narrow Manifest V3 extension and popup/background/content skeleton.
- [ ] Prove tunnel/MCP privilege isolation and permission minimization.
- [ ] Verify extension packaging excludes state.
- [ ] Make Plan 30 milestone commit.

## Milestone 31 — Managed browser/auth state

- [ ] Add Chrome/Edge discovery and dedicated managed profile launcher.
- [ ] Add coarse signed-in/signed-out/ambiguous health.
- [ ] Reach live auth command and **STOP: WAITING_FOR_USER_AUTH**.
- [ ] User signs in manually and sends `continue`.
- [ ] Recover state, verify coarse signed-in status, and complete non-secret persistence checks.
- [ ] Make Plan 31 milestone commit.

## Milestone 32 — Conversation binding/user dispatch

- [ ] Add isolated ChatGPT DOM capability adapter.
- [ ] Require user **Bind this chat** action.
- [ ] Require user **Continue task** action for every dispatch.
- [ ] Prove stable-route binding, changed/new chat invalidation, stale popup revision, manual user message/Stop, and streaming/platform-busy/error/unknown states fail closed with no automatic Retry.
- [ ] Make Plan 32 milestone commit.
## Milestone 33 — Watchdog/recovery

- [ ] Add MCP heartbeat/dispatch acknowledgement.
- [ ] Add explicit-request and conservative inferred-interruption readiness.
- [ ] Add current-runtime deadline/transport generation, restart/sleep/reconnect baseline reset, proc/job/Goal suppression, cooldown, max-dispatch, nonce replay protection, user-pause, auth/disconnect handling.
- [ ] Prove watchdog only notifies/prepares and never submits.
- [ ] Make Plan 33 milestone commit.

## Milestone 34 — Settings/admin UX

- [ ] Add opt-in non-secret profile settings and strict validators.
- [ ] Add continuation/browser CLI status/open/auth/pair/disarm commands.
- [ ] Add authenticated admin controls and current-vs-saved state.
- [ ] Verify no browser/auth/chat secrets in profile/UI output.
- [ ] Make Plan 34 milestone commit.

## Milestone 35 — Runtime integration/instructions

- [ ] Integrate heartbeat with MCP dispatch plus launcher runtime snapshot (`runtimeGenerationId`, current effective deadline, transport readiness); never use saved/default deadline as current watchdog timing.
- [ ] Integrate canonical proc/job/batch/Goal status without duplicating stores.
- [ ] Teach ChatGPT to arm/checkpoint/request/recover/complete continuation without rushing.
- [ ] Add bounded activity/diagnostic state.
- [ ] Run shared smoke/stress and make Plan 35 milestone commit.

## Milestone 37 — Telegram remote continuation authorization

- [ ] Add protected Bot API token storage/client with token-URL redaction.
- [ ] Reach BotFather/token setup and **STOP: WAITING_FOR_TELEGRAM_BOT_TOKEN** when needed; user configures the token locally and sends `continue`.
- [ ] Reach private-bot pairing and **STOP: WAITING_FOR_TELEGRAM_PAIR**; user presses Start/pairs and sends `continue`.
- [ ] Add outbound long polling, exact private-user/chat authorization, opaque inline actions, focused continuation intents, replay/expiry protection, and browser safety revalidation.
- [ ] Verify Telegram unavailable/blocked/webhook-conflict behavior falls back to browser authorization without auto-send.
- [ ] Make Plan 37 milestone commit.

## Milestone 36 — Security/package/live QA

- [ ] Update threat model and replace blanket browser-automation prohibition with narrow human-gated companion rules.
- [ ] Prove redaction/privacy/package exclusions.
- [ ] Recheck current OpenAI/service terms before release claims.
- [ ] Perform one browser-authorized and, when Plan 37 is configured, one Telegram-authorized disposable continuation cycle; cover the broad deadline/runtime/tunnel/route/user-stop/platform-busy/Telegram failure matrix with deterministic fixtures/fake clocks, re-entering mandatory setup STOP gates when needed.
- [ ] Run the fresh-ChatGPT-session acceptance checklist and produce the sanitized report the user will copy back for maintenance review.
- [ ] Run full cumulative gates and make Plan 36 milestone commit.
## Human-authentication stop protocol

At any implementation/live-verification step that encounters ChatGPT sign-in, provider redirect, CAPTCHA, 2FA, passkey, email confirmation, or other credential/security verification:

1. Set/report continuation implementation state as `WAITING_FOR_USER_AUTH` where applicable.
2. Stop implementation/browser-driving actions immediately.
3. Tell the user exactly which managed browser/profile needs attention.
4. The user performs authentication directly in the browser.
5. The user sends `continue` in the controlling ChatGPT conversation.
6. Recover repository, process, browser, and task state before resuming.
7. Verify only coarse signed-in health; never inspect credentials or account identity.

This stop protocol overrides any batch-execution desire to proceed automatically.

## Telegram setup stop protocol

At any implementation/live-verification step that needs Telegram bot creation/token entry or initial private-chat pairing:

1. If no valid bot token exists, report `WAITING_FOR_TELEGRAM_BOT_TOKEN` and stop.
2. Guide the user to create/use a dedicated bot with `@BotFather` and save the token through CodexPro's masked local token command; never request the token in ChatGPT.
3. The user sends `continue`; recover repository/runtime state and validate only sanitized `getMe` bot identity.
4. Generate the short-lived private pairing deep link/code, report `WAITING_FOR_TELEGRAM_PAIR`, and stop.
5. The user opens the bot, presses **Start**/completes pairing, then sends `continue`.
6. Recover state and verify only paired yes/no plus sanitized bot health.

These stops are human setup/security boundaries and override batch execution.

## Final Verification Gate

Run focused smokes first, then:

```bash
npm run build
npm run smoke
npm run stress
npm audit --audit-level=high
npm run release:pack
git diff --check
```

Also run the Plan 36 privacy/package scan, the authorized live managed-browser/Telegram checklist, and the fresh-ChatGPT-session report workflow. The user will copy the resulting sanitized report back for maintenance review. Never claim macOS/Linux live browser support from Windows-only evidence.

## Final Acceptance Criteria

- Incomplete tasks retain durable semantic state across ChatGPT turns and CodexPro restarts without stale timing; restart/transport/browser generations reset inferred interruption baselines.
- User can authenticate once in a dedicated durable browser profile and reauthenticate manually when required.
- One explicitly bound conversation receives a continuation only after a current explicit user authorization from the managed-browser button or paired Telegram inline action; focused Telegram actions can prioritize only recorded remaining work.
- Watchdog/recovery cannot create autonomous browser-message loops, cannot auto-retry ChatGPT errors, and cannot continue while CodexPro transport is absent/stopped or after terminal completion/cancel.
- Plans 22–28 continue to own actual long-running work and quality preservation.
- Browser/session secrets and ChatGPT output never enter CodexPro durable task records, logs, Git, or packages.
- The implementation does not claim to bypass or extend ChatGPT/tool restrictions.