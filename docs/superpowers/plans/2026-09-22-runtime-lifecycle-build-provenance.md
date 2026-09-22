# Plan 38 — Runtime Lifecycle and Build Provenance Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Do not use Codex CLI. Use the repository's normal focused-test → build → risk-proportional-gate workflow.

**Status:** Verified

**Goal:** Add trustworthy local runtime status/stop commands and source build provenance without creating a daemon or new MCP mutation surface.

**Architecture:** Reuse the existing runtime status record and owned-process identity patterns. Add one small build-identity module and narrow launcher helpers; keep stop as a human-facing local CLI action. Project/runtime security boundaries remain unchanged.

**Tech Stack:** Node.js, TypeScript, PowerShell-aware Windows process handling, existing MCP/admin surfaces.

**Spec:** `docs/superpowers/specs/2026-09-22-runtime-lifecycle-build-provenance-design.md`

## Global constraints

- Never start or restart CodexPro from an agent workflow.
- Never stop a running CodexPro unless the user explicitly authorizes that specific stop.
- Never kill by process name; target only an exact recorded owned runtime identity.
- Preserve `codexpro --version` compatibility.
- Do not add runtime Git subprocess calls.
- Add no dependency unless direct source evidence proves the standard library is insufficient.
- All new public output must pass existing redaction/privacy rules.
- Windows is the first live acceptance platform; non-Windows code paths must remain deterministic.

---

## Task 1: Add build identity as a deep, dependency-free module

**Files:**
- Create: `src/buildIdentity.ts`
- Modify: `src/packageIdentity.ts`
- Modify: `package.json`
- Modify: release/pack script only where build metadata is generated
- Test: create `scripts/build-identity-smoke.mjs`

**Interfaces:**

```ts
export interface BuildIdentity {
  packageName: string;
  version: string;
  revision: string | null;
  channel: "release" | "main" | "source" | "unknown";
}
export function buildIdentity(): BuildIdentity;
export function displayVersion(identity?: BuildIdentity): string;
```

- [ ] Write a failing smoke fixture proving a package with no metadata returns SemVer plus `revision=null`.
- [ ] Add a fixture metadata file in a temporary packed package and prove revision/channel are read without invoking Git.
- [ ] Implement `src/buildIdentity.ts` using only packaged local metadata plus `packageIdentity`.
- [ ] Ensure invalid metadata fails soft to `revision=null/channel=unknown`.
- [ ] Run `node scripts/build-identity-smoke.mjs`.
- [ ] Run `npm run build`.
- [ ] Commit this independently if executing the plan.

## Task 2: Add backward-compatible CLI version provenance

**Files:**
- Modify: `scripts/codexpro.mjs`
- Test: `scripts/settings-smoke.mjs` or `scripts/build-identity-smoke.mjs`

**Required behavior:**

```text
codexpro --version
0.32.4

codexpro --version --verbose
Package: codexpro-full
Version: 0.32.4
Build revision: 88f570cec4ca...
Build channel: main
```

- [ ] Write failing CLI assertions for plain and verbose forms.
- [ ] Add a launcher helper that reads packaged metadata; do not shell out to Git.
- [ ] Keep `-v`, `version`, and existing plain output unchanged.
- [ ] Add `--verbose` only to the version path, not global command parsing.
- [ ] Run the focused CLI smoke and `npm run build`.

## Task 3: Implement a pure runtime status resolver

**Files:**
- Modify: `scripts/codexpro.mjs`
- Test: create `scripts/runtime-lifecycle-smoke.mjs`

**Internal shape:**

```js
function runtimeStatusForRoot(root, options = {}) {
  return {
    state: "running" | "stopped" | "stale" | "degraded",
    root,
    launcherPid: null,
    runtimePid: null,
    transportState: "ready" | "unavailable" | "unknown",
    tunnel: "",
    port: null,
    generationId: null,
    reason: ""
  };
}
```

