# Granular Tool and Resource Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Planned only on 2026-09-06. This plan is **not execution-authorized** by the planning request that created it.

**Goal:** Extend the tightening-only workspace policy with deterministic per-action and per-resource allow/deny rules without weakening the existing global/profile gates.

**Architecture:** Introduce a small policy-rule evaluator used by the existing central tool-policy seam. Global/profile capability gates run first; workspace rules can only further restrict calls. Version 1 policy files remain valid. Version 2 adds ordered rules over normalized action/resource pairs; `ask` is intentionally deferred to Plan 18.

**Tech Stack:** TypeScript, Zod, minimatch, existing `WorkspacePolicyRegistry`, central `registerCodexTool` policy seam.

**Spec:** `docs/superpowers/specs/2026-09-06-granular-policy-rules-design.md`

## Global Constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

**Plan dependencies:** 02, 03, 12.

---

## File Structure

- Create: `src/policyRules.ts`
- Create: `scripts/policy-rules-smoke.mjs`
- Modify: `src/policyOps.ts`
- Modify: `src/server.ts`
- Modify: `src/config.ts`
- Modify: `scripts/policy-smoke.mjs`
- Modify: `scripts/smoke.mjs`
- Modify: `docs/workspace-policy.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Test: `scripts/policy-rules-smoke.mjs`
- Test: `scripts/policy-smoke.mjs`
- Test: `scripts/smoke.mjs`

## Planned Interfaces

```ts
export type PolicyRuleEffect = "allow" | "deny";

export interface PolicyRule {
  action: string;
  resource: string;
  effect: PolicyRuleEffect;
}

export interface PolicyDecision {
  effect: PolicyRuleEffect;
  matchedRule?: PolicyRule;
  resource: string;
}

export function evaluatePolicyRules(
  rules: PolicyRule[],
  action: string,
  resources: string[]
): PolicyDecision;
```

## Acceptance contracts carried from the spec

- Policy schema version 1 shall remain readable with identical behavior.
- Schema version 2 may add `toolRules`, but rules may never widen a tool or capability disabled by the global/profile configuration.
- Rules are evaluated in declaration order with the last matching rule winning; absence of a matching rule preserves the already-authorized baseline behavior.
- Initial effects are only `allow` and `deny`; interactive `ask` is reserved for Plan 18.
- Resources must be normalized before matching: workspace-relative POSIX-style paths for filesystem tools, normalized full command text for Bash, and bounded `remote/branch` identifiers for Git publication tools.
- A multi-resource mutation is denied if any target resource is denied.
- The supertool must pass through the same rule evaluation as explicit tools.
- Do not add a general shell parser; existing safe-Bash command-shape restrictions remain a separate stronger boundary.

### Task 1: Refresh state and establish focused contracts

**Files:**
- `scripts/policy-rules-smoke.mjs`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`

**Interfaces consumed:** existing CodexPro public/runtime behavior at the execution-time `main` HEAD.
**Produces:** focused regression/contract coverage that proves the planned boundary before implementation.

