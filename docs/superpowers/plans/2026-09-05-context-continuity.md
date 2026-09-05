# Context, Instructions, Events, and Task Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Verified 2026-09-05. Conditional commit/push/publication steps were intentionally not executed without separate authorization.

**Goal:** Reduce repetitive MCP calls and make long tasks resumable through bounded batch reads/searches, path-specific instruction resolution, context gathering, workspace event cursors, and durable task checkpoints.

**Architecture:** Keep batch operations thin over existing guarded read/search primitives, while a context module composes ranked evidence. Task state stores only durable task metadata and evidence references, never hidden model reasoning or unrestricted repository snapshots.

**Tech Stack:** Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, Zod, existing Node standard-library primitives, current smoke/stress harnesses.

**Spec:** `docs/superpowers/specs/2026-09-05-context-continuity-design.md`

## Global Constraints
- Preserve CodexPro as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, or hosted source-code storage.
- All filesystem paths pass through PathGuard and existing blocked-path/redaction rules before use or disclosure.
- New external binaries are optional adapters; CodexPro shall not silently install them unless an existing explicit installer flow already owns that dependency.
- Windows, macOS, and Linux behavior must be explicit; Windows is a first-class target rather than a best-effort fallback.
- Prefer deep modules with small interfaces; keep src/server.ts as registration/orchestration glue rather than adding subsystem business logic there.
- Use existing dependencies first. Any dependency addition requires a documented reason, lockfile review, npm audit, and package-size review.
- Every state-changing feature must preserve unrelated dirty, staged, and untracked user work.
- Tests must prove failure before the fix/feature where practical, then cover the real MCP or CLI path and important platform edge cases.
- Commit and push steps in plans are conditional on explicit execution authorization; planning alone never commits or publishes.

**Plan dependencies:** 02, 04.

---

## File Structure
- Create: `src/contextOps.ts`
- Create: `src/instructionOps.ts`
- Create: `src/workspaceEvents.ts`
- Create: `src/taskStateOps.ts`
- Create: `scripts/context-continuity-smoke.mjs`
- Modify: `src/server.ts`
- Modify: `src/fsOps.ts`
- Modify: `src/searchOps.ts`
- Modify: `src/workspaceOps.ts`
- Modify: `src/config.ts`
- Modify: `CHANGELOG.md`
- Test: `scripts/context-continuity-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces
- `readMany(requests: ReadManyItem[]): Promise<ReadManyResult>`
- `searchMany(requests: SearchManyItem[]): Promise<SearchManyResult>`
- `gatherContext(request: GatherContextRequest): Promise<GatheredContext>`
- `instructionsForPath(path: string): Promise<InstructionResolution>`
- `workspaceEvents(cursor?: string): Promise<WorkspaceEventPage>`
- `saveTaskSnapshot(snapshot: TaskSnapshot): Promise<TaskSnapshotReceipt>`
- `loadTaskSnapshot(id: string): Promise<TaskSnapshot | null>`

### Task 1: Refresh authoritative state and establish RED contracts

**Files:**
- Test: `scripts/context-continuity-smoke.mjs`
- Test: `scripts/smoke.mjs`

- [ ] **Step 1: Re-read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, the spec above, current Git status/log/remotes, and current upstream PR/issue state.**

  Record any assumption that changed since 2026-09-05 in the task handoff before editing. If upstream already implements an interface, reconcile it instead of duplicating it.

- [ ] **Step 2: Add focused failing contract/regression cases for these behaviors:**
  - batch item failure is isolated and reported without skipping successful items
  - aggregate byte/result budgets cap read_many and search_many
  - instruction resolution follows nearest applicable AGENTS-style hierarchy and reports source order
  - gather_context ranks instructions, changed files, source, tests, manifests, and recent commits within one budget
  - workspace event cursor detects create/edit/delete/rename without exposing blocked paths
  - task snapshots contain goal, files inspected, verification, decisions, and remaining work but no chain-of-thought or secret content

- [ ] **Step 3: Run only the focused new smoke script(s) and confirm the new assertions fail for the intended missing behavior, not because the harness/environment is broken.**

  Run: `node scripts/context-continuity-smoke.mjs`.
  Expected: at least one new assertion fails against the pre-feature implementation while existing harness setup succeeds.

- [ ] **Step 4: Inspect the test diff and keep fixtures isolated in OS temp directories; no project source/profile/tunnel state may be mutated by the test setup.**

- [ ] **Step 5: Commit only if the execution request authorizes commits.**

  Suggested message: `test: define context continuity contracts`

### Task 2: Implement the deep subsystem module

**Files:**
- Create: `src/contextOps.ts`
- Create: `src/instructionOps.ts`
- Create: `src/workspaceEvents.ts`
- Create: `src/taskStateOps.ts`
- Create: `scripts/context-continuity-smoke.mjs`
- Modify: `src/server.ts`
- Modify: `src/fsOps.ts`
- Modify: `src/searchOps.ts`
- Modify: `src/workspaceOps.ts`
- Modify: `src/config.ts`
- Modify: `CHANGELOG.md`

**Interfaces produced:**
- `readMany(requests: ReadManyItem[]): Promise<ReadManyResult>`
- `searchMany(requests: SearchManyItem[]): Promise<SearchManyResult>`
- `gatherContext(request: GatherContextRequest): Promise<GatheredContext>`
- `instructionsForPath(path: string): Promise<InstructionResolution>`
- `workspaceEvents(cursor?: string): Promise<WorkspaceEventPage>`
- `saveTaskSnapshot(snapshot: TaskSnapshot): Promise<TaskSnapshotReceipt>`
- `loadTaskSnapshot(id: string): Promise<TaskSnapshot | null>`

- [ ] **Step 1: Implement the smallest internal types and module interfaces required by the RED contracts.**

  Keep persistence, locking, subprocess, provider, parsing, or policy details behind the module interface rather than exporting internal helpers to `server.ts`.

- [ ] **Step 2: Reuse existing `PathGuard`, redaction, workspace/config limits, and operation primitives instead of cloning their logic.**

- [ ] **Step 3: Add bounded error/result types that distinguish unavailable/degraded/invalid/stale states where the spec requires them.**

- [ ] **Step 4: Run the focused module smoke again.**
  Expected: core module cases pass before MCP/admin wiring is added.

- [ ] **Step 5: Commit if authorized.**
  Suggested message: `feat: add context continuity core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- Modify: `src/server.ts`
