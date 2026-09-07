# Durable Continuation Lifecycle and MCP API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bounded durable task-continuation state that ChatGPT can arm, checkpoint, request, complete, cancel, and recover across MCP calls.

**Architecture:** Create a focused continuation module outside `server.ts`, backed by atomic JSON records under the CodexPro state directory. MCP tools expose semantic lifecycle transitions; browser behavior is added only by later plans.

**Tech Stack:** TypeScript, existing config/state-directory helpers, atomic filesystem writes, MCP registration wrapper, existing activity/session conventions.

**Spec:** `docs/superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md`

## Global Constraints

- Planning design is opt-in and browser continuation is disabled by default.
- Records contain bounded task/evidence metadata only; never chain-of-thought, raw prompts, conversation output, secrets, or browser cookies.
- Completion is semantic-controller-only; browser state can never mark a task complete.
- Version 1 continuation dispatch always requires explicit user action.
- Preserve existing operation/process/job/Goal ownership and authorization boundaries.

---

### Task 1: Define continuation record and state transitions

**Files:**
- Create: `src/continuation/types.ts`
- Create: `src/continuation/store.ts`
- Create: `scripts/continuation-state-smoke.mjs`

**Interfaces:**
- Produces `ContinuationRecord`, `ContinuationState`, `ContinuationStore.create/require/update/list`, and validated transition helpers.
- [ ] **Step 1: Write failing store/transition tests**

Cover atomic create/update, schema version, workspace/session binding, monotonic record revision, allowed state transitions, restart recovery, bounded lists, and rejection of invalid terminal-state rewrites. Add a terminal-race case proving stale browser/watchdog writes cannot revive a completed/canceled task.

Run: `node scripts/continuation-state-smoke.mjs`
Expected: FAIL because the continuation modules do not exist.

- [ ] **Step 2: Implement the bounded record**

Use fields equivalent to:

```ts
interface ContinuationRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  mcpSessionId?: string;
  revision: number;
  state: "armed" | "working" | "continuation_requested" | "continuation_ready" | "awaiting_user_send" | "dispatched" | "waiting_for_auth" | "waiting_for_transport" | "paused_by_user" | "blocked_interaction" | "completed" | "canceled" | "error";
  title: string;
  currentPhase?: string;
  completedEvidence: string[];
  remainingWork: string[];
  continuationCount: number;
  outstandingNonce?: string;
  createdAt: string;
  updatedAt: string;
  lastHeartbeatAt?: string;
}
```

Cap title/phase strings, evidence/work arrays, individual entry lengths, and total serialized record size. Use atomic temp-write + rename semantics consistent with other durable stores.

- [ ] **Step 3: Run focused state smoke**

Run: `node scripts/continuation-state-smoke.mjs`
Expected: PASS.
### Task 2: Add semantic continuation operations

**Files:**
- Create: `src/continuation/ops.ts`
- Modify: `scripts/continuation-state-smoke.mjs`

**Interfaces:**
- Produces `armContinuation`, `checkpointContinuation`, `requestContinuation`, `completeContinuation`, `cancelContinuation`, `continuationStatus`, and `heartbeatContinuation`.

- [ ] **Step 1: Add failing operation tests**

Assert `arm` creates one active task per workspace/session unless an explicit ID is supplied; checkpoint replaces bounded phase/evidence/work metadata; request creates a fresh nonce; complete clears outstanding continuation; cancel is terminal; and heartbeat changes only liveness fields.

- [ ] **Step 2: Implement transition-checked operations**

Every operation must load the current record, validate the expected state/revision and caller workspace/session, then persist one atomic update with `revision + 1`. `complete` requires `remainingWork` to be empty or an explicit verified-complete flag supplied by the semantic controller; browser callers never receive that authority. `completed`/`canceled` atomically clear outstanding nonce/readiness fields and reject all later non-status transitions. Do not persist a deadline value as the task timing authority; later readiness evaluation consumes the current runtime snapshot.

- [ ] **Step 3: Verify recovery/idempotency**

Repeat the same checkpoint/request IDs and prove duplicate delivery cannot create multiple nonces or increment continuation count.

### Task 3: Register MCP tools and bounded status output

**Files:**
- Modify: `src/server.ts`
- Modify: `scripts/continuation-state-smoke.mjs`

**Interfaces:**
- Adds `continuation_arm`, `continuation_checkpoint`, `continuation_request`, `continuation_status`, `continuation_complete`, and `continuation_cancel`.

- [ ] **Step 1: Add MCP registration assertions**

Verify tool schemas enforce workspace/session binding, bounded arrays/strings, and do not expose browser pairing secrets or full stored files.

- [ ] **Step 2: Wire registration to `ops.ts`**

Keep `server.ts` registration-only. Return task ID, public state, current phase, bounded remaining work, continuation count, and whether user/browser action is required.

- [ ] **Step 3: Run focused + shared gates**

Run: `node scripts/continuation-state-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Expected: PASS.
### Task 4: Document and commit the milestone

**Files:**
- Modify: `docs/agentic/DECISIONS.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md` after verified implementation

- [ ] **Step 1: Record durable-state boundaries**

Document that continuation records hold bounded execution facts only and that only the semantic controller may mark a task complete.

- [ ] **Step 2: Run diff gate**

Run: `git diff --check`
Expected: PASS.

- [ ] **Step 3: Commit milestone**

```bash
git add src/continuation scripts/continuation-state-smoke.mjs src/server.ts docs/agentic/DECISIONS.md docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add durable continuation lifecycle"
```

## Acceptance Criteria

- Continuation state survives MCP/session turnover and process restart.
- Records are bounded, atomic, workspace/session-bound, and contain no hidden reasoning or browser credentials.
- Duplicate checkpoint/request delivery is idempotent.
- Terminal completion/cancel plus record revision prevents stale browser/watchdog state from rearming or dispatching a task.
- Continuation records never hard-code the 20-minute default or a saved next-run deadline as readiness authority.
- Browser code cannot complete/cancel a task outside explicitly granted narrow operations.
- MCP tools expose truthful incomplete/completed state without claiming browser automation exists yet.