# Resumable Non-Process Batch Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let expensive in-process scans/analysis stop at a safe boundary and continue in a later MCP call without restarting from zero or running background work.

**Architecture:** Add opaque persisted `batch_*` continuation records for deterministic non-process work. Unlike `job_*`, a batch does no work between calls; each invocation advances a bounded chunk, persists its cursor/evidence, and returns when complete or when the shared call deadline says to yield.

**Tech Stack:** TypeScript, bounded JSON state, workspace/source fingerprints, existing analysis/context modules.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- `batch_*` is for resumable in-process work only; background work belongs to `job_*` or `proc_*`.
- A continuation record stores bounded indices/fingerprints/reasons, not source dumps or hidden reasoning.
- Resume validates workspace and relevant source fingerprint; stale cursors fail closed rather than mixing old/new analysis.
- Each continuation call must process a non-zero bounded chunk unless already terminal.
- Initial integration targets are `gather_context` and `inspect_workspace`; expand only from measured need.

---

### Task 1: Add the durable batch cursor store

**Files:**
- Create: `src/batches/types.ts`
- Create: `src/batches/store.ts`
- Create: `scripts/resumable-batch-smoke.mjs`

**Interfaces:**
- Produces: `BatchRecord`, `BatchStore.create/require/update/complete`, opaque `batch_*` IDs, and operation/source fingerprint validation.

- [ ] **Step 1: Write cursor-store tests first**

Cover atomic create/update, workspace binding, source-fingerprint mismatch, bounded state size, terminal records, and rejection of unknown operation kinds.

Run: `node scripts/resumable-batch-smoke.mjs`
Expected: FAIL before the batch modules exist.

- [ ] **Step 2: Implement a strict record shape**

Use fields equivalent to:

```ts
interface BatchRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  kind: "gather_context" | "inspect_workspace";
  requestFingerprint: string;
  sourceFingerprint: string;
  cursor: number;
  completedUnits: number;
  state: "active" | "completed" | "stale" | "canceled";
  createdAt: string;
  updatedAt: string;
}
```

Keep accumulated source content out of the cursor record; persist only bounded identifiers, ranking state, and hashes required to continue deterministically.

### Task 2: Make `gather_context` resumable

**Files:**
- Modify: `src/contextOps.ts`
- Modify: `src/server.ts`
- Modify: `scripts/context-v2-smoke.mjs`
- Modify: `scripts/resumable-batch-smoke.mjs`

**Interfaces:**
- Adds optional `continuation_token` input and additive `complete` / `continuation_token` output to `gather_context`.

- [ ] **Step 1: Add a forced-yield context test**

With a fake short deadline and a fixture large enough to require several units, assert the first call returns selected evidence plus `complete=false` and `batch_*`; the next call resumes after the persisted cursor and eventually returns `complete=true` without duplicating completed units.

- [ ] **Step 2: Introduce deterministic chunk boundaries**

Advance by existing context budgets (files/bytes/relationships) and deadline checks, not arbitrary elapsed sleeps. Before starting another expensive unit, call `deadline.shouldYield(estimatedUnitFloorMs)`; if true, persist and return.

- [ ] **Step 3: Guard against source drift**

Recompute the relevant workspace/source fingerprint on continuation. If changed inputs invalidate deterministic continuation, return a stale-continuation error with instructions to start a fresh gather rather than combining mismatched evidence.

### Task 3: Make `inspect_workspace` resumable where analysis is large

**Files:**
- Modify: `src/analysis/index.ts`
- Modify: `src/server.ts`
- Modify: `scripts/analysis-smoke.mjs`
- Modify: `scripts/resumable-batch-smoke.mjs`

- [ ] **Step 1: Add a multi-chunk inventory/analysis fixture**

Force a short test budget, verify the first call advances a real subset of files/symbol work, and verify continuation completes the same final bounded analysis as an uninterrupted run.

- [ ] **Step 2: Persist only resumable analytical state**

Store offsets/visited identifiers/hash summaries needed to continue. Do not persist raw source bodies, prompt text, or a second unbounded analysis cache.

### Task 4: Verify continuation quality and commit

**Files:**
- Modify: `FEATURES.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md` after verified implementation

- [ ] **Step 1: Compare resumed vs uninterrupted outputs**

For deterministic fixtures, the completed resumed result must match the uninterrupted result in selected paths/relationships/reasons subject to the same existing output bounds.

- [ ] **Step 2: Run gates**

Run: `node scripts/resumable-batch-smoke.mjs`
Run: `node scripts/context-v2-smoke.mjs`
Run: `node scripts/analysis-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/batches src/contextOps.ts src/analysis/index.ts src/server.ts scripts/resumable-batch-smoke.mjs scripts/context-v2-smoke.mjs scripts/analysis-smoke.mjs FEATURES.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add resumable analysis batches"
```

## Task-aware browser continuation integration

`batch_*` continuation remains an MCP/data continuation primitive, not a browser turn primitive. Plans 29–37 may help the user start the next ChatGPT turn when another semantic batch step is needed, but resumed batch correctness remains governed by this plan's fingerprints/cursors.

## Acceptance Criteria

- Large non-process work can yield before the effective configured synchronous boundary and resume by opaque `batch_*` ID.
- No background work runs between batch continuation calls.
- Resumed completed results preserve the same quality/bounds as uninterrupted execution.
- Stale source/input fingerprints invalidate continuation safely.
- Persisted batch state remains bounded and contains no source dump or hidden reasoning.
