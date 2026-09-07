# Deadline Observability and Timeout-Risk Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deadline behavior diagnosable without exposing sensitive task content, and identify operations that should route away from synchronous execution before they hit the external tool window.

**Architecture:** Extend existing telemetry/diagnostics rather than creating a parallel monitoring system. Record bounded deadline lifecycle events and expose aggregate risk/capability metadata through existing diagnostic tools and the local admin surface where appropriate.

**Tech Stack:** TypeScript, existing `telemetry.ts`, `diagnosticsOps.ts`, activity ledger, diagnostic smokes.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Diagnostics report `sync_call_deadline_mode` plus the current finite reference/deadline milliseconds; bounded 1,200,000 ms is the default, not a universal host limit. Observe mode reports elapsed awareness without pretending an enforced CodexPro deadline exists.
- Do not claim CodexPro controls or bypasses ChatGPT's external limit.
- Telemetry stores tool/job identifiers, durations, states, and bounded reasons—not prompts, source content, raw command output, tokens, or secrets.
- A deadline yield is a distinct state from failure and success.
- Risk hints are deterministic evidence/advisory metadata, not semantic judgments about user intent.

---

### Task 1: Add deadline lifecycle telemetry

**Files:**
- Modify: `src/telemetry.ts`
- Modify: `src/server.ts`
- Create: `scripts/deadline-diagnostics-smoke.mjs`

**Interfaces:**
- Produces telemetry events/counters for `deadline_yield`, `deadline_limited_child`, `async_routed`, `job_started`, `job_completed`, `job_interrupted`, and `batch_continued`.

- [ ] **Step 1: Add redaction/boundedness tests**

Emit synthetic events containing secret-looking text in a reason field and assert telemetry redacts/truncates it. Assert raw stdout/stderr and command bodies are not accepted as deadline event payload fields.

- [ ] **Step 2: Record lifecycle events at canonical boundaries**

Use existing request/completion telemetry points and job/batch state transitions. Avoid duplicate per-loop events; one phase/state transition should create at most one bounded event.

### Task 2: Extend existing diagnostics with deadline/job capability state

**Files:**
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/server.ts`
- Modify: `scripts/diagnostics-smoke.mjs`
- Modify: `scripts/deadline-diagnostics-smoke.mjs`

**Interfaces:**
- Extends `tool_surface_diagnostics`/`connection_diagnostics` structured output with deadline and continuation capabilities.

- [ ] **Step 1: Add failing diagnostics assertions**

Assert diagnostics report:

```text
sync_call_deadline_mode = bounded | observe
sync_call_deadline_ms = <finite reference/current bounded value>
sync_call_deadline_minutes = <finite reference/current bounded minutes>
sync_call_deadline_default_ms = 1200000
sync_call_deadline_min_ms = 300000
sync_call_deadline_max_ms = 3600000
managed_processes = available/unavailable
structured_jobs = available/unavailable
resumable_batches = available/unavailable
durable_goals = available/unavailable
```

Also expose recent aggregate counts for deadline yields/async routes without listing sensitive arguments.

- [ ] **Step 2: Add timeout-risk inventory**

Report known high-risk synchronous surfaces such as composite verification when async alternatives are available. Risk entries should name the tool and recommended primitive, not guess how long a specific user task will take.

### Task 3: Add harmless host-window discovery probe

**Files:**
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/server.ts`
- Create: `scripts/tool-time-probe-smoke.mjs`

**Interfaces:**
- Adds read-only `tool_time_probe(max_minutes?)` for explicit operator discovery. It performs no workspace/file/Git/process/browser/network mutation and is useful only when the current runtime deadline mode is `observe`.

- [ ] **Step 1: Add probe safety/abort tests**

Use fake clocks/abort signals to prove the probe does nothing except wait/measure, caps its own operator-selected diagnostic duration, records sanitized elapsed/abort metadata only when transport cancellation is observable, and never changes the saved deadline automatically.

- [ ] **Step 2: Add discovery guidance**

CLI/admin/help workflow: use a disposable new ChatGPT chat, temporarily set the next launch to `Unlimited (observe only)`, manually launch that runtime, invoke only `tool_time_probe`, note when ChatGPT closes the tool call, then restore a bounded deadline below the observed window. If no reliable server-side abort is observable, tell the user to record the UI-observed time manually rather than fabricating a measurement.

### Task 4: Surface bounded progress and effective deadline in the local operator view

**Files:**
- Modify: `src/http.ts` only for diagnostics/current-vs-saved rendering; the editable profile control is implemented in Plan 22
- Modify: `scripts/http-smoke.mjs` or `scripts/diagnostics-smoke.mjs` as appropriate

- [ ] **Step 1: Add non-secret status summaries**

Show the currently running synchronous deadline, the saved next-run deadline when different, number of active structured jobs, and whether a recent operation yielded to continuation. Do not display job command text, source paths beyond existing sanitized conventions, or auth values.

- [ ] **Step 2: Keep current runtime and saved next-run settings separate**

Reuse the Plan 22 editable profile field; do not introduce a second diagnostics-only editor. Clearly distinguish `current effective` from `saved for next launch`, because changing the profile does not mutate the running runtime.

### Task 5: Verify and commit

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md` after verified implementation

- [ ] **Step 1: Run diagnostic gates**

Run: `node scripts/deadline-diagnostics-smoke.mjs`
Run: `node scripts/tool-time-probe-smoke.mjs`
Run: `node scripts/diagnostics-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Expected: PASS.

- [ ] **Step 2: Run stress only if job/process telemetry concurrency changed**

Run: `npm run stress`
Expected: PASS when required by the actual implementation diff.

- [ ] **Step 3: Check docs/diff and commit milestone**

Run: `git diff --check`
Expected: PASS.

```bash
git add src/telemetry.ts src/diagnosticsOps.ts src/server.ts src/http.ts scripts/deadline-diagnostics-smoke.mjs scripts/tool-time-probe-smoke.mjs scripts/diagnostics-smoke.mjs scripts/settings-smoke.mjs README.md FEATURES.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: expose deadline resilience diagnostics"
```

## Task-aware browser continuation integration

After Plans 29–37 exist, diagnostics may additionally report continuation feature/browser availability, user-action-required state, current runtime generation/transport availability, and current-runtime vs saved-next-run deadline mismatch. They must keep browser credentials, account identity, full conversation URLs, and ChatGPT output out of diagnostics and telemetry. If the runtime snapshot is absent, report `transport_unavailable/unknown` rather than fabricating the 20-minute default as an active deadline.

## Acceptance Criteria

- Diagnostics show the current deadline mode, finite reference/current bounded value, the 20-minute bounded default, and supported 5–60 minute range; observe mode is explicit rather than represented as a giant timeout.
- Deadline yield/async/job/batch states are observable without exposing sensitive content.
- Operators can identify known timeout-risk surfaces and the recommended durable primitive.
- The authenticated local page reuses Plan 22's validated profile control and distinguishes saved next-run value from current runtime value.
- Diagnostics never imply the external ChatGPT tool window was bypassed.
- A dedicated harmless probe plus Unlimited/observe mode gives users a documented way to discover their own host cutoff without making ordinary project mutations the experiment.
