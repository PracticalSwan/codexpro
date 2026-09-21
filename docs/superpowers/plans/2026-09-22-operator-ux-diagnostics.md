# Plan 39 — Operator UX and Diagnostics Polish Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Prefer pure helpers and existing admin/profile infrastructure; do not create another dashboard.

**Goal:** Make existing CodexPro runtime, capability, and saved-profile state understandable without adding a new control plane.

**Architecture:** Add one deterministic capability-explanation module, project it through existing diagnostics/admin HTML, and add read-only profile CLI commands. Existing profile mutation, auth, policy, and diagnostics remain authoritative.

**Tech Stack:** TypeScript, Express existing admin surface, Node launcher CLI, existing Zod/config/profile modules.

**Spec:** `docs/superpowers/specs/2026-09-22-operator-ux-diagnostics-design.md`

## Global constraints

- No new frontend framework or runtime dependency.
- No live widening of permissions.
- No automatic remediation.
- No profile deletion in this plan.
- Keep current-vs-next-launch semantics explicit.
- All output must use current secret/path redaction rules.
- Do not add another MCP tool for information already available through `server_config`/diagnostics.

---

## Task 1: Create deterministic capability explanations

**Files:**
- Create: `src/capabilityExplain.ts`
- Modify: `src/diagnosticsOps.ts`
- Test: create `scripts/capability-explain-smoke.mjs`

**Interface:**

```ts
export type CapabilityState = "available" | "disabled" | "unavailable" | "degraded";

export interface CapabilityExplanation {
  id: string;
  state: CapabilityState;
  reasonCode?: string;
  reason: string;
  source: "runtime" | "profile" | "policy" | "dependency" | "platform";
  takesEffect?: "current" | "next_launch";
}
```

- [ ] Write table-driven failing cases for `git_push=false`, `bash=off`, `write=off`, Goals prerequisites missing, analysis off, CodeGraph disabled/unavailable, LSP disabled/unavailable, and artifact export off.
- [ ] Implement explanations by consuming existing config/provider status; do not duplicate tool-mode lists.
- [ ] Keep capability definitions descriptor/table-driven so later capabilities can extend the same helper without admin/diagnostics special cases; do not expose descriptors for runtime features that do not yet exist.
- [ ] Add a stable bounded capability list to `diagnosticsSnapshot`.
- [ ] Verify reason text contains no absolute path/token/private metadata.

## Task 2: Distinguish running and saved-next-run configuration

**Files:**
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/http.ts`
- Test: `scripts/http-smoke.mjs`, `scripts/settings-smoke.mjs`

- [ ] Add focused fixture where saved Bash/tool/deadline differs from the running runtime.
- [ ] Return separate `current_runtime` and `saved_next_run` summaries.
- [ ] Preserve existing deadline-specific compatibility fields if clients already consume them.
- [ ] Render labels `Current runtime` and `Saved for next launch`; never imply profile save mutates the active server.
- [ ] Run focused HTTP/settings smoke.

## Task 3: Add compact admin overview

**Files:**
- Modify: `src/http.ts`
- Test: `scripts/http-smoke.mjs`

- [ ] Add overview markup using existing server-rendered HTML/CSS only.
- [ ] Show runtime health, package/build identity when Plan 38 is available, workspace path label, transport, sessions, tool/write/bash modes.
- [ ] Show the high-value capability list with state and one-line reason.
- [ ] Keep raw diagnostics under the existing diagnostics section.
- [ ] Add HTML assertions for headings and sanitized values.
- [ ] Ensure admin auth/same-origin middleware is unchanged.

## Task 4: Add read-only profile list/show CLI

**Files:**
- Modify: `scripts/codexpro.mjs`
- Test: `scripts/settings-smoke.mjs`

**Commands:**

```text
codexpro profiles list [--json]
codexpro profiles show --root <path> [--json]
codexpro profiles show --current [--json]
```

- [ ] Add temporary saved-profile fixtures containing masked secret placeholders and multiple roots.
- [ ] Route output through the existing sanitized profile helper.
- [ ] List root/path label, updated time, tunnel, tool/write/bash modes, capability gates, and whether the profile is current.
- [ ] Do not expose token/tunnel credentials or protected secret-file paths.
- [ ] Missing target returns a clear not-found error without creating files.
- [ ] Do not implement `remove` yet.

## Task 5: Improve “why unavailable” guidance in existing diagnostics

**Files:**
- Modify: `src/server.ts` only if `tool_surface_diagnostics` needs to expose the explanation field
- Modify: `src/diagnosticsOps.ts`
- Test: `scripts/smoke.mjs`

- [ ] Add structured `capability_explanations` to existing diagnostics rather than a new tool.
- [ ] For missing tools caused by mode/gates, attach a reason code when deterministically known.
- [ ] Do not suggest bypassing workspace policy.
- [ ] Do not generate mutating remediation commands.

## Task 6: Documentation and gate

**Files:**
- Modify: `GETTING_STARTED.md`
- Modify: `FEATURES.md`
- Modify: `FAQ.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Document overview semantics and profiles list/show.
- [ ] Run `node scripts/capability-explain-smoke.mjs`.
- [ ] Run focused settings and HTTP smoke.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Run `git diff --check`.
- [ ] Review final HTML/API/CLI output for secret and current-vs-next-run ambiguity.
