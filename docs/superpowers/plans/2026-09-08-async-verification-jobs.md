# Asynchronous Verification Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let long test/build verification run locally behind a durable `job_*` handle so ChatGPT never has to keep one MCP invocation open for the whole verification.

**Architecture:** Reuse trusted-check discovery and parsing from `checksOps.ts`, but execute selected verification in a registered `verification` job worker. Add explicit async start tools rather than changing every existing synchronous call into a job.

**Tech Stack:** TypeScript, durable job core, existing `runChecks`/`verifyChanges`, detached Node worker, MCP structured results.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Existing `run_checks` and `verify_changes` remain available for short synchronous work.
- Async verification preserves the exact same selected checks, parsing, repair metadata, and workspace guards as synchronous verification.
- Starting a job does not imply success; only terminal persisted results may report PASS/FAIL.
- A job must not commit, push, deploy, or mutate external services.
- Resume must not discard already completed check evidence.

---

### Task 1: Implement the verification job producer

**Files:**
- Create: `src/jobs/verification.ts`
- Modify: `src/jobs/runner.ts`
- Create: `scripts/async-verification-smoke.mjs`

**Interfaces:**
- Produces a registered `verification` job payload containing workspace identity, selected check IDs or changed paths, mode (`checks` or `verify`), completed phases, and bounded result metadata.

- [ ] **Step 1: Write worker tests first**

Create a two-check fixture. Assert the worker persists phase transitions (`discover`, `check:<id>`, `summarize`), stores each completed check before starting the next, and produces the same structured result contract as synchronous verification.

Run: `node scripts/async-verification-smoke.mjs`
Expected: FAIL because the verification job producer is absent.

- [ ] **Step 2: Implement durable per-check checkpoints**

After every completed check, atomically update the job record/result fragment before launching another check. On interruption, `resume_job` restarts at the first incomplete check and reuses completed evidence.

- [ ] **Step 3: Preserve synchronous verification logic**

Refactor shared selection/parsing into reusable functions only where needed; do not fork a second implementation of trusted check discovery, structured test parsing, or repair metadata.

### Task 2: Add explicit async start tools

**Files:**
- Modify: `src/server.ts`
- Modify: `scripts/async-verification-smoke.mjs`

**Interfaces:**
- Produces: `start_checks` and `start_verification` MCP tools returning a `job_*` record immediately.

- [ ] **Step 1: Define strict schemas**

`start_checks` accepts discovered check IDs plus optional workspace/session fields. `start_verification` accepts changed paths and reuses the same selection logic as `verify_changes`. Neither accepts an arbitrary command string.

- [ ] **Step 2: Return immediately after durable launch**

The start tool creates/persists the job, launches the registered worker, and returns `job_id`, state, selected work summary, and the instruction to use `job_status`/`read_job_output`. It does not wait for the first check to finish.

### Task 3: Add automatic sync-to-async recommendation metadata

**Files:**
- Modify: `src/checksOps.ts`
- Modify: `src/server.ts`
- Modify: `scripts/async-verification-smoke.mjs`

**Interfaces:**
- Produces additive routing hints when selected verification is long/high-variance, without changing user-requested check coverage.

- [ ] **Step 1: Add deterministic routing-hint cases**

Examples: multiple checks whose aggregate configured timeout reaches the effective async-routing cutoff (75% of `syncCallDeadlineMs`), known stress/integration scripts, or unknown-duration selections return `recommended_execution="async"` and the matching async tool name.

- [ ] **Step 2: Keep routing advisory unless `execution=auto` is explicitly introduced**

Do not silently turn an explicitly synchronous call into background work in the first implementation. The host instructions from Plan 26 should choose the async start tool before invoking a risky synchronous call.

### Task 4: Verify parity, recovery, and commit

**Files:**
- Modify: `scripts/checks-smoke.mjs`
- Modify: `scripts/http-state-continuity-smoke.mjs`
- Modify: `README.md`, `FEATURES.md`, `docs/agentic/PROJECT_MEMORY.md` after implementation

- [ ] **Step 1: Verify sync/async result parity**

Run the same short fixture through `verify_changes` and `start_verification` + `job_status`; compare selected checks, pass/fail interpretation, and repair metadata.

- [ ] **Step 2: Verify a synthetic long job survives MCP call turnover**

The start call must return quickly; later status/output calls recover progress and terminal result from durable job state.

- [ ] **Step 3: Run gates**

Run: `node scripts/async-verification-smoke.mjs`
Run: `node scripts/checks-smoke.mjs`
Run: `npm run smoke`
Run: `npm run stress`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 4: Commit milestone**

```bash
git add src/jobs/verification.ts src/jobs/runner.ts src/checksOps.ts src/server.ts scripts/async-verification-smoke.mjs scripts/checks-smoke.mjs scripts/http-state-continuity-smoke.mjs README.md FEATURES.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add asynchronous verification jobs"
```

## Acceptance Criteria

- Long verification can be launched in a short MCP call and tracked by `job_*`.
- Async and sync verification use the same trusted-check and result semantics.
- Per-check progress is durably persisted before the next phase starts.
- Restart/session turnover never converts incomplete work into a false pass.
- No arbitrary-command job launcher is introduced.
