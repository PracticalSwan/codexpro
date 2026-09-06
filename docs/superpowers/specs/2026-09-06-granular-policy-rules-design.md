# Granular Tool and Resource Policy Design

**Date:** 2026-09-06
**Status:** Planned
**Priority:** P0
**Plan ID:** 13
**Depends on:** 02, 03, 12

## Goal

Extend the tightening-only workspace policy with deterministic per-action and per-resource allow/deny rules without weakening the existing global/profile gates.

## Feature covered

- **#42 — granular action/resource allow-deny rules**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Introduce a small policy-rule evaluator used by the existing central tool-policy seam. Global/profile capability gates run first; workspace rules can only further restrict calls. Version 1 policy files remain valid. Version 2 adds ordered rules over normalized action/resource pairs; `ask` is intentionally deferred to Plan 18.

### Proposed files

**Create**
- `src/policyRules.ts`
- `scripts/policy-rules-smoke.mjs`

**Modify when implementation is authorized**
- `src/policyOps.ts`
- `src/server.ts`
- `src/config.ts`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`
- `docs/workspace-policy.md`
- `SECURITY.md`
- `CHANGELOG.md`

## Planned interfaces

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

## Requirements

- R-13-01: Policy schema version 1 shall remain readable with identical behavior.
- R-13-02: Schema version 2 may add `toolRules`, but rules may never widen a tool or capability disabled by the global/profile configuration.
- R-13-03: Rules are evaluated in declaration order with the last matching rule winning; absence of a matching rule preserves the already-authorized baseline behavior.
- R-13-04: Initial effects are only `allow` and `deny`; interactive `ask` is reserved for Plan 18.
- R-13-05: Resources must be normalized before matching: workspace-relative POSIX-style paths for filesystem tools, normalized full command text for Bash, and bounded `remote/branch` identifiers for Git publication tools.
- R-13-06: A multi-resource mutation is denied if any target resource is denied.
- R-13-07: The supertool must pass through the same rule evaluation as explicit tools.
- R-13-08: Do not add a general shell parser; existing safe-Bash command-shape restrictions remain a separate stronger boundary.

## Cross-cutting constraints

- Preserve CodexPro Full as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, hosted source-code storage, or unrestricted remote execution.
- All filesystem paths continue through `PathGuard`; existing blocked-path, secret-detection, redaction, write-mode, and capability gates remain authoritative.
- Workspace-local configuration may only tighten authority inherited from the global/profile configuration.
- Keep `src/server.ts` as registration/orchestration glue; subsystem behavior belongs in focused modules with small interfaces.
- Use existing dependencies and Node.js standard-library primitives first. Any dependency change requires lockfile review, `npm audit --audit-level=high`, package-size review, and release-pack verification.
- Windows remains a first-class target. Any path, process, Git, persistence, or external-adapter behavior must have explicit Windows semantics and tests.
- Preserve unrelated dirty, staged, untracked, profile, tunnel, credential, and user-owned state.
- Do not commit, push, publish, deploy, install global packages, change tunnels, or mutate external services unless a later execution request explicitly authorizes those actions.

## Failure model

- Invalid or stale identifiers, fingerprints, capabilities, paths, cursors, and expected state fail closed with bounded structured errors.
- Optional integrations report unavailable/degraded state rather than silently widening authority or changing execution mode.
- Potentially large input/output is bounded before materialization where practical.
- User-facing errors and persisted summaries pass through existing redaction/sanitization boundaries.
- A partial failure must not overwrite unrelated user work or imply that an external side effect succeeded.

## Security and privacy

- No interface in this design bypasses `PathGuard`, global/profile gates, workspace-policy tightening, or secret redaction.
- Persistent records are scoped to the minimum fields/content required by this subsystem.
- No model prompt, unrestricted transcript, raw credential, or unbounded environment is introduced as persistent state.
- External effects remain explicitly gated and are not authorized by this planning document.

## Verification strategy

Focused verification:
- `scripts/policy-rules-smoke.mjs`
- `scripts/policy-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Borrow the action/resource/effect simplicity seen in modern agent harness permission systems, while retaining CodexPro's tightening-only policy invariant.

## Alternatives rejected / non-goals

- interactive approvals
- remember-always permission decisions
- a new shell grammar
- organization/cloud policy distribution

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
