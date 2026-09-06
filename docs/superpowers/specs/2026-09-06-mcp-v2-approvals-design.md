# MCP v2 Compatibility and Multi-Round Approvals Design

**Date:** 2026-09-06
**Status:** Planned
**Priority:** P2
**Plan ID:** 18
**Depends on:** 12, 13

## Goal

Adopt the stable MCP v2 package line in a compatibility-controlled stage, then use supported multi-round input requests for one-shot `ask` policy decisions without breaking legacy ChatGPT clients.

## Feature covered

- **#49 — MCP v2 compatibility plus capability-aware interactive approvals**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Stage 1 migrates SDK packages behind Plan 12's compatibility seam while retaining currently verified behavior. Stage 2 is separately gated: only after live client capability validation does CodexPro add `effect:"ask"`. For 2026-capable clients use `input_required`/request-state mechanisms; for older clients use legacy elicitation only if explicitly advertised; otherwise fail closed with a structured approval-required result.

### Proposed files

**Create**
- `src/mcpRequestContext.ts`
- `src/approvalOps.ts`
- `scripts/mcp-v2-compat-smoke.mjs`
- `scripts/mcp-approvals-smoke.mjs`

**Modify when implementation is authorized**
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

## Planned interfaces

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

## Requirements

- R-18-01: Stage 1 shall migrate package/import/transport compatibility without enabling 2026-only interaction behavior; full current smoke/release behavior must pass first.
- R-18-02: 2026 behavior is an explicit runtime/client compatibility decision, not inferred solely from installed package version.
- R-18-03: `ask` policy effect is unavailable until the connected client demonstrates a supported approval interaction path.
- R-18-04: An approval fingerprint binds workspace, action, normalized resources, and relevant expected state; a changed resource/request after approval requires a new approval.
- R-18-05: No target side effect may begin before the accepted approval is returned and its fingerprint validates.
- R-18-06: 2026-capable flow shall use the SDK's supported request-state validation/sealing mechanism rather than inventing a transport-hidden session secret.
- R-18-07: For a legacy client, use legacy elicitation only when the client advertises support; otherwise return a structured fail-closed approval-required error.
- R-18-08: Approvals are one-shot only in this plan; do not implement remember-always or workspace self-escalation.
- R-18-09: Live ChatGPT Developer Mode validation is a release gate because local SDK tests cannot prove hosted-client interoperability.

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
- `scripts/mcp-v2-compat-smoke.mjs`
- `scripts/mcp-approvals-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- MCP 2026-07-28 introduces explicit multi-round `input_required`/request-state interaction. This plan uses native protocol mechanisms where supported and keeps legacy behavior capability-gated.

## Alternatives rejected / non-goals

- persistent remember-always approvals
- MCP Tasks extension
- provider/model integration
- removing current explicit Goal approval fingerprints

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
