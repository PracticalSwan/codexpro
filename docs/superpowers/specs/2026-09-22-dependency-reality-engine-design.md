# Plan 45 — Dependency Reality Engine Design

Created: 2026-09-22
Status: Planned
Priority: P1

## Problem

CodexPro can understand the workspace's own source, package manifests, package relationships, and optional CodeGraph/LSP evidence, but it cannot answer a different question reliably: **what API is actually present in the exact third-party dependency installed for this workspace?**

The host model may know a library from training or current web documentation, yet the checked-out project can use a different installed version, export map, type declaration, or entrypoint. Guessing from generic knowledge causes avoidable API hallucinations and version mismatches.

This should be solved with a narrow local read-only dependency inspector, not a new context engine, package manager, documentation crawler, or remote registry service.

## Goals

- Add one bounded read-only `inspect_dependency` MCP tool for installed Node/npm-style dependencies.
- Report the selected workspace package manifest, declared version/range, exact installed package version, resolved package root/entrypoints, export metadata, type declaration location, and bounded documentation/source evidence.
- Allow an optional symbol query that returns exact bounded matches from installed declarations/source.
- Distinguish workspace-internal packages from third-party installed packages.
- Work without network access, package installation, registry queries, embeddings, or a new dependency.
- Preserve the existing global PathGuard contract: generic read/search tools remain unable to traverse blocked `node_modules`.

## Non-goals

- No npm/pnpm/yarn install, update, audit, or registry access.
- No remote documentation download.
- No Context7 clone, crawler, vector store, package-document database, or model call.
- No arbitrary file browser for `node_modules`.
- No package code execution.
- No lockfile rewrite.
- No dependency vulnerability scanner.
- No Python/Cargo/Go dependency inspection in v1.
- No Yarn Plug'n'Play/ZipFS support in v1.
- No automatic dependency evidence injection into `gather_context` in v1.

## Relationship to Plans 38–44

This is a new evidence class, not a refinement of the existing roadmap:

- **Plan 38:** build provenance identifies the CodexPro runtime; Plan 45 identifies project dependency reality. Keep the provenance concepts separate.
- **Plan 39:** operator diagnostics may explain whether the tool is available, but Plan 45 requires no new operator dashboard or state.
- **Plan 40:** `gather_context` continues to rank workspace source. Plan 45 is explicit dependency inspection and must not silently widen context scans into `node_modules`.
- **Plan 41:** notebook inspection remains a guarded document reader; no shared parser is required.
- **Plan 42:** workspace briefing may expose package-manager/project metadata but must not dump installed dependency details.
- **Plan 43:** verification failure context may mention an external package from deterministic failure evidence, but must not auto-invoke Plan 45.
- **Plan 44:** table inspection handles user datasets and shares only general bounded-read/redaction principles.

Plan 45 should be independently implementable and verifiable after Plan 44. It must not make Plans 38–44 prerequisites for basic operation.

## Existing seams to reuse

- `src/packageGraph.ts` — workspace package/manifests and internal dependency relationships.
- `src/guard.ts` — canonical workspace identity and containment helpers.
- `src/config.ts` — output/read limits and blocked-path policy.
- `src/redact.ts` — returned text/structured-value redaction.
- `src/server.ts` — MCP registration, mode and policy gating.
- `src/analysis/impact.ts` — package-manager metadata conventions.
- Existing tool-surface smoke/registration checks.

## Public tool

Add exactly one new top-level tool:

```text
inspect_dependency
```

Suggested schema:

```ts
{
  workspace_id?: string;
  package_name: string;
  package_path?: string;
  symbol?: string;
  include_readme?: boolean;
  max_matches?: number;
  max_output_bytes?: number;
}
```

Rules:

- `package_name` must be a valid npm package name, including scoped names.
- `package_path` selects the owning workspace package directory or its `package.json`; default is the repository-root package when unambiguous.
- `symbol` is an identifier/string search target, not a path.
- `max_matches` and `max_output_bytes` are clamped to conservative configuration-derived ceilings.
- No arbitrary dependency-relative path parameter is exposed in v1.

## Dedicated dependency-read seam

Create a focused module such as `src/dependencyOps.ts`.

Do **not** weaken `PathGuard.isBlockedRelativePath()` and do not remove `node_modules` from `blockedGlobs`.

The dependency module may perform a deliberate read-only exception only after all of these checks succeed:

1. Resolve the owning workspace manifest through normal `PathGuard`.
2. Parse only the manifest fields needed for dependency selection.
3. Confirm the requested package is directly declared in `dependencies`, `devDependencies`, `peerDependencies`, or `optionalDependencies`, **or** corresponds to an internal workspace package discovered by `buildPackageGraph()`.
4. Resolve the installed dependency by Node-style ancestor lookup from the owning package directory:
   - `<dir>/node_modules/<package>/package.json`
   - then each parent package directory up to the workspace root.
5. Canonicalize the candidate package root using `realpath`.
6. Require the canonical dependency root to remain inside the canonical workspace root.
7. Verify the installed package's own `package.json.name` exactly matches the requested name.
8. Reject traversal, missing installation, global package resolution, PnP/ZipFS layouts, or any package root that escapes the workspace.

This seam is not a generic blocked-path bypass. Callers never supply a `node_modules` path.

### Workspace packages

If `package_name` matches an internal package in the current package graph:

- return `kind: "workspace"`;
- report its manifest path and declared relationship;
- do not route through `node_modules`;
- point the caller back to normal workspace source/context tools for deeper inspection.

