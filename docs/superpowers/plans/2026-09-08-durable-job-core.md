# Durable Structured Job Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add persistent `job_*` state for structured long operations so work can continue locally while ChatGPT uses short status/output calls.

**Architecture:** Create a bounded out-of-workspace job store and detached worker contract modeled on the proven Goal store/worker pattern, but do not add a generic arbitrary-command job launcher. Public job tools inspect/control only jobs created by approved structured producers such as async verification.

**Tech Stack:** TypeScript, filesystem JSON records, detached Node workers, existing redaction/operation patterns, MCP tools.

**Spec:** `docs/superpowers/specs/2026-09-08-tool-deadline-resilience-design.md`

## Global Constraints

- Job state lives under `~/.codexpro/jobs` (or a bounded configured state root if later justified), never inside source workspaces.
- Job IDs are opaque `job_*`; records contain no prompts, hidden reasoning, secrets, or unrestricted environment values.
- No public `job_start(command)` exists.
- Status/output/cancel/resume are short calls and never wait for completion.
- Cancellation targets only verified CodexPro-owned worker identity and must defend against PID reuse.
- Output retention is bounded and redacted.

---

### Task 1: Define job records and persistent storage

**Files:**
- Create: `src/jobs/types.ts`
- Create: `src/jobs/store.ts`
- Create: `scripts/jobs-smoke.mjs`

**Interfaces:**
- Produces: `JobRecord`, `JobState`, `JobProgress`, `JobStore.create/require/update/list/appendOutput/readOutput`.

- [x] **Step 1: Write store tests first**

Cover atomic record creation/update, bounded listing, workspace ownership checks, output truncation/cursors, malformed-record rejection, and sanitized public records.

Run: `node scripts/jobs-smoke.mjs`
Expected: FAIL because the job modules do not exist.

- [x] **Step 2: Implement strict record schemas**

Use a record shape equivalent to:

```ts
type JobState = "queued" | "running" | "paused" | "completed" | "failed" | "canceled" | "interrupted";
interface JobProgress {
  phase: string;
  completed: number;
  total?: number;
  message?: string;
  lastProgressAt: string;
}
interface JobRecord {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  workspaceRoot: string;
  kind: "verification"; // first production producer; later kinds require an explicit registered implementation and plan
  state: JobState;
  createdAt: string;
  updatedAt: string;
  progress: JobProgress;
  worker?: { pid: number; startedAt: string; nonceHash: string };
  result?: Record<string, unknown>;
  error?: string;
}
```

Persist worker nonces only as hashes in public/state records; raw launch nonce may exist only in the worker's restricted local launch context.

### Task 2: Add detached structured-job worker ownership and recovery

**Files:**
- Create: `src/jobs/worker.ts`
- Create: `src/jobs/runner.ts`
- Modify: `src/jobs/store.ts`
- Modify: `scripts/jobs-smoke.mjs`

**Interfaces:**
- Produces: `launchStructuredJob()`, `reconcileJob()`, `cancelJob()`, and `resumeJob()` for registered job kinds only.

- [x] **Step 1: Add worker-identity tests**

Test launch metadata, completed-worker reconciliation, dead-worker transition to `interrupted`, and refusal to signal a PID whose process start identity/nonce does not match the recorded CodexPro worker.

- [x] **Step 2: Implement a registry of approved job producers**

`runner.ts` should map a bounded job kind to an internal worker entrypoint. Do not accept a model-provided executable or shell string as a job kind. Async verification registers its worker in Plan 25.

- [x] **Step 3: Implement recovery semantics**

On status/read/resume, reconcile persisted state with worker ownership. Completed result files win over stale `running` metadata. Missing/dead workers become `interrupted`; they are not silently reported as running.

- [x] **Step 4: Implement explicit resume**

`resumeJob()` may relaunch only job kinds whose producer supplied durable resume metadata. It must preserve completed phases and never re-run a completed phase merely because an MCP session changed.

### Task 3: Add bounded progress/output and short polling tools

**Files:**
- Modify: `src/server.ts`
- Modify: `src/jobs/store.ts`
- Modify: `scripts/jobs-smoke.mjs`

**Interfaces:**
- Produces MCP tools: `job_status`, `list_jobs`, `read_job_output`, `cancel_job`, `resume_job`.

- [x] **Step 1: Add MCP contract tests**

Assert each polling tool returns promptly from persisted state and never waits for the worker. `read_job_output` uses a cursor/byte cap analogous to `read_workspace_process_output`.

- [x] **Step 2: Register tools with existing policy/mode gates**

These tools are control/read tools, not generic execution. `cancel_job` and `resume_job` remain state-changing and must flow through existing operation/activity/policy hooks where applicable.

- [x] **Step 3: Add progress heartbeat rules**

Workers update `lastProgressAt` only on material events: phase transition, completed item, bounded new output, or terminal state. A timer-only heartbeat without work is optional diagnostic liveness and must not be treated as task progress.

- [x] **Step 4: Verify focused and shared behavior**

Run: `node scripts/jobs-smoke.mjs`
Run: `npm run build`
Run: `npm run smoke`
Expected: PASS.

### Task 4: Verify shutdown/restart and commit

**Files:**
- Modify: `scripts/http-state-continuity-smoke.mjs`
- Modify: `docs/agentic/PROJECT_MEMORY.md` after verified implementation

- [x] **Step 1: Add continuity test**

Create a synthetic structured job, simulate MCP session turnover/runtime state reload, and prove `job_status` reconstructs persisted state without confusing an unrelated PID for the job worker.

- [x] **Step 2: Run concurrency/recovery gate**

Run: `node scripts/http-state-continuity-smoke.mjs`
Run: `npm run stress`
Run: `git diff --check`
Expected: PASS.

- [x] **Step 3: Commit milestone**

```bash
git add src/jobs src/server.ts scripts/jobs-smoke.mjs scripts/http-state-continuity-smoke.mjs docs/agentic/PROJECT_MEMORY.md
git commit -m "feat: add durable structured job core"
```

## Task-aware browser continuation integration

Structured `job_*` work remains locally durable without browser activity. Plans 29–37 must observe canonical job state and suppress continuation while a job is productively running; they must not duplicate the job store or use browser turns as a job scheduler.

## Acceptance Criteria

- Structured long work can outlive one MCP call and is recoverable by `job_*` ID.
- Public job controls cannot launch arbitrary shell commands.
- Polling calls return from persisted state without long waiting.
- Progress metadata distinguishes material advancement from mere liveness.
- Output is cursor-based, bounded, and redacted.
- Cancellation cannot target an unrelated reused PID.
- Runtime/session turnover produces completed/interrupted truth rather than stale `running` state.
