# Task-Aware Browser Continuation Unified Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Plans 29–36 as one coherent, human-gated continuation program after the deadline-resilience foundations are available.

**Architecture:** Build durable semantic continuation state first, then the least-privilege browser bridge/extension, managed browser authentication/state, explicit conversation binding/user dispatch, conservative watchdog, settings/admin UX, runtime integration, and final security/live QA. Keep every subsystem independently reviewable and commit each milestone separately.

**Tech Stack:** Existing CodexPro TypeScript/MCP/HTTP runtime, Manifest V3 extension, system Chrome/Edge, existing process/job/Goal/deadline infrastructure, smoke/stress/release harness.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Plans 22–28 should be implemented/verified first unless a narrower dependency review proves a selected Plan 29–36 milestone is independent.
- Version 1 never automatically submits ChatGPT messages or extracts conversation/output text.
- Every continuation dispatch requires the user's **Continue task** click.
- ChatGPT login/2FA/CAPTCHA/passkey is always manual.
- During implementation, reaching browser authentication is a mandatory STOP; resume only after the user authenticates and sends `continue`.
- Dedicated browser profile only by default; no normal-browser profile import/attachment in version 1.
- No Codex CLI usage.
- Preserve running CodexPro lifecycle: do not stop without explicit stop approval and never start/restart CodexPro automatically.
- Publication/release remains separately authorized.

## Dependency Order

`29 → 30 → 31 → 32 → 33 → 34 → 35 → 36`

Plan 35 assumes relevant Plans 22–28 are implemented because it integrates their runtime state. Plan 36 is the final security/live/package gate.
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

## Milestone 36 — Security/package/live QA

- [ ] Update threat model and replace blanket browser-automation prohibition with narrow human-gated companion rules.
- [ ] Prove redaction/privacy/package exclusions.
- [ ] Recheck current OpenAI/service terms before release claims.
- [ ] Perform one live disposable-chat success cycle in the configured browser; cover the broad deadline/runtime/tunnel/route/user-stop/platform-busy failure matrix with deterministic fixtures/fake clocks, re-entering mandatory auth STOP when needed.
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

Also run the Plan 36 privacy/package scan and the authorized live managed-browser checklist. Never claim macOS/Linux live browser support from Windows-only evidence.

## Final Acceptance Criteria

- Incomplete tasks retain durable semantic state across ChatGPT turns and CodexPro restarts without stale timing; restart/transport/browser generations reset inferred interruption baselines.
- User can authenticate once in a dedicated durable browser profile and reauthenticate manually when required.
- One explicitly bound conversation receives a continuation only after the user's explicit **Continue task** click.
- Watchdog/recovery cannot create autonomous browser-message loops, cannot auto-retry ChatGPT errors, and cannot continue while CodexPro transport is absent/stopped or after terminal completion/cancel.
- Plans 22–28 continue to own actual long-running work and quality preservation.
- Browser/session secrets and ChatGPT output never enter CodexPro durable task records, logs, Git, or packages.
- The implementation does not claim to bypass or extend ChatGPT/tool restrictions.