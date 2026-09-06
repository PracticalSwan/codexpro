# Trusted Lifecycle Hooks and Project Trust Design

**Date:** 2026-09-06
**Status:** Planned
**Priority:** P0
**Plan ID:** 14
**Depends on:** 03, 04, 13

## Goal

Add a minimal deterministic hook system for trusted projects while preventing repository-controlled hook configuration from gaining execution merely by being opened.

## Feature covered

- **#43 — lifecycle hooks**
- **#44 — project trust fingerprints**

## Current-state fit

CodexPro Full 0.32.3 already has the operation journal, workspace policy, diagnostics, process manager, context continuity, Git intelligence, optional code intelligence, and Durable Goals from Plans 01–11. This design extends those seams instead of adding a parallel agent framework. This is a planning artifact only; it does not authorize source changes, dependency changes, installation, release, tunnel changes, or external-service mutation.

## Architecture

Keep executable hook configuration in a separate `.codexpro-hooks.json` and store trust decisions outside the repository under the user's CodexPro state directory. A project hook file is executable only when its canonical workspace path and exact hook-file fingerprint match an out-of-repo trust record. Hooks run as argv arrays with sanitized environment, strict time/output limits, and no ability to widen policy.

### Proposed files

**Create**
- `src/hooks/types.ts`
- `src/hooks/store.ts`
- `src/hooks/runner.ts`
- `src/projectTrust.ts`
- `scripts/hooks-smoke.mjs`
- `docs/hooks.md`

**Modify when implementation is authorized**
- `src/server.ts`
- `src/runtimeState.ts`
- `src/config.ts`
- `scripts/codexpro.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`
- `README.md`
- `SECURITY.md`
- `CHANGELOG.md`

## Planned interfaces

```ts
export type HookEvent = "session_start" | "before_tool" | "after_tool" | "task_end";

export interface HookCommand {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface HookRunResult {
  event: HookEvent;
  status: "allowed" | "blocked" | "warning" | "skipped";
  exitCode: number | null;
  message?: string;
}

export function projectTrustStatus(root: string, hookBytes: Buffer): Promise<ProjectTrustStatus>;
export function runHooks(event: HookEvent, request: HookRequest): Promise<HookRunResult[]>;
```

## Requirements

- R-14-01: Executable hooks shall never run merely because `.codexpro-hooks.json` exists.
- R-14-02: Trust shall be stored outside the repository and bind the canonical realpath plus SHA-256 of the exact hook configuration; any hook-file change invalidates prior trust.
- R-14-03: Trust mutation shall be local CLI-only in the first version (`codexpro trust status`, `codexpro trust hooks`); MCP exposes only the read-only `project_trust_status` tool for the selected/explicit workspace.
- R-14-04: Supported events are exactly `session_start`, `before_tool`, `after_tool`, and `task_end` in the first version.
- R-14-05: `task_end` shall fire only at unambiguous CodexPro-owned boundaries such as a Goal reaching review or a terminal handoff workflow; ad-hoc chat activity does not synthesize a task boundary.
- R-14-06: Hook commands shall be executable plus argv array, never one shell-interpolated string.
- R-14-07: Hooks receive a sanitized minimum environment and bounded JSON input; prompts, secrets, unrestricted source, and parent environment are excluded.
- R-14-08: `before_tool` exit 2 may block the tool; exit 0 allows; other nonzero exits are warnings. No hook can override a declarative deny or widen capability.
- R-14-09: Hook timeout/output limits are enforced independently of normal Bash mode and all surfaced errors pass through redaction.

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
- `scripts/hooks-smoke.mjs`
- `scripts/settings-smoke.mjs`
- `scripts/smoke.mjs`

Broader verification follows `docs/agentic/DEVELOPMENT_WORKFLOW.md`: focused smoke first, `npm run build`, then `npm run smoke` for shared MCP/runtime behavior; add `npm run stress` for concurrency/process/resource changes and audit/release-pack checks for dependency/release work.

## Research basis

- Claude Code, Gemini CLI, and Cline converge on deterministic hooks around model-driven workflows; Gemini's trust/fingerprint approach is particularly suitable for repository-supplied executable configuration.

## Alternatives rejected / non-goals

- hook marketplace
- model-invoking hooks
- automatic project trust
- remote trust synchronization
- more than four lifecycle events

A second workflow engine, model-provider router, unrestricted subagent runtime, and hidden authority escalation remain outside the product boundary unless a future product-level design explicitly changes that boundary.

## Completion criteria

Implementation is complete only when every requirement above has direct regression/contract evidence, behavior works through the real MCP/CLI/admin surface where applicable, Windows behavior is verified for relevant paths/processes, documentation matches the actual product surface, and no unrelated workspace/user state is changed.
