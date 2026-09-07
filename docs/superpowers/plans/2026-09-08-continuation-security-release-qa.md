# Continuation Security, Observability, Packaging, and Live QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and verify the complete continuation/browser/Telegram subsystem, update security/product documentation, and prove the packaged feature works without leaking credentials, scraping conversation content, or bypassing host restrictions; then produce a reproducible fresh-ChatGPT-session acceptance report for user handoff.

**Architecture:** Treat browser continuation as a separately threat-modeled trust boundary. Extend existing diagnostics/telemetry/release checks, package only extension code, and perform final live browser QA after the mandatory user-auth stop gate from Plan 31.

**Tech Stack:** Existing security docs, diagnostics/telemetry, release packaging, Chrome/Edge managed profile, extension, Telegram Bot API integration from Plan 37, full smoke/stress harness, fresh-session operator report template.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Current OpenAI terms/policies relevant to this feature must be rechecked immediately before implementation/live-browser/release claims, limited to browser automation, output/data extraction, protective/restriction circumvention, authentication/user-control, and related service access. Do not invent restrictions from unrelated policy sections; absence of a statement is not treated as an affirmative guarantee of permission.
- Version 1 never auto-submits continuation messages and never extracts conversation/output text.
- Browser credentials/profile state never enter Git, npm package, logs, MCP results, screenshots, or docs examples.
- User authentication and any reauthentication remain manual hard-stop workflows.
- No publication/release occurs without separate user authorization.

---

### Task 1: Update formal security model and threat table

**Files:**
- Modify: `SECURITY.md`
- Modify: `docs/agentic/DECISIONS.md`
- Create: `scripts/continuation-security-smoke.mjs`

**Interfaces:**
- Replaces the older blanket `loop-handoff` browser-automation prohibition with a narrow approved companion boundary while keeping generic browser-driving and autonomous submission prohibited.
- [ ] **Step 1: Add threat-model assertions**

Test/source-review checklist covers malicious ChatGPT page content, extension compromise, pairing-token theft/CSRF, tunnel exposure, current-vs-saved deadline drift, runtime-generation restart, deliberately stopped/failed tunnel, wrong/stale chat route, multiple tabs, replayed nonce/stale popup revision, completion/cancel race, auth expiry, browser-profile leakage, browser/extension reconnect, sleep/clock jump, manual user message/Stop action, generic platform busy/error/retry state, user-typing race, automatic approval clicking, Telegram bot-token leakage, wrong/forwarded Telegram user/chat, callback replay/expiry, duplicated/backlogged `getUpdates`, webhook conflict, bot blocked/API outage, changed bot identity, and attempts to use continuation or Telegram endpoints as arbitrary MCP/DOM/remote-command execution.

- [ ] **Step 2: Document explicit safe/unsafe browser actions**

Allowed: coarse capability/page-state observation, explicit stable-chat binding, notification/focus, and user-clicked fixed continuation dispatch. Forbidden: scraping outputs, arbitrary DOM commands, login automation, automatic Retry/model switching, approval/safety clicking, auto-submit, auto-restarting CodexPro/tunnels, rate-limit/tool-window circumvention, and use of the primary browser profile by default.

