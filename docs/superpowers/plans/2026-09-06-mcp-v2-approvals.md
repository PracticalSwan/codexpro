# MCP v2 Compatibility and Multi-Round Approvals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Planned only on 2026-09-06. This plan is **not execution-authorized** by the planning request that created it.

**Goal:** Adopt the stable MCP v2 package line in a compatibility-controlled stage, then use supported multi-round input requests for one-shot `ask` policy decisions without breaking legacy ChatGPT clients.

**Architecture:** Stage 1 migrates SDK packages behind Plan 12's compatibility seam while retaining currently verified behavior. Stage 2 is separately gated: only after live client capability validation does CodexPro add `effect:"ask"`. For 2026-capable clients use `input_required`/request-state mechanisms; for older clients use legacy elicitation only if explicitly advertised; otherwise fail closed with a structured approval-required result.

**Tech Stack:** MCP TypeScript SDK v2 (`@modelcontextprotocol/server`/`node`) when implementation is authorized, TypeScript, existing policy/HTTP/stdio surfaces.

**Spec:** `docs/superpowers/specs/2026-09-06-mcp-v2-approvals-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 12, 13.

---

## File Structure

- Create: `src/mcpRequestContext.ts`
- Create: `src/approvalOps.ts`
- Create: `scripts/mcp-v2-compat-smoke.mjs`
- Create: `scripts/mcp-approvals-smoke.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/mcpCompat.ts`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/stdio.ts`
- Modify: `src/policyRules.ts`
- Modify: `src/policyOps.ts`
- Modify: `scripts/http-smoke.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `docs/workspace-policy.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/mcp-v2-compat-smoke.mjs`
- Test: `scripts/mcp-approvals-smoke.mjs`
- Test: `scripts/http-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

```ts
export interface ApprovalRequest {
  workspaceId: string;
  action: string;
  resources: string[];
  fingerprint: string;
  reason: string;
}

export interface ApprovalDecision {
  approved: boolean;
  fingerprint: string;
}

export async function requestOneShotApproval(
  context: McpRequestContext,
  request: ApprovalRequest
): Promise<ApprovalDecision>;
```

## Acceptance contracts carried from the spec

- Stage 1 shall migrate package/import/transport compatibility without enabling 2026-only interaction behavior; full current smoke/release behavior must pass first.
- 2026 behavior is an explicit runtime/client compatibility decision, not inferred solely from installed package version.
- `ask` policy effect is unavailable until the connected client demonstrates a supported approval interaction path.
- An approval fingerprint binds workspace, action, normalized resources, and relevant expected state; a changed resource/request after approval requires a new approval.
- No target side effect may begin before the accepted approval is returned and its fingerprint validates.
- 2026-capable flow shall use the SDK's supported request-state validation/sealing mechanism rather than inventing a transport-hidden session secret.
- For a legacy client, use legacy elicitation only when the client advertises support; otherwise return a structured fail-closed approval-required error.
- Approvals are one-shot only in this plan; do not implement remember-always or workspace self-escalation.
- Live ChatGPT Developer Mode validation is a release gate because local SDK tests cannot prove hosted-client interoperability.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/mcp-v2-compat-smoke.mjs`
- `scripts/mcp-approvals-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/mcp-v2-compat-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - v2 package migration preserves all existing tools/resources/annotations and HTTP continuity before approvals are enabled
  - unsupported clients fail closed on `ask` rather than auto-allowing
  - approval for resource A cannot authorize resource B or a changed command
  - declined/cancelled approval performs no mutation
  - accepted one-shot approval permits exactly the bound call
  - legacy and 2026 test clients select the correct interaction mechanism

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "MCP v2 Compatibility and Multi-Round Approvals fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/mcp-v2-compat-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define mcp v2 approvals contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/mcpRequestContext.ts`
- `src/approvalOps.ts`
- `scripts/mcp-v2-compat-smoke.mjs`
- `scripts/mcp-approvals-smoke.mjs`
- `package.json`
- `package-lock.json`
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/policyRules.ts`
- `src/policyOps.ts`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Interfaces produced:**

```ts
export interface ApprovalRequest {
  workspaceId: string;
  action: string;
  resources: string[];
  fingerprint: string;
  reason: string;
}