This prevents duplicated reading of first-party code through the dependency exception.

## Metadata returned

Suggested structured result:

```ts
interface DependencyInspectionResult {
  packageName: string;
  kind: "installed" | "workspace";
  ownerPackage: { name: string; path: string };
  declaredRange: string | null;
  dependencySection: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies" | null;
  installedVersion: string | null;
  packageRoot: string | null;
  resolvedEntrypoint: string | null;
  typesEntrypoint: string | null;
  exportKeys: string[];
  packageManager: string | null;
  readme?: { path: string; text: string; truncated: boolean };
  symbol?: {
    query: string;
    status: "found" | "not_found" | "not_requested";
    matches: DependencySymbolMatch[];
  };
  warnings: string[];
  truncated: boolean;
}
```

Paths returned for installed packages must be workspace-relative labels only; never expose a canonical path outside the workspace.

### Manifest allowlist

Never return the package's raw `package.json`.

Return an allowlisted subset only:

- `name`
- `version`
- `type`
- `main`
- `module`
- `types` / `typings`
- bounded top-level `exports` keys/conditions
- optional `engines.node`

Do not return scripts, publish credentials/config, arbitrary metadata blobs, or package-manager auth configuration.

## Entrypoint and type resolution

Resolution should be deterministic and non-executing:

- use package metadata and filesystem existence checks;
- prefer explicit `types`/`typings` for type declarations;
- report export-map keys/conditions without evaluating package code;
- resolve the default runtime entry from `exports`, `module`, or `main` conservatively;
- if conditional exports are ambiguous, return the alternatives/warning instead of pretending one universal entrypoint exists.

Do not import or require the package.

## Symbol evidence

When `symbol` is supplied:

1. Search the resolved type declaration entry/tree first when present.
2. Search the resolved runtime entry/source tree second.
3. Restrict traversal to the verified dependency package root.
4. Never recurse into that dependency's own nested `node_modules`.
5. Restrict extensions to bounded text/code candidates such as `.d.ts`, `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`.
6. Cap files visited, aggregate bytes scanned, matches, line length, and excerpt bytes.
7. Return file path, line, bounded excerpt, and evidence kind (`types` or `source`).
8. Apply `redactSensitiveText` to excerpts.

Use literal/identifier-aware matching in v1. Do not add a parser/compiler dependency merely to produce semantic symbol graphs.

## README evidence

When `include_readme=true` (recommended default):

- inspect only a conventional package-root README filename;
- cap bytes aggressively;
- redact returned text;
- never follow links or fetch remote documentation.

README evidence is supporting documentation, not authoritative over the installed type/export/source evidence.

## Package-manager compatibility

V1 supports installed `node_modules` layouts from:

- npm;
- pnpm when the package symlink realpath remains inside the workspace;
- Yarn Classic/node_modules-compatible layouts.

V1 explicitly reports unsupported for:

- Yarn Plug'n'Play/ZipFS;
- globally installed modules;
- dependency stores whose canonical target escapes the allowed workspace.

Do not shell out to a package manager to work around unsupported layouts.

## Tool mode and policy

- Expose `inspect_dependency` in Standard and Full modes.
- Keep Minimal unchanged.
- The existing tool/policy layer may deny the tool by name as usual.
- The tool-specific dependency resolver is the only permitted `node_modules` read exception; generic `read_file`, search, context, artifact, and export tools retain existing blocked-path behavior.

## Boundedness and execution class

- Execution class: synchronous read-only tool.
- No durable job, process, batch, or Goal is required in v1.
- Cap package files visited, bytes scanned, README bytes, symbol matches, export keys, warnings, and total result bytes.
- If a package is too large to search within the budget, return partial deterministic evidence with `truncated=true`; do not silently broaden the scan.

## Security and privacy

- No package code execution.
- No network.
- No auth/config file reads.
- No traversal outside the verified package root.
- No generic blocked-path exception.
- All textual output is redacted.
- Symlink resolution is allowed only as part of package-root resolution and must terminate inside the workspace; arbitrary symlink traversal remains rejected elsewhere.

## Acceptance criteria

- A directly declared npm dependency resolves to its exact installed version and bounded metadata.
- A scoped package resolves correctly.
- npm/pnpm node_modules-compatible layouts work when canonical package roots stay inside the workspace.
- A missing declared package reports `declared_not_installed` without network access.
- An undeclared package is rejected rather than used as an arbitrary node_modules browser.
- A workspace-internal package is reported as `kind=workspace` and does not use the dependency bypass.
- Export/type entrypoints are reported conservatively without importing package code.
- Optional symbol search finds exact bounded evidence in declarations/source and returns `not_found` truthfully.
- Package README preview is bounded/redacted and never fetched remotely.
- Global package, path traversal, dependency-root escape, nested node_modules recursion, and unsupported PnP layouts fail closed.
- Existing PathGuard behavior for all other tools is unchanged.
- Tool is absent from Minimal and present in Standard/Full.
- No new dependency, store, daemon, network service, or model call.

## Verification

- Add focused `scripts/dependency-reality-smoke.mjs` fixtures for npm-like, scoped, workspace-package, missing install, undeclared package, pnpm-style in-workspace symlink, escaping symlink, symbol found/not-found, README redaction, and output limits.
- Extend tool-surface expectations.
- Re-run existing package-graph/Git intelligence smoke because package ownership logic is reused.
- `npm run build`.
- `npm run smoke` because the public MCP tool surface changes.
- `git diff --check`.
- Stress/audit are not required unless implementation adds concurrency or a dependency.
