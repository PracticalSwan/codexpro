# Plan 45 — Dependency Reality Engine Implementation Plan

Created: 2026-09-22
Status: Planned
Priority: P1
Spec: `docs/superpowers/specs/2026-09-22-dependency-reality-engine-design.md`

## Goal

Add one bounded read-only `inspect_dependency` tool that tells the host model what third-party Node dependency is **actually installed** for a selected workspace package, including exact version, export/type entrypoints, bounded README evidence, and optional exact symbol matches.

The implementation must preserve the global `node_modules` block for every existing generic tool.

## Architecture

```text
inspect_dependency
      |
      v
src/dependencyOps.ts
      |
      +--> owning manifest via PathGuard
      +--> packageGraph internal-package check
      +--> direct declaration check
      +--> dedicated node_modules resolver
      |       `--> realpath must stay inside workspace
      +--> allowlisted package metadata
      +--> bounded README/types/source evidence
      `--> redaction + bounded result
```

No network, registry, package-manager execution, persistent store, package code execution, or new dependency.

## Relationship to the current roadmap

- Do not modify Plan 40 `gather_context` to auto-scan dependencies.
- Do not add dependency details to Plan 42 workspace briefing beyond existing package-manager metadata.
- Do not make Plan 43 verification automatically invoke this tool.
- Reuse Plan 39 capability/tool-surface explanation conventions if they exist by implementation time.
- Keep Plan 44 dataset parsing completely separate.
- Plan 45 is independently reviewable and should land after Plans 38–44 in the recommended roadmap.

## Task 1 — Lock the dependency boundary with failing tests

**Files**
- Create: `scripts/dependency-reality-smoke.mjs`
- Reference: `src/guard.ts`, `src/packageGraph.ts`, `src/redact.ts`

**Steps**
- [ ] Build temporary workspace fixtures with root and nested package manifests.
- [ ] Assert generic PathGuard/read behavior still blocks `node_modules`.
- [ ] Add a directly declared package fixture with exact installed `package.json`, README, JS entry, and `.d.ts` entry.
- [ ] Add scoped package fixture.
- [ ] Add undeclared-but-present dependency fixture and assert rejection.
- [ ] Add declared-but-missing package fixture and assert truthful missing status.
- [ ] Add package-root symlink that resolves outside the workspace and assert fail-closed rejection.
- [ ] Add in-workspace pnpm-style symlink fixture and assert safe resolution.
- [ ] Add internal workspace-package fixture and assert it is classified as workspace code rather than node_modules evidence.

Expected state: tests fail because `dependencyOps` does not exist.

## Task 2 — Implement the focused dependency resolver

**Files**
- Create: `src/dependencyOps.ts`
- Modify only if needed: `src/packageGraph.ts`

**Steps**
- [ ] Define small result/types for owner package, declaration, installed metadata, README, symbol evidence, warnings, and truncation.
- [ ] Resolve `package_path` through PathGuard and require an allowed workspace `package.json`.
- [ ] Reuse `buildPackageGraph()` to detect first-party/workspace packages.
- [ ] Parse dependency declaration sections with deterministic precedence and preserve the exact declared range.
- [ ] Implement npm-style ancestor `node_modules/<package>/package.json` lookup from the owning package directory to workspace root.
- [ ] Canonicalize package root with `realpath` and require it to stay inside the workspace.
- [ ] Verify installed `package.json.name` equals the requested package.
- [ ] Reject traversal names, global resolution, PnP/ZipFS, or targets escaping workspace.
- [ ] Keep this logic private to `dependencyOps`; do not alter global PathGuard blocked globs.

**Review gate**
- Confirm no generic helper can accept arbitrary node_modules paths.
- Confirm the module performs no import/require of dependency code.

## Task 3 — Add bounded metadata, README, and symbol evidence

**Files**
- Modify: `src/dependencyOps.ts`
- Extend: `scripts/dependency-reality-smoke.mjs`

**Steps**
- [ ] Return only allowlisted installed package metadata.
- [ ] Derive conservative runtime/type entrypoint candidates from `exports`, `module`, `main`, `types`, and `typings`.
- [ ] When conditional exports are ambiguous, return bounded alternatives/warnings instead of selecting an unsupported universal answer.
- [ ] Add bounded conventional README lookup when enabled; no link following.
- [ ] Add literal/identifier-aware symbol search with declarations before source.
- [ ] Exclude nested `node_modules`, generated caches, binary files, and oversized files.
- [ ] Clamp files visited, bytes scanned, matches, excerpt size, warnings, and result bytes.
- [ ] Redact README/excerpt text and structured strings before return.

**Focused assertions**
- exact installed version;
- exact declared range/section;
- scoped dependency;
- type entrypoint;
- conditional export warning;
- symbol found/not found;
- truncation;
- redaction.

## Task 4 — Register exactly one MCP tool

**Files**
- Modify: `src/server.ts`
- Modify: tool-surface expectation fixtures in existing smoke tests.

**Steps**
- [ ] Register `inspect_dependency` with `workspace_id`, `package_name`, optional `package_path`, `symbol`, `include_readme`, and bounded limit inputs.
- [ ] Expose in Standard and Full modes only.
- [ ] Keep Minimal unchanged.
- [ ] Apply existing read-only/tool policy gating.
- [ ] Shape a concise human-readable result plus structured content; do not expose raw package manifests or absolute paths.
- [ ] Do not register a second symbol/doc tool.

## Task 5 — Verify compatibility with existing package/context behavior

**Files**
- Modify only if behavior/docs require it: existing package graph/tool surface tests.

**Commands**
```bash
node scripts/dependency-reality-smoke.mjs
node scripts/git-intelligence-smoke.mjs
npm run build
npm run smoke
git diff --check
```

**Acceptance gate**
- [ ] Existing package graph results are unchanged.
- [ ] Existing context/search cannot read `node_modules`.
- [ ] New tool does not alter `gather_context` ranking/cache/resumability.
- [ ] No package-manager command or network request occurs.
- [ ] No new npm dependency is added.

Stress is unnecessary unless implementation introduces concurrent scanning or shared mutable state.

## Task 6 — Documentation and completion

**Files**
- Update: `FEATURES.md`, `README.md`, `FAQ.md` only after implementation is verified.
- Update: `docs/agentic/PROJECT_MEMORY.md`, `PLAN_INDEX.md`, `CONTEXT_MAP.md`, `CHANGELOG.md`.
- Update `SECURITY.md` with the narrow dependency-read exception and its fail-closed rules.

**Completion evidence**
- [ ] Focused smoke pass.
- [ ] Build pass.
- [ ] Full smoke pass.
- [ ] `git diff --check` pass.
- [ ] Final diff shows no global PathGuard/node_modules relaxation.
- [ ] Plan status changes to Verified only after the exact implementation evidence exists.