export interface ApprovalDecision {
  approved: boolean;
  fingerprint: string;
}

export async function requestOneShotApproval(
  context: McpRequestContext,
  request: ApprovalRequest
): Promise<ApprovalDecision>;
```

- [ ] **Step 1: Complete SDK v2 import/transport migration behind `mcpCompat.ts` and expose negotiated/client capability state through a small request context.**
- [ ] **Step 2: Add `ask` to policy schema only when an approval requester is available; policy evaluation returns a pending approval description rather than calling the underlying handler.**
- [ ] **Step 3: Implement one-shot approval request/response handling with fingerprint verification and explicit cancellation/decline semantics.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/mcp-v2-compat-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add mcp v2 approvals core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `package.json`
- `package-lock.json`
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/policyRules.ts`
- `src/policyOps.ts`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Do not add an `approve_*` MCP tool.** Integrate one-shot approval into the central pre-dispatch policy/request-context path: an `ask` decision pauses before the underlying handler, invokes the negotiated MCP interaction mechanism, validates the returned fingerprint, then either dispatches exactly once or returns a structured declined/cancelled/unsupported result.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/mcp-v2-compat-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/mcp-v2-compat-smoke.mjs`
- `scripts/mcp-approvals-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`
- `package.json`
- `package-lock.json`
- `src/mcpCompat.ts`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `src/policyRules.ts`
- `src/policyOps.ts`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

- [ ] **Step 1: Add Windows and Unix-compatible path/process cases where applicable.**

  Use canonical realpaths in fixtures. Do not assume `/tmp`, drive-letter casing, Git identity, shell quoting, or symlink behavior is identical across platforms.

- [ ] **Step 2: Exercise stale/duplicate/boundary behavior.**

  Test subsystem identifiers/fingerprints/cursors, retry/idempotency behavior, disabled modes, size/count/time limits, cleanup after failure, and redaction boundaries.

- [ ] **Step 3: Exercise policy and supertool equivalence.**

  If callable, prove workspace policy and supertool cannot bypass the same authorization checks as the explicit tool.

- [ ] **Step 4: Run broader verification proportional to risk.**

  Minimum:
  - `npm run build`
  - focused smoke(s)
  - `npm run smoke` when shared MCP/runtime behavior changed

  Additional required for this plan:
  - `npm audit --audit-level=high` and `npm run release:pack` because this plan changes MCP dependencies/release compatibility

- [ ] **Step 5: Review for residual state.**

  Confirm no orphan processes/containers/temp files, no absolute-path leaks, no secret-bearing persisted data, no unintended dependency changes, and no unrelated Git modifications.

### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after verified implementation: `docs/workspace-policy.md`, `README.md`, `FEATURES.md`, `SECURITY.md`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
- Modify: `docs/agentic/PROJECT_MEMORY.md` only after implementation has actually been verified.

- [ ] **Step 1: Document actual behavior, configuration, safety boundaries, compatibility/fallback behavior, and platform limitations.**

  Do not describe planned behavior as shipped.

- [ ] **Step 2: Run plan-specific final verification.**

  Run `git diff --check`, inspect `git diff --stat`, inspect the full relevant diff, then run the verification set required by `docs/agentic/DEVELOPMENT_WORKFLOW.md`.

- [ ] **Step 3: Perform two review passes.**

  Pass 1: spec/acceptance-contract compliance.
  Pass 2: defect-first code quality/security/portability/boundedness review.

- [ ] **Step 4: Update durable state only from evidence.**

  If verified, update `PLAN_INDEX.md` status and `PROJECT_MEMORY.md` with durable facts. Do not mark Released without direct release evidence.

- [ ] **Step 5: Commit/push/release only if explicitly authorized by the execution request.**

  Report exact commit, remote, CI, release, and installation evidence for each external action actually performed.

## Non-goals for this plan

- persistent remember-always approvals
- MCP Tasks extension
- provider/model integration
- removing current explicit Goal approval fingerprints

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