- Modify: `src/fsOps.ts`
- Modify: `src/searchOps.ts`
- Modify: `src/workspaceOps.ts`
- Modify: `src/config.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add only the config fields/CLI-env parsing required by the spec, with bounded defaults and explicit opt-in for risky/optional capability.**

- [ ] **Step 2: Register MCP tools/actions in `src/server.ts` through `registerCodexTool`; update minimal/standard/full mode lists only where the intended discoverability requires it.**

- [ ] **Step 3: Keep tool handlers thin: validate arguments, resolve workspace, invoke the subsystem interface, shape/redact the result, and return.**

- [ ] **Step 4: Add local admin/HTTP exposure only for read-only status or explicitly authorized local control described by the spec. Preserve token/auth/security-header behavior.**

- [ ] **Step 5: Run `npm run build` and the focused smoke script(s).**
  Expected: TypeScript build passes and the feature works through its actual MCP/CLI/admin path.

### Task 4: Close edge cases and integration risks

**Files:**
- Test: `scripts/context-continuity-smoke.mjs`
- Test: `scripts/smoke.mjs`
- Modify: `src/server.ts`
- Modify: `src/fsOps.ts`
- Modify: `src/searchOps.ts`
- Modify: `src/workspaceOps.ts`
- Modify: `src/config.ts`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add platform and lifecycle cases for Windows plus at least one Unix-compatible path whenever the feature touches paths, processes, Git, persistence, or external adapters.**

- [ ] **Step 2: Exercise stale IDs/hashes/cursors, duplicate/retry behavior, boundary limits, blocked paths, redaction, and cleanup/error paths applicable to this subsystem.**

- [ ] **Step 3: Verify disabled/unavailable modes hide or reject capability consistently in both `tools/list` and direct/supertool dispatch.**

- [ ] **Step 4: Run the focused smoke plus `npm run build`; add `npm run stress` only when this subsystem changes concurrency/process/output/resource behavior.**

- [ ] **Step 5: Review for leaked absolute paths, secrets, unbounded output, orphan processes/temp files, and unrelated Git changes.**

### Task 5: Documentation, release surface, and final verification

**Files:**
- Modify as applicable: `README.md`, `FAQ.md`, `SECURITY.md`, `config.example.env`, `CHANGELOG.md`, subsystem docs listed above.
- Modify: `package.json` only when adding a new smoke script to the normal suite or when an explicitly justified dependency is required.

- [ ] **Step 1: Document user-visible tools/configuration, safety boundaries, fallback behavior, and platform limitations without duplicating source-of-truth constants unnecessarily.**

- [ ] **Step 2: Update `CHANGELOG.md` with the behavior change; update `docs/agentic/PROJECT_MEMORY.md` only after the feature is verified and its state is durable.**

- [ ] **Step 3: Run `git diff --check` and inspect `git diff --stat` plus the full relevant diff.**

- [ ] **Step 4: Run the verification set required by `docs/agentic/DEVELOPMENT_WORKFLOW.md`.**
  Minimum for shared MCP behavior: `npm run build` then `npm run smoke`.
  Add `npm run stress` for concurrency/process/resource work.
  Add `npm audit --audit-level=high` and `npm run release:pack` for dependency/release work.

- [ ] **Step 5: Perform two-stage review: first spec compliance, then defect-first code quality/security review. Fix findings and rerun affected checks.**

- [ ] **Step 6: Commit/push/open PR only if explicitly authorized. Report exact commit/PR evidence rather than assuming publication succeeded.**
