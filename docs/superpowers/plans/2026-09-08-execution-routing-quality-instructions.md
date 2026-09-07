# Deadline-Aware Execution Routing and Quality Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach ChatGPT to choose the correct execution primitive before starting long work while preserving the user's full goal, acceptance criteria, and verification quality across calls.

**Architecture:** Add deterministic duration/risk guidance to CodexPro server instructions and public prompt/docs. Keep the model as the semantic controller: it selects among synchronous tools, existing `proc_*`, structured `job_*`, and existing `goal_*` based on expected duration and workflow shape. The deadline never instructs the model to rush.

**Tech Stack:** TypeScript server instructions, Markdown operator/ChatGPT guidance, existing process/job/Goal tools.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Default synchronous deadline is 20 minutes; the effective deadline comes from `config.syncCallDeadlineMs`. Routing thresholds are advisory and derive from that effective value.
- `sync_preferred` cutoff = `min(5 minutes, 25% of effective deadline)`.
- `async_preferred` cutoff = `75% of effective deadline`; work between the preferred and async cutoffs may remain synchronous when low variance.
- Unknown/high-variance heavy work should route async regardless of nominal estimate. At the 20-minute default these formulas preserve the original 5-minute/15-minute thresholds.
- Multi-stage engineering with dependencies/review/projection: prefer Durable Goals when enabled and justified.
- Never reduce scope, test coverage, review depth, safety checks, or acceptance criteria to fit one call.
- Every continued call must materially advance durable state or verified evidence; do not busy-wait.

---

### Task 1: Encode the execution-class guidance in server instructions

**Files:**
- Modify: `src/server.ts` `serverInstructions()`
- Create: `scripts/execution-routing-smoke.mjs`

**Interfaces:**
- Produces: server guidance describing four practical primitives: synchronous tool, `proc_*`, `job_*`, and `goal_*`.

- [ ] **Step 1: Add failing instruction assertions**

Assert the generated instructions contain the effective configured deadline from `server_config`, identify 20 minutes as the default, state that it is a blocking-call deadline only, prohibit quality reduction, and direct long shell work to `start_workspace_process`, long structured verification to async job tools, and substantial multi-stage work to Durable Goals.

Run: `node scripts/execution-routing-smoke.mjs`
Expected: FAIL before instruction changes.

- [ ] **Step 2: Add concise deterministic routing text**

The instruction must say, in substance:

```text
Treat the configured synchronous tool-call deadline (20 minutes by default) as a transport boundary, never a task-quality target.
Do not rush, omit required work, or claim completion to fit it.
If correct completion will not comfortably fit one call, preserve the full goal and switch to a resumable primitive.
Use start_workspace_process for long shell commands, start_checks/start_verification for long verification, and Durable Goals for substantial multi-stage work with isolation/review needs.
```

- [ ] **Step 3: Include material-progress behavior**

When continuing across calls, the agent should complete one coherent phase, persist state/evidence, and then move to the next phase. Status polling should be condition-based and purposeful rather than repeated rapidly with no state change.

### Task 2: Add deterministic expected-duration/risk routing helpers

**Files:**
- Create: `src/executionGuidance.ts`
- Modify: `src/server.ts`
- Modify: `scripts/execution-routing-smoke.mjs`

**Interfaces:**
- Produces: a non-semantic `classifyExecutionHint()` helper returning `sync_preferred`, `sync_allowed`, `async_preferred`, or `durable_goal_candidate` plus reasons.

- [ ] **Step 1: Test boundary cases**

Use explicit metadata, not AI prediction. At the 20-minute default: expected 4 min -> `sync_preferred`; 10 min low variance -> `sync_allowed`; 16 min -> `async_preferred`. Add a non-default 12-minute case proving the relative cutoffs change to 3/9 minutes. Unknown high-variance work remains `async_preferred`; a dependency DAG/review-projection workflow remains `durable_goal_candidate`.

- [ ] **Step 2: Implement deterministic classification only**

The helper may use explicit estimates, selected-check timeout/count, known operation category, and high-variance flags. It must not inspect prompts or invent a duration from source code. Centralize threshold derivation from the effective deadline; do not separately hard-code 5/15 except as default-value regression expectations.

- [ ] **Step 3: Surface hints additively**

Where existing tools already know their likely execution shape (verification selection, process command category, Goal proposal), return an additive `execution_hint` with reason and recommended primitive. Do not auto-escalate permissions or start work without the user's existing authorization.

### Task 3: Update ChatGPT/operator instructions and examples

**Files:**
- Modify: `CHATGPT_PROMPT.md`
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `docs/goals.md`
- Modify: `docs/agentic/DEVELOPMENT_WORKFLOW.md`

- [ ] **Step 1: Update the reusable ChatGPT prompt**

Add the quality-preservation rule and execution-class routing. Explicitly say the agent should continue the same goal over multiple calls rather than compressing work into a lower-quality final call.

- [ ] **Step 2: Add workflow examples**

Document examples for model training/rendering (`proc_*`), long test suites (`job_*`), and multi-file engineering with review/projection (`goal_*`). Keep examples authorization-neutral: none may imply automatic commit/push/deploy.

- [ ] **Step 3: Add developer implementation guidance**

`DEVELOPMENT_WORKFLOW.md` should require new potentially-long tools to declare whether they are synchronous, process-backed, job-backed, or Goal-backed and how they honor the effective configured transport deadline without weakening acceptance criteria.

### Task 4: Verify instruction quality and commit

**Files:**
- Modify: `scripts/execution-routing-smoke.mjs`
- Modify: `docs/agentic/PROJECT_MEMORY.md` after verified implementation

- [ ] **Step 1: Run focused instruction/routing tests**

Run: `node scripts/execution-routing-smoke.mjs`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Run shared MCP/docs gate**

Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/executionGuidance.ts src/server.ts scripts/execution-routing-smoke.mjs CHATGPT_PROMPT.md README.md FEATURES.md docs/goals.md docs/agentic/DEVELOPMENT_WORKFLOW.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: route long work without reducing quality"
```

## Acceptance Criteria

- ChatGPT is explicitly told that the configured deadline (20 minutes by default) is a tool-call boundary, not a quality target.
- Guidance prohibits skipping scope/review/tests to fit the deadline.
- Long shell, long verification, and multi-stage engineering route to the correct existing/new durable primitive.
- Routing thresholds are deterministic and derived from, but separate from, the effective configured deadline; the default remains 20 minutes.
- Continued calls are instructed to make material persisted progress rather than busy-wait.
