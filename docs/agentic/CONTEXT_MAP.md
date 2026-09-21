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
| `src/continuation/*`, `browser-extension/` | Optional human-gated task continuation | Plan 36 acceptance only, then feature freeze except defects |
| `scripts/codexpro.mjs` | Launcher, profiles, tunnels, operator CLI | Plan 38 adds status/guarded stop/provenance without daemon/restart authority |
| `scripts/*-smoke.mjs` | Integration/regression verification | Add focused smoke per implemented plan, then shared smoke when public runtime surfaces change |

## Active roadmap touch points

- **Plan 38:** `scripts/codexpro.mjs`, `src/packageIdentity.ts`/new build-identity helper, diagnostics/server/admin projections.
- **Plan 39:** existing profile/diagnostics/admin surfaces plus one pure capability-explanation helper.
- **Plan 40:** `contextOps` + existing analysis provider seam only.
- **Plan 41:** new focused `notebookOps.ts`, one read-only tool registration, tool-surface expectations.

## High-risk neighbors

- Authentication/tunnel behavior in `src/http.ts` and launcher code.
- Path security/redaction/private metadata in `guard.ts`, `redact.ts`, import/export and continuation surfaces.
- Windows PID/start-identity, child teardown, file-lock/atomic-store behavior.
- Git projection/mutation around unrelated dirty/staged/untracked user work.
- Tool descriptors/mode lists because clients may cache schemas.
- Any persistent state or browser/Telegram change: bounded growth, crash consistency, ownership, privacy, and stale-authority handling.

## Current design pressure

CodexPro already has a large Full-mode surface and multiple durable execution roles. New work should normally follow: **reuse existing module → extend existing tool/schema compatibly → add a focused helper/provider → add a new public tool only for a genuinely distinct operation**.
