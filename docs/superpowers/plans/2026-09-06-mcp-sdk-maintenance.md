# MCP SDK Maintenance and Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Planned only on 2026-09-06. This plan is **not execution-authorized** by the planning request that created it.

**Goal:** Move CodexPro Full from the old MCP SDK baseline to the maintained v1 line, isolate SDK-specific compatibility code, and prepare—but not enable—a controlled path to MCP v2.

**Architecture:** First upgrade the existing `@modelcontextprotocol/sdk` v1 dependency from `^1.17.4` to the latest maintained v1 release and prove exact behavioral parity. Then move SDK-shape compatibility into one `mcpCompat.ts` seam so a later v2 migration does not spread version checks through tool handlers or transports. MCP 2026 behavior remains disabled until Plan 18 explicitly validates it against ChatGPT.

**Tech Stack:** Node.js 20+, TypeScript, current MCP v1 SDK first, Express Streamable HTTP transport, existing smoke/release harness.

**Spec:** `docs/superpowers/specs/2026-09-06-mcp-sdk-maintenance-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 01, 04.

---

## File Structure

- Create: `src/mcpCompat.ts`
- Create: `scripts/mcp-compat-smoke.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server.ts`
- Modify: `src/http.ts`
- Modify: `src/stdio.ts`
- Modify: `scripts/smoke.mjs`
- Modify: `scripts/http-smoke.mjs`
- Modify: `scripts/http-state-continuity-smoke.mjs`
- Modify: `CHANGELOG.md`
- Test: `scripts/mcp-compat-smoke.mjs`
- Test: `scripts/http-smoke.mjs`
- Test: `scripts/http-state-continuity-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

```ts
export interface McpRuntimeCapabilities {
  sdkLine: "v1" | "v2";
  protocolEra: "2025" | "2026";
  supportsInputRequired: boolean;
  supportsTaskExtension: boolean;
}

export function registerToolCompat(
  server: unknown,
  name: string,
  options: Record<string, unknown>,
  handler: (args: unknown) => Promise<unknown> | unknown
): void;

export function createStdioTransportCompat(): unknown;
export function createHttpTransportCompat(options: Record<string, unknown>): unknown;
```

## Acceptance contracts carried from the spec

- Stage A shall update only to the maintained v1 SDK line and preserve existing MCP behavior before any v2 work begins.
- Tool schemas, safety annotations, tool cards/resources, Streamable HTTP `/mcp`, stdio, HTTP continuity, and supertool dispatch shall remain behaviorally compatible.
- SDK-specific feature detection and import/version branching shall live in `src/mcpCompat.ts`, not in individual tool handlers.
- Installing a v2 package shall not itself enable the 2026 protocol era or `input_required`; those changes belong to Plan 18.
- Dependency work shall include audit, package-content/release-pack verification, and a live ChatGPT compatibility check before release.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/mcp-compat-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/mcp-compat-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - all currently registered tool names and annotations are identical before/after the maintained-v1 upgrade
  - `/mcp` initialization and cross-request state continuity still work
  - stdio construction still succeeds
  - tool-card resources remain registerable
  - unsupported compatibility branches fail explicitly instead of silently dropping features

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "MCP SDK Maintenance and Compatibility fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/mcp-compat-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define mcp sdk maintenance contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/mcpCompat.ts`
- `scripts/mcp-compat-smoke.mjs`
- `package.json`
- `package-lock.json`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `CHANGELOG.md`

**Interfaces produced:**

```ts
export interface McpRuntimeCapabilities {
  sdkLine: "v1" | "v2";
  protocolEra: "2025" | "2026";
  supportsInputRequired: boolean;
  supportsTaskExtension: boolean;
}

export function registerToolCompat(
  server: unknown,
  name: string,
  options: Record<string, unknown>,
  handler: (args: unknown) => Promise<unknown> | unknown
): void;

export function createStdioTransportCompat(): unknown;
export function createHttpTransportCompat(options: Record<string, unknown>): unknown;
```

- [ ] **Step 1: Extract the existing `registerToolCompat` behavior from `src/server.ts` into `src/mcpCompat.ts` without changing descriptors, annotations, handlers, or telemetry behavior.**
- [ ] **Step 2: Add transport factory helpers that wrap the currently used stdio and Streamable HTTP server transport constructors so `src/http.ts` and `src/stdio.ts` no longer import version-sensitive transport paths directly.**
- [ ] **Step 3: Expose a read-only capability descriptor derived from the actually installed SDK line; default Stage A values remain `sdkLine="v1"`, `protocolEra="2025"`, `supportsInputRequired=false`, and `supportsTaskExtension=false`.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/mcp-compat-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add mcp sdk maintenance core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `package.json`
- `package-lock.json`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Do not add a new MCP tool for SDK maintenance.** Route the existing tool/resource registration and stdio/HTTP transport construction through `mcpCompat.ts`; existing public tool names, schemas, annotations, resources, and supertool actions must remain unchanged. If capability metadata is surfaced, add it only to existing sanitized `server_config`/diagnostics output.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/mcp-compat-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/mcp-compat-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `scripts/smoke.mjs`
- `package.json`
- `package-lock.json`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
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
- Modify after verified implementation: `README.md`, `FEATURES.md`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`; update `FAQ.md` only if user-facing compatibility/install guidance changes.
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

- MCP v2 migration
- 2026 `input_required` approvals
- MCP Tasks extension support
- any tunnel/provider change

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
