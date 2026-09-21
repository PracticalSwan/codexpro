# Plan 39 — Operator UX and Diagnostics Polish Design

Created: 2026-09-22
Status: Planned
Priority: P0

## Problem

CodexPro already has a capable authenticated local admin page, diagnostics endpoints, profile persistence, doctor, and tool-surface diagnostics. The usability problem is not missing infrastructure; it is that operators must interpret a large amount of raw configuration/JSON to answer simple questions:

- Is this runtime healthy?
- Which workspace/profile am I looking at?
- Which major capabilities are available?
- Why is a tool/capability unavailable?
- Which settings apply now versus only after restart?
- Which saved profiles exist?

A second dashboard or frontend framework would duplicate existing infrastructure.

## Goals

- Turn the existing local admin page into a concise operator overview.
- Add deterministic explanations for unavailable capabilities/tools.
- Add read-only saved-profile listing/show commands.
- Reuse current diagnostics/profile state; do not create a second control plane.
- Preserve next-run-only semantics for profile mutations.

## Non-goals

- No new standalone web app.
- No React/Vue/Svelte dependency.
- No live mutation of the running MCP security configuration.
- No automatic capability enablement.
- No profile deletion in the first implementation.
- No generic process manager UI.
- No new MCP tool solely for UI presentation.
- No health “AI score” or subjective quality rating.

## Design principles

1. One source of truth: existing config/profile/diagnostics state.
2. Explain, do not auto-remediate.
3. Current runtime and saved-next-run state must be visually distinct.
4. Every unavailable reason is deterministic and attributable to a gate.
5. Sensitive values stay masked/omitted.
6. Extend `src/http.ts` only with presentation/orchestration; reusable explanation logic belongs in a focused module.

## Capability explanation model

Introduce a small pure helper:

```ts
export interface CapabilityExplanation {
  id: string;
  state: "available" | "disabled" | "unavailable" | "degraded";
  reasonCode?: string;
  reason: string;
  source: "runtime" | "profile" | "policy" | "dependency" | "platform";
  takesEffect?: "current" | "next_launch";
}

export function explainCapabilities(input: CapabilityExplanationInput): CapabilityExplanation[];
```

Initial high-value capability IDs:

- workspace_write
- bash
- structured_jobs
- durable_goals
- git_push
- analysis
- codegraph
- lsp
- artifact_export
- continuation
- telegram_continuation

The helper must not produce shell commands that widen authority automatically. UI may point to the existing profile/settings location.

## Admin overview

Add a compact first section above the existing forms:

```text
Runtime             Ready
Package             codexpro-full 0.32.4
Build               88f570c / main
Workspace           <path label>
Transport           OpenAI Secure MCP Tunnel
Sessions            2
Tools                standard
Write                workspace
Bash                 safe
```

Then a capability table with state and one-line reason.

Do not remove the current detailed profile/diagnostics sections.

## Profile CLI

Add read-only:

```text
codexpro profiles list
codexpro profiles show --root <path>
codexpro profiles show --current
```

Output must use existing sanitized profile representation. No secret values and no profile deletion in Plan 39.

## Failure behavior

- Missing profile: report not saved; do not create it.
- Invalid/stale optional dependency: capability shows unavailable with dependency reason.
- Workspace policy disables a globally allowed tool: source is policy.
- Saved setting differs from running config: explicitly label `next launch`.
- Admin diagnostics unavailable: overview renders remaining static/runtime data rather than failing the entire page.

## Acceptance criteria

- An operator can tell current runtime mode and major capability state without reading raw JSON.
- At least the high-value capability gates return deterministic reason codes.
- Current vs saved-next-run settings cannot be confused in rendered labels/API.
- Profile list/show is read-only and secret-free.
- No new UI framework/dependency is added.
- Existing admin authorization, same-origin protections, rate limits, and security headers remain unchanged.
- Existing tool surface remains unchanged.

## Verification

- Focused diagnostics/settings/admin smoke.
- `npm run build`.
- `npm run smoke` because HTTP/admin and CLI settings surfaces change.
- `git diff --check`.
- Browser/manual visual inspection of the local admin page is optional supplemental evidence; tests remain authoritative.