- [ ] Add temporary runtime-record fixtures for stopped, running, malformed, dead PID, and reused PID states.
- [ ] Reuse existing process-start-identity helpers where available; if launcher runtime records lack start identity, extend the record before adding stop support.
- [ ] Ensure status never deletes state as a side effect.
- [ ] Ensure status never prints token-bearing endpoint URLs.
- [ ] Add loopback health as additive evidence only; process identity remains the ownership authority.
- [ ] Run `node scripts/runtime-lifecycle-smoke.mjs`.

## Task 4: Expose `codexpro status`

**Files:**
- Modify: `scripts/codexpro.mjs`
- Modify: CLI usage/help text
- Test: `scripts/runtime-lifecycle-smoke.mjs`

- [ ] Add `codexpro status [--root ...] [--json]`.
- [ ] Human output must show package/build identity, runtime state, process IDs only when safe, transport/tunnel, and local port.
- [ ] JSON output must use stable snake_case keys and contain no secrets or raw tokenized URLs.
- [ ] A stopped runtime exits 0; malformed arguments exit non-zero. Status itself is diagnostic, not a health-check failure gate.
- [ ] Verify status can inspect a stale fixture without mutating it.

## Task 5: Add exact-owner graceful stop

**Files:**
- Modify: `scripts/codexpro.mjs`
- Test: `scripts/runtime-lifecycle-smoke.mjs`
- Reference: owned process identity logic in Jobs/Goals/tunnel supervision

**Stop algorithm:**

```text
resolve root
→ read runtime record
→ prove launcher identity
→ signal graceful termination
→ bounded wait
→ if Windows and still alive, terminate exact owned tree
→ wait
→ verify recorded server PID is dead
→ verify expected port no longer belongs to owned runtime
→ remove only exact-owned stale runtime/lease record
```

- [ ] Write a fixture proving reused PID causes refusal and no signal.
- [ ] Write a live child-tree fixture with one unrelated Node process.
- [ ] Implement graceful stop first.
- [ ] Add Windows exact-tree fallback only after ownership proof.
- [ ] Assert the unrelated Node process survives.
- [ ] Assert stale state cleanup is limited to the stopped runtime identity.
- [ ] Do not add `restart`.

## Task 6: Surface build provenance in runtime diagnostics

**Files:**
- Modify: `src/server.ts`
- Modify: `src/diagnosticsOps.ts`
- Modify: `src/http.ts`
- Modify: doctor output in `scripts/codexpro.mjs`
- Test: `scripts/smoke.mjs`, `scripts/http-smoke.mjs`, focused CLI smoke

- [ ] Add `build` to `server_config` structured content.
- [ ] Add bounded `build` fields to diagnostics.
- [ ] Show revision/channel on the local admin overview, not raw repository paths.
- [ ] Show provenance in doctor.
- [ ] Add regression assertions that provenance is present and secret-free.

## Task 7: Package provenance at release/source-pack time

**Files:**
- Modify: existing release pack script(s)
- Modify: `.npmignore` only if required by the chosen metadata location
- Test: existing release guard/pack smoke plus `scripts/build-identity-smoke.mjs`

- [ ] Generate metadata deterministically from the source checkout during pack/build, not at runtime.
- [ ] Ensure ordinary `npm run build` from a non-Git installed package still works.
- [ ] Verify tarball includes the intended metadata and excludes `.git`, local paths, profiles, runtime files, and secrets.
- [ ] Verify release-tag packaging may use `channel=release`; source/main packaging uses `channel=main|source`.
- [ ] Run `npm run release:pack`.

## Task 8: Documentation and final gate

**Files:**
- Modify: `README.md`
- Modify: `GETTING_STARTED.md`
- Modify: `FEATURES.md`
- Modify: `FAQ.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Document `status`, guarded `stop`, verbose version output, and the unchanged no-agent-restart rule.
- [ ] Run the focused lifecycle/provenance tests.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke` because CLI/server/admin surfaces changed.
- [ ] Run `npm run release:pack`.
- [ ] Run `git diff --check`.
- [ ] Inspect the complete diff and confirm no broad process-kill path or secret-bearing output was introduced.
