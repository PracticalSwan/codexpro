# Continuation Security, Observability, Packaging, and Live QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden and verify the complete continuation/browser subsystem, update security/product documentation, and prove the packaged feature works without leaking credentials, scraping conversation content, or bypassing host restrictions.

**Architecture:** Treat browser continuation as a separately threat-modeled trust boundary. Extend existing diagnostics/telemetry/release checks, package only extension code, and perform final live browser QA after the mandatory user-auth stop gate from Plan 31.

**Tech Stack:** Existing security docs, diagnostics/telemetry, release packaging, Chrome/Edge managed profile, extension, full smoke/stress harness.

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

Test/source-review checklist covers malicious ChatGPT page content, extension compromise, pairing-token theft/CSRF, tunnel exposure, current-vs-saved deadline drift, runtime-generation restart, deliberately stopped/failed tunnel, wrong/stale chat route, multiple tabs, replayed nonce/stale popup revision, completion/cancel race, auth expiry, browser-profile leakage, browser/extension reconnect, sleep/clock jump, manual user message/Stop action, generic platform busy/error/retry state, user-typing race, automatic approval clicking, and attempts to use continuation endpoints as arbitrary MCP/DOM execution.

- [ ] **Step 2: Document explicit safe/unsafe browser actions**

Allowed: coarse capability/page-state observation, explicit stable-chat binding, notification/focus, and user-clicked fixed continuation dispatch. Forbidden: scraping outputs, arbitrary DOM commands, login automation, automatic Retry/model switching, approval/safety clicking, auto-submit, auto-restarting CodexPro/tunnels, rate-limit/tool-window circumvention, and use of the primary browser profile by default.

### Task 2: Harden logs, telemetry, diagnostics, and redaction

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/continuation/*` where public serializers are defined
- Modify: `scripts/continuation-security-smoke.mjs`

- [ ] **Step 1: Inject secret/private-looking fixtures**

Use synthetic browser token, cookie, full conversation URL, account email, and message text values and prove they are excluded/redacted from logs, diagnostics, activity ledger, error objects, and MCP results.

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
### Task 4: Final live managed-browser regression

**Files:**
- Modify: `scripts/continuation-live-checklist.md` or equivalent operator checklist
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after verified implementation

- [ ] **Step 1: Re-enter the manual authentication gate if needed**

If the managed profile is signed out, run the Plan 31 auth workflow and **STOP**. Resume only after the user authenticates directly in the browser and sends `continue`.

- [ ] **Step 2: Verify one successful disposable continuation cycle**

Using a disposable ChatGPT conversation: arm task, user binds chat, create explicit continuation-ready state, receive one notification, user clicks **Continue task**, fixed message sends once, next model/CodexPro call acknowledges dispatch, then semantic controller completes/disarms the task.

- [ ] **Step 3: Verify failure paths**

Use deterministic fixtures/fake clocks for the broad matrix: non-default current deadline vs saved profile mismatch, runtime generation change, transport absent/stopped, sleep/reconnect gap, completed/canceled terminal revision, stale popup, wrong/new/changed chat route, multiple tabs, active streaming, manual user message/Stop, generic platform busy/error/retry/unknown state, recent user typing, signed-out/auth-required state, stale/replayed nonce, max attempts, extension disconnect/reconnect, CodexPro bridge unavailable, and active proc/job/Goal suppression. No case may auto-submit, auto-retry, or auto-start a tunnel. Do not try to induce safety/capacity errors in live ChatGPT just to test them.

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

Document opt-in enablement, dedicated browser profile, manual sign-in, pairing, conversation binding, user-gated continuation, disarm/revoke, session expiry, privacy boundaries, and the fact that the feature does not extend or bypass ChatGPT tool windows.

- [ ] **Step 2: Run cumulative verification**

Run: `npm run build`
Run: `npm run smoke`
Run: `npm run stress`
Run: `npm audit --audit-level=high`
Run: `npm run release:pack`
Run: `git diff --check`
Expected: PASS.
- [ ] **Step 3: Run repository/package privacy scan**

Search staged diff, package manifest, test artifacts, and logs for credential patterns, cookie database names, private browser directories, and full ChatGPT conversation URLs. Any match fails the gate unless it is a clearly synthetic test fixture kept outside packaged output.

- [ ] **Step 4: Commit milestone**

```bash
git add SECURITY.md src/telemetry.ts src/diagnosticsOps.ts src/continuation package.json scripts/release-guard.mjs scripts/release-pack.mjs scripts/continuation-security-smoke.mjs scripts/continuation-live-checklist.md README.md FEATURES.md FAQ.md CHANGELOG.md docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: harden task-aware browser continuation"
```

## Acceptance Criteria

- Threat model explicitly covers browser/page/pairing/auth/replay/privacy risks.
- Package/repository contain no browser session state, credentials, conversation text, or private conversation URLs.
- Live QA proves one user-gated continuation cycle in the configured browser; the broader edge matrix is deterministic/fixture-based to avoid unnecessary live traffic or disruptive testing.
- Deadline/runtime/tunnel/user-stop/platform-busy edge cases fail closed without stale continuation, auto-retry, or automatic tunnel restart.
- Current OpenAI/service terms are rechecked before any release claim; behavior remains within the documented non-bypass boundary.
- Documentation clearly says authentication is manual and continuation dispatch requires the user's explicit click.
- No release/publication occurs merely because implementation verification passes.