### Task 2: Harden logs, telemetry, diagnostics, and redaction

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/continuation/*` where public serializers are defined
- Modify: `scripts/continuation-security-smoke.mjs`

- [ ] **Step 1: Inject secret/private-looking fixtures**

Use synthetic browser token, Telegram bot token/token-bearing Bot API URL, paired user/chat IDs, callback token, cookie, full conversation URL, account email, and message text values and prove they are excluded/redacted from logs, diagnostics, activity ledger, error objects, MCP results, and fresh-session test reports.

- [ ] **Step 2: Bound lifecycle telemetry**

Permit task short ID, state transition, duration, browser availability enum, reason code, dispatch count, and auth enum only. Never record the continuation message body even though it is fixed.

### Task 3: Packaging and install integrity

**Files:**
- Modify: `package.json`
- Modify: `scripts/release-guard.mjs`
- Modify: `scripts/release-pack.mjs`
- Modify: `scripts/continuation-security-smoke.mjs`

- [ ] **Step 1: Add forbidden artifact scan**

Release checks reject browser profile directories, Cookies/Local Storage databases, extension-local storage exports, pairing records, screenshots, HAR files, CDP traces, and any `chatgpt.com/c/` private conversation URLs in package contents.

- [ ] **Step 2: Verify extension/package integrity**

Package must contain only static extension source/assets plus runtime implementation/docs. Validate manifest permissions during release guard.
### Task 4: Final live managed-browser and Telegram regression

**Files:**
- Modify: `scripts/continuation-live-checklist.md` or equivalent operator checklist
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after verified implementation

- [ ] **Step 1: Re-enter the manual authentication gate if needed**

If the managed profile is signed out, run the Plan 31 auth workflow and **STOP**. Resume only after the user authenticates directly in the browser and sends `continue`.

- [ ] **Step 2: Verify one successful disposable continuation cycle**

Using a disposable ChatGPT conversation: arm task, user binds chat, create explicit continuation-ready state, verify one browser **Continue task** authorization, then with Plan 37 configured verify one Telegram **Continue** authorization and one focused intent such as **Maintenance**. Each sends at most once, the next model/CodexPro call acknowledges the selected intent, and semantic completion/disarm invalidates both browser and Telegram stale actions.

- [ ] **Step 3: Verify failure paths**

Use deterministic fixtures/fake clocks for the broad matrix: non-default current deadline vs saved profile mismatch, runtime generation change, transport absent/stopped, sleep/reconnect gap, completed/canceled terminal revision, stale popup, wrong/new/changed chat route, multiple tabs, active streaming, manual user message/Stop, generic platform busy/error/retry/unknown state, recent user typing, signed-out/auth-required state, stale/replayed nonce, max attempts, extension disconnect/reconnect, CodexPro bridge unavailable, active proc/job/Goal suppression, Telegram wrong user/chat, stale/replayed callback, bot blocked/API unavailable, webhook conflict, duplicate/backlogged updates, and Telegram disabled. No case may auto-submit, auto-retry, auto-start a tunnel, or silently substitute another authorization channel. Do not try to induce safety/capacity errors or Telegram flood limits in live services just to test them.

- [ ] **Step 4: Cross-browser scope**

Live-check only the user-selected/configured managed browser for the end-to-end continuation cycle; do not duplicate the same live ChatGPT test in every installed browser. Use static/fixture launcher-adapter checks for the alternate supported Windows browser. For unavailable macOS/Linux hosts, report live validation pending rather than claiming support from static tests alone.

### Task 5: Final cumulative gates and documentation

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `FAQ.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`

- [ ] **Step 1: Document exact operator workflow**

Document opt-in enablement, dedicated browser profile, manual sign-in, browser pairing, conversation binding, browser/Telegram user authorization, Telegram BotFather/token/pairing setup, focused continuation intents, disarm/revoke, session expiry, fresh-session report handoff, privacy boundaries, and the fact that the feature does not extend or bypass ChatGPT tool windows.

- [ ] **Step 2: Run cumulative verification**

Run: `npm run build`
Run: `npm run smoke`
Run: `npm run stress`
Run: `npm audit --audit-level=high`
Run: `npm run release:pack`
Run: `git diff --check`
Expected: PASS.
- [ ] **Step 3: Run repository/package privacy scan**

Search staged diff, package manifest, test artifacts, reports, and logs for credential patterns, Telegram token/token-bearing URLs, paired Telegram IDs, callback tokens, cookie database names, private browser directories, and full ChatGPT conversation URLs. Any match fails the gate unless it is a clearly synthetic test fixture kept outside packaged output.

- [ ] **Step 4: Commit milestone**

```bash
git add SECURITY.md src/telemetry.ts src/diagnosticsOps.ts src/continuation package.json scripts/release-guard.mjs scripts/release-pack.mjs scripts/continuation-security-smoke.mjs scripts/continuation-live-checklist.md scripts/continuation-fresh-session-checklist.md README.md FEATURES.md FAQ.md CHANGELOG.md docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: harden task-aware browser continuation"
```

### Task 6: Fresh ChatGPT-session acceptance test and user-copyable report

**Files:**
- Create: `scripts/continuation-fresh-session-checklist.md`
- Modify: `scripts/continuation-live-checklist.md`

- [ ] **Step 1: Define the fresh-session test boundary**

After implementation/package installation is complete, the operator starts a **new ChatGPT conversation** with CodexPro Full available. That session tests the installed runtime only; it must not modify CodexPro source/Git unless the user separately authorizes a fix. Use disposable continuation state/conversation artifacts.

- [ ] **Step 2: Require the core report scenarios**

The fresh session records: installed package/version and source commit if available; current runtime generation and current-vs-saved deadline; browser/Telegram capability status without secrets; arm/checkpoint/request/status recovery; browser continuation; Telegram default continuation; one focused Telegram intent; non-default deadline synchronization; completion stale-button rejection; cancel/disarm behavior; and Telegram unavailable fallback to browser. Deliberately stopping a tunnel/runtime or inducing platform safety/capacity errors is optional and must not be done merely for the report.

- [ ] **Step 3: Emit one copyable Markdown report**

Report sections: `Environment`, `Configuration`, `Scenario Results`, `Evidence`, `Skipped/Not Exercised`, `Defects`, `Residual Risks`, and final `PASS | PARTIAL | FAIL`. Never include bot tokens, Telegram numeric IDs, full ChatGPT conversation URLs, cookies, auth details, prompts/output transcripts, or secret-bearing command lines.

- [ ] **Step 4: User handoff is authoritative for post-test review**

The user copies the report into the maintenance conversation. Treat it as external test evidence to review against source/runtime state; do not claim defects fixed or release-ready solely because the external session says PASS. Reproduce material failures before modifying source when practical.

## Acceptance Criteria

- Threat model explicitly covers browser/page/pairing/auth/replay/privacy risks.
- Package/repository contain no browser session state, credentials, conversation text, or private conversation URLs.
- Live QA proves browser and Telegram user-gated continuation in the configured environment; the broader edge matrix is deterministic/fixture-based to avoid unnecessary live traffic or disruptive testing.
- A separate new-ChatGPT-session acceptance pass produces a sanitized copyable report that the user can return for independent maintenance review.
- Deadline/runtime/tunnel/user-stop/platform-busy edge cases fail closed without stale continuation, auto-retry, or automatic tunnel restart.
- Current OpenAI/service terms are rechecked before any release claim; behavior remains within the documented non-bypass boundary.
- Documentation clearly says authentication is manual and continuation dispatch requires the user's explicit click.
- No release/publication occurs merely because implementation verification passes.