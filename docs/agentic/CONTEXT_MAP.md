# CodexPro Context Map

Last reconciled: 2026-09-22

This is a compact architecture-navigation aid. Runtime source/tests remain authoritative; current future work is routed through `PLAN_INDEX.md`.

## Core extension seams

| Area | Current responsibility | Current guidance |
|---|---|---|
| `src/server.ts` | MCP schemas, registration, mode gates, result shaping | Keep orchestration-only; deepen existing tools before adding top-level tools |
| `src/config.ts` | Runtime modes, limits, environment/CLI config | Add bounded opt-in settings only when a plan requires them |
| `src/guard.ts` | Workspace identity, containment, blocked paths | Every path-bearing feature/provider must reuse it |
| `src/fsOps.ts`, `src/operations/*`, `src/checkpoints/*` | Guarded mutation, leases, receipts, rollback | Reuse for state-changing file work; preserve unrelated work |
| `src/policyOps.ts`, `src/policyRules.ts` | Tightening-only workspace policy | Repository configuration never widens profile/global authority |
| `src/bashOps.ts`, `src/processOps.ts` | Shell and owned processes | Preserve safe/full mode and exact-owner process semantics |
| `src/checksOps.ts`, `src/jobs/*` | Trusted checks, verification, durable structured jobs | `job_*` is registered-producer-only, not another command runner |
| `src/contextOps.ts`, `src/contextRanking.ts`, `src/contextBatch.ts` | Ranked/bounded/resumable context | Plan 40 extends this seam; do not create a replacement context engine |
| `src/analysis/*` | Built-in analysis + CodeGraph/LSP adapters | Optional provider evidence only; no mandatory index/LSP platform |
| `src/gitOps.ts`, `src/gitWriteOps.ts`, `src/packageGraph.ts`, `src/preflightOps.ts` | Git/repository intelligence and guarded writes | Expected-HEAD/branch/staged-set and no-force boundaries remain authoritative |
| `src/archiveOps.ts`, `src/documentOps.ts`, `src/imageOps.ts`, `src/exportOps.ts` | Bounded artifact I/O | Pattern for Plan 41 read-only notebook inspection |
| `src/goals/*` | Durable isolated Goal DAG execution/review/projection | Reuse for multi-stage isolated engineering; no second workflow engine |
| `src/http.ts` | Streamable HTTP + authenticated local admin | Plan 39 improves this existing UI/control surface; no second dashboard |
| `src/diagnosticsOps.ts` | Sanitized connection/tool/operator diagnostics | Plan 39 adds deterministic capability explanations here/nearby |
| `scripts/codexpro.mjs` | Launcher, profiles, tunnels, operator CLI | Plan 38 adds status/guarded stop/provenance without daemon/restart authority |
| `src/buildIdentity.ts`, `scripts/write-build-metadata.mjs` | Package/source build identity | Pack-time metadata is soft-fail at runtime and never includes secrets |
| `src/capabilityExplain.ts` | Deterministic capability state/reason codes | Reused by diagnostics, profiles, workspace briefing, and the default-off local probe |
| `src/notebookOps.ts`, `src/tableOps.ts` | Bounded structured file readers | Read-only, redacted, size/row/output capped; never execute kernels/dataframes |
| `src/dependencyOps.ts` | Manifest-derived installed Node dependency evidence | The only narrow `node_modules` exception; canonical containment and exact package identity required |
| `src/localServiceProbe.ts` | One-shot local HTTP observation | Full-only, explicit opt-in, loopback GET/HEAD, no credentials/redirects/proxy/persistence |
| `src/workspaceBriefing.ts`, `src/verificationFailureContext.ts` | Deterministic evidence composition | Deepens workspace snapshot/verification without autonomous repair or probing |
| `scripts/*-smoke.mjs` | Integration/regression verification | Add focused smoke per implemented plan, then shared smoke when public runtime surfaces change |

## Active roadmap touch points

- **Plan 38:** `scripts/codexpro.mjs`, `src/packageIdentity.ts`/new build-identity helper, diagnostics/server/admin projections.
- **Plan 39:** existing profile/diagnostics/admin surfaces plus one pure capability-explanation helper.
- **Plan 40:** `contextOps` + existing analysis provider seam only.
- **Plan 41:** new focused `notebookOps.ts`, one read-only tool registration, tool-surface expectations.
- **Plan 42:** existing `workspace_snapshot` plus one focused briefing composer over current read-only evidence.
- **Plan 43:** current verification/check/change-impact/context evidence plus one shared failure-context composer.
- **Plan 44:** new focused `tableOps.ts`, one read-only Standard/Full tool, bounded streaming parser tests.
- **Plan 45:** new focused `dependencyOps.ts` over package manifests/package graph plus a tool-specific, containment-checked installed-package reader; generic `node_modules` blocking stays unchanged.
- **Plan 46:** focused `localServiceProbe.ts` plus existing config/profile/admin capability seams; one package-default-off Full-mode loopback HTTP GET/HEAD tool only. The 0.33.2 patch adds a per-OS-user future-profile preference under that user's CodexPro home without changing the runtime/network security boundary.

## High-risk neighbors

- Authentication/tunnel behavior in `src/http.ts` and launcher code.
- Path security/redaction/private metadata in `guard.ts`, `redact.ts`, and import/export surfaces.
- Windows PID/start-identity, child teardown, file-lock/atomic-store behavior.
- Git projection/mutation around unrelated dirty/staged/untracked user work.
- Tool descriptors/mode lists because clients may cache schemas.
- Any new persistent state: bounded growth, crash consistency, ownership, privacy, and stale-authority handling.
- Specialized blocked-path exceptions: Plan 45 must be package-name/manifest-derived and may never become arbitrary path access.
- New network capability: Plan 46 must remain explicit opt-in, loopback-only, credential-free, redirect-free, and bounded.

## Current design pressure

CodexPro already has a large Full-mode surface and multiple durable execution roles. New work should normally follow: **reuse existing module → extend existing tool/schema compatibly → add a focused helper/provider → add a new public tool only for a genuinely distinct operation**.
