# MCP SDK Maintenance and Compatibility Design

**Date:** 2026-09-06
**Status:** Planned
**Priority:** P0
**Plan ID:** 12
**Depends on:** 01, 04

## Goal

Move CodexPro Full from the old MCP SDK baseline to the maintained v1 line, isolate SDK-specific compatibility code, and prepare—but not enable—a controlled path to MCP v2.

## Feature covered

- **#41 — MCP SDK maintenance and compatibility seam**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

First upgrade the existing `@modelcontextprotocol/sdk` v1 dependency from `^1.17.4` to the latest maintained v1 release and prove exact behavioral parity. Then move SDK-shape compatibility into one `mcpCompat.ts` seam so a later v2 migration does not spread version checks through tool handlers or transports. MCP 2026 behavior remains disabled until Plan 18 explicitly validates it against ChatGPT.

### Proposed files

**Create**
- `src/mcpCompat.ts`
- `scripts/mcp-compat-smoke.mjs`

**Modify when implementation is authorized**
- `package.json`
- `package-lock.json`
- `src/server.ts`
- `src/http.ts`
- `src/stdio.ts`
- `scripts/smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `CHANGELOG.md`

## Planned interfaces

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

## Requirements

- R-12-01: Stage A shall update only to the maintained v1 SDK line and preserve existing MCP behavior before any v2 work begins.
- R-12-02: Tool schemas, safety annotations, tool cards/resources, Streamable HTTP `/mcp`, stdio, HTTP continuity, and supertool dispatch shall remain behaviorally compatible.
- R-12-03: SDK-specific feature detection and import/version branching shall live in `src/mcpCompat.ts`, not in individual tool handlers.
- R-12-04: Installing a v2 package shall not itself enable the 2026 protocol era or `input_required`; those changes belong to Plan 18.
- R-12-05: Dependency work shall include audit, package-content/release-pack verification, and a live ChatGPT compatibility check before release.

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
- `scripts/mcp-compat-smoke.mjs`
- `scripts/http-smoke.mjs`
- `scripts/http-state-continuity-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Current repository dependency: `@modelcontextprotocol/sdk ^1.17.4`.
- Read-only npm check on 2026-09-06: latest v1 is 1.30.0; v2 server/node packages are 2.0.0.

## Alternatives rejected / non-goals

- MCP v2 migration
- 2026 `input_required` approvals
- MCP Tasks extension support
- any tunnel/provider change

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