- [ ] **Step 1: Recover authoritative execution-time state.**

  Read `AGENTS.md`, `docs/agentic/PROJECT_MEMORY.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, this spec/plan, current Git status/log/remotes, relevant source modules, and fresh upstream/protocol state. Record any assumption that no longer holds before editing.

- [ ] **Step 2: Add focused contract cases to `scripts/policy-rules-smoke.mjs`.**

  Use Node's strict assertions and OS-temp fixtures. The focused cases must cover:

  - a project rule cannot re-enable a globally disabled `git_push`, Bash, write mode, Goals, or artifact export
  - a deny on `src/generated/**` blocks write/edit/patch/change-set mutations targeting that path
  - an allow rule cannot override a prior global capability denial
  - last matching rule wins among workspace rules
  - supertool dispatch is denied exactly like the underlying explicit tool

  Structure the smoke entry point so setup failures are distinguishable from the intended missing/changed behavior:

```js
import assert from "node:assert/strict";

async function main() {
  // Construct only isolated temp/project state needed by this subsystem.
  // Call the real exported module or MCP surface described by this plan.
  assert.ok(true, "Granular Tool and Resource Policy fixture initialized");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 3: Run the focused smoke before implementation.**

  Run: `npm run build && node scripts/policy-rules-smoke.mjs`

  Expected: existing baseline assertions pass. For net-new behavior, the new contract must fail at the exact missing boundary; for pure dependency-maintenance/parity portions, capture passing pre-change behavior as the comparison baseline rather than manufacturing a meaningless failure.

- [ ] **Step 4: Inspect fixture isolation.**

  Confirm tests use OS temp directories or in-memory state, leave profiles/tunnels/global packages untouched, and clean up owned processes/files in `finally`.

- [ ] **Step 5: Commit only if a later execution request explicitly authorizes commits.**

  Suggested message: `test: define granular policy rules contracts`

### Task 2: Implement the focused subsystem core

**Files:**
- `src/policyRules.ts`
- `scripts/policy-rules-smoke.mjs`
- `src/policyOps.ts`
- `src/server.ts`
- `src/config.ts`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Interfaces produced:**

```ts
export type PolicyRuleEffect = "allow" | "deny";

export interface PolicyRule {
  action: string;
  resource: string;
  effect: PolicyRuleEffect;
}

export interface PolicyDecision {
  effect: PolicyRuleEffect;
  matchedRule?: PolicyRule;
  resource: string;
}

export function evaluatePolicyRules(
  rules: PolicyRule[],
  action: string,
  resources: string[]
): PolicyDecision;
```

- [ ] **Step 1: Define v2 policy Zod types and normalization helpers in `src/policyRules.ts`; reject absolute filesystem resources, `..` escapes, NUL/newline-bearing patterns, and unbounded rule arrays.**
- [ ] **Step 2: Add an evaluator that receives already-normalized action/resources and returns the final matching decision without performing side effects.**
- [ ] **Step 3: Extend `WorkspacePolicyRegistry` so version 1 and version 2 policies produce the same effective capability configuration while v2 additionally exposes compiled rules.**

- [ ] **Step 4: Reuse existing safety primitives rather than duplicating them.**

  Route paths through `PathGuard`, use current redaction helpers, current config/policy gates, and the operation/lease layer when the behavior mutates state. Keep the new module independently testable and keep version/provider/platform branching out of individual tool handlers.

- [ ] **Step 5: Run the focused module smoke.**

  Run: `npm run build && node scripts/policy-rules-smoke.mjs`

  Expected: core contracts pass before broad MCP/admin wiring is added.

- [ ] **Step 6: Commit only if authorized.**

  Suggested message: `feat: add granular policy rules core`

### Task 3: Wire configuration and real product surfaces

**Files:**
- `src/policyOps.ts`
- `src/server.ts`
- `src/config.ts`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

**Consumes:** the Task 2 interfaces above.
**Produces:** the minimum MCP/CLI/config/docs surface required by the spec.

- [ ] **Step 1: Add only planned configuration/schema fields.**

  Defaults must preserve current 0.32.3 behavior. Risky/optional capability stays disabled unless this spec explicitly says otherwise. Validate values at load time and include them in sanitized diagnostic/effective-policy output only when safe.

- [ ] **Step 2: Do not add a new policy tool.** Extend the existing `workspaceToolPolicyByServer` pre-dispatch seam so it derives normalized resources for the requested action and evaluates v2 rules before the handler runs. Extend the existing read-only `effective_policy` result with a bounded sanitized rule summary (schema version, rule count, effects present); do not expose a second policy source of truth.

- [ ] **Step 3: Update direct/supertool/tool-list gating consistently.**

  Where a new tool exists, ensure `toolNamesForMode`, `shouldRegisterTool`, effective workspace policy checks, connection-test hiding, annotations, and supertool dispatch all agree.

- [ ] **Step 4: Add CLI/admin exposure only where the spec requires it.**

  CLI/admin changes must be non-secret, bounded, and preserve current auth/CSP/security-header behavior.

- [ ] **Step 5: Run focused tests plus TypeScript build.**

  Run: `npm run build && node scripts/policy-rules-smoke.mjs`

  Expected: build passes and the feature works through its real public surface.

### Task 4: Close safety, platform, and lifecycle edge cases

**Files:**
- `scripts/policy-rules-smoke.mjs`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`
- `src/policyOps.ts`
- `src/server.ts`
- `src/config.ts`
- `scripts/policy-smoke.mjs`
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
  - no extra suite beyond the workflow-required set unless implementation expands the risk surface

- [ ] **Step 5: Review for residual state.**

  Confirm no orphan processes/containers/temp files, no absolute-path leaks, no secret-bearing persisted data, no unintended dependency changes, and no unrelated Git modifications.

### Task 5: Documentation, review, and execution handoff

**Files:**
- Modify after verified implementation: `docs/workspace-policy.md`, `FEATURES.md`, `SECURITY.md`, `CHANGELOG.md`, and `docs/agentic/PROJECT_MEMORY.md`.
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

- interactive approvals
- remember-always permission decisions
- a new shell grammar
- organization/cloud policy distribution

## Self-review checklist before implementation handoff

- [ ] Every spec requirement maps to a task above.
- [ ] No task widens CodexPro's product/security boundary.
- [ ] Interface/type names are consistent between spec and plan.
- [ ] There are no placeholder requirements or unspecified side effects.
- [ ] The test plan distinguishes local/static evidence from live hosted-client/external-service evidence where applicable.
