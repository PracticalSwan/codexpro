# CodexPro Project Memory

Last verified: 2026-09-25 (Asia/Bangkok)

## Canonical workspace and identity

- Repository: `D:\Side Projects\codexpro`.
- Fork/origin: `PracticalSwan/codexpro`; canonical branch `main`.
- Upstream: `rebel0789/codexpro`.
- Latest fetched upstream baseline observed on 2026-09-22: `482d0035e0c08cceb5916958df652b325b4c52d8`. It moved after the 2026-09-19 maintenance closeout and has not been reconciled by the 2026-09-22 roadmap/documentation cleanup.
- Product identity: **CodexPro Full**. Distribution package: `codexpro-full`; installed CLI and compatibility surface remain `codexpro`.
- Current public stable release: **v0.33.6**, tag commit `8d88c11de82f31b94e5272e4fc05fea880723362`; GitHub Release archive SHA-256 `d2fa9c8bde5ec5a584ead4bfe0467c96b146766fcbfb2bb0a1727d2facdb8496` matches its public sidecar. The archive, build revision, release channel, and all 307 packaged files were independently verified against a disposable and the global Windows installation. GitHub Releases are canonical; npm-registry publication requires separate verified authentication.
- Exact local/origin HEAD, runtime PIDs, and tunnel state are execution state: recover them from Git/runtime evidence at the start of each task rather than treating old values as durable memory.

## Product boundary

CodexPro Full is a local MCP bridge for explicitly allowed development workspaces. It is not a hosted SaaS, model proxy, quota/account pool, approval bypass, generic remote desktop, autonomous model loop, or default cloud source/prompt store.

## Current architecture

- `src/server.ts`: MCP registration, schemas, mode/capability gating, result shaping, orchestration. Keep subsystem business logic out.
- `src/guard.ts`: workspace identity, containment, blocked-path enforcement.
- `src/fsOps.ts` + `src/operations/*` + `src/checkpoints/*`: guarded mutation, leases, receipts, change sets, rollback/checkpoints.
- `src/policyOps.ts` + `src/policyRules.ts` + project trust/hooks: tightening-only authority and trusted lifecycle execution.
- `src/bashOps.ts` + `src/processOps.ts` + `src/checksOps.ts`: bounded shell/process/check/verification behavior.
- `src/jobs/*`: registered-producer durable structured jobs; not a generic command runner.
- `src/contextOps.ts` + `src/contextRanking.ts` + `src/contextBatch.ts`: ranked bounded context, caching, token/byte budgets, resumable analysis.
- `src/analysis/*`: built-in repository analysis plus optional CodeGraph/LSP provider seams.
- `src/gitOps.ts` + `src/gitWriteOps.ts` + `src/packageGraph.ts` + `src/preflightOps.ts`: guarded Git/repository intelligence.
- `src/archiveOps.ts` + `src/documentOps.ts` + `src/imageOps.ts` + `src/exportOps.ts`: bounded artifact/document/image I/O.
- `src/goals/*`: opt-in durable isolated Goal DAG execution/review/projection; never auto-commit/push/deploy.
- `src/http.ts`: Streamable HTTP MCP transport and authenticated local admin surface.
- `scripts/codexpro.mjs`: launcher/profile/tunnel/operator CLI; runtime lifecycle remains user-controlled.

## Verified capability baseline

- Plans 01–17 and 20 are verified foundations: policy, operation journal/concurrency, diagnostics, processes/checks, context continuity, Git intelligence, Codex-session navigation, optional code intelligence, artifact I/O, Goals, MCP SDK compatibility seam, granular rules, trusted hooks, durable checkpoints, Context v2, activity evidence, and verification repair metadata.
- MCP runtime uses the stable v2 split packages with Zod 4 while retaining the verified legacy 2025 protocol behavior by default. The unfinished interactive-approval extension from former Plan 18 is retired; fail-closed behavior remains.
- Former Plan 19 MCP Tasks bridge is retired. Existing `proc_*`, `job_*`, `batch_*`, and Goal primitives remain canonical.
- Browser/Telegram task continuation was fully removed on 2026-09-22 from runtime source, package contents, plans/contracts/tests/docs, saved continuation profile/runtime fields, managed-browser state, and Telegram secret state; deadline-aware long-work primitives remain independent.
- Optional Docker execution is frozen at the verified Windows Stage A scope for one-shot Bash/workspace processes using an already-local image and constrained mounts/network/resources. Goals remain host-only. Linux-host and Goal-Docker expansion is not active roadmap work.

## Deadline and durable long-work baseline

- Plans 22–28 are verified and integrated.
- Package default synchronous MCP call budget is 20 minutes (`1,200,000` ms); finite configuration range is 5–60 minutes. Unlimited/observe exists only for harmless host-window discovery and does not relax scope, verification, or safety.
- Deadline is per tool call, not a whole-turn timer. Composite synchronous verification shares the same remaining budget.
- Long-work roles are intentionally distinct:
  - `proc_*`: workspace-owned arbitrary long process under existing Bash authority;
  - `job_*`: persistent registered structured producer work;
  - `batch_*`: foreground-only resumable in-process analysis;
  - Goals: multi-stage isolated engineering.
- Execution routing is advisory/deterministic and never silently escalates permissions or reduces required work.

## Completed roadmap — consolidation first

`docs/agentic/PLAN_INDEX.md` is authoritative. Verified implementation sequence:

```text
Plan 38 Runtime Lifecycle and Build Provenance
→ Plan 39 Operator UX and Diagnostics Polish
→ Plan 40 Context and Code-Intelligence Provider Integration
→ Plan 41 Structured Notebook Inspection
→ Plan 42 AI-Ready Workspace Briefing v2
→ Plan 43 Verification Failure Context Pack
→ Plan 44 Structured Dataset / Table Inspection
→ Plan 45 Dependency Reality Engine
→ Plan 46 Local Service Observatory
→ real-project usage / defect evidence
```

- **Plan 38 (P0):** local CLI `status`, exact-owner guarded human `stop`, and package/source build provenance. No agent start/restart authority and no new MCP mutation tool.
- **Plan 39 (P0):** improve the existing authenticated admin/diagnostics/profile surfaces; deterministic unavailable-capability explanations and read-only profile list/show. No new dashboard framework/control plane.
- **Plan 40 (P1):** merge bounded optional CodeGraph/LSP evidence into existing symbol-oriented `gather_context`; no Context Engine v3, persistent LSP manager, or new public context tool.
- **Plan 41 (P1):** read-only structured `.ipynb` inspection; no kernel/execution/editor/dataframe platform or new dependency.
- **Plan 42 (P0):** deepen `workspace_snapshot` into one bounded AI-ready project briefing using existing Git/instruction/check/durable-work/capability evidence.
- **Plan 43 (P0/P1):** attach bounded failure-location/related-test/context/reproduction evidence to existing synchronous and async verification without autonomous repair.
- **Plan 44 (P1):** add bounded read-only CSV/TSV/JSONL inspection; no dataframe/SQL/chart/model execution platform.
- **Plan 45 (P1):** add one read-only installed Node dependency inspector for exact version/export/type/docs/symbol evidence. Keep generic `node_modules` blocking unchanged; no registry/network/install/package execution.
- **Plan 46 (P1):** add one package-default-off Full-mode loopback HTTP GET/HEAD sensor with bounded/redacted responses. No browser, credentials, redirects, proxies, arbitrary hosts, crawling, or service-ownership claims. As of 0.33.2, a per-OS-user preference may explicitly enable the probe for that user's future profiles; a workspace-level off still wins. Artifact Export diagnostics check `export_file`, not a nonexistent alternate tool name.

Implementation status: Plans 38–46 are complete in the authoritative sequence. The current source includes the bounded cumulative regression fixture `scripts/roadmap-38-46-smoke.mjs` plus named focused build/runtime, capability, provider, notebook, briefing, failure-context, table, dependency, and local-service smokes; public tool additions are limited to `read_notebook`, `inspect_table`, `inspect_dependency`, and the explicitly gated `probe_local_service`, while `workspace_snapshot` and `verify_changes` were deepened in place. Generic `node_modules` blocking, PathGuard, authentication, redaction, policy, and the no-browser/no-Telegram boundary remain unchanged.

Research-only/watch items: future MCP protocol/Tasks/interactive-approval capabilities. Reopen only when stable connected-client support provides a concrete benefit over existing primitives.

## Maintenance and release state

- **v0.33.6 (2026-09-25):** Fixed an owner-verified Windows shutdown race in `codexpro stop`: after the recorded launcher exits, the CLI waits boundedly for its verified MCP server child without signaling an unverified PID. The delayed-child regression failed before and passed after the fix. The full local release gate passed (build, complete smoke, stress, zero-vulnerability audit, and package integrity), with zero leaked stress fixtures. The exact tag commit passed hosted Windows/Node 24 and Ubuntu 24.04/Node 20 CI, Pages, and the independent tag-triggered Release gate.
- **v0.33.5 (2026-09-25):** Shipped Git-ignore-aware workspace inspection (real CSX4201 inventory dropped from 403 files with 370 ignored outputs to 25 relevant files), corrected GitHub Release install help, pinned Ubuntu 24.04 CI/release runners, and bounded stress-fixture cleanup and diagnostic phase markers. Exact-commit hosted CI, Pages, and the tag-triggered release passed.
- **Temporary fixtures and CI diagnosis:** The 649 confirmed stale CodexPro-owned historical stress directories were removed; the current stress suite leaves zero such fixtures. The previously observed roughly five-minute hosted Windows smoke transition delay did not reproduce after phase instrumentation; no root cause is claimed.
- **Installation and runtime:** The SHA-256-verified public v0.33.6 GitHub Release archive was installed globally. Its build revision and release channel match the tag and all 307 packaged files match the archive byte-for-byte. All eight existing saved profile hashes and the per-user preference hash remained unchanged. No CodexPro runtime is running after the authorized update, in accordance with the project rule against agent-initiated starts/restarts. Authenticated MCP roundtrip was verified on an earlier operator-started v0.33.4 instance; live v0.33.6 tunnel/runtime behavior requires an operator-initiated start before re-verification.
- **Publication boundary:** npm registry authentication is unavailable (`npm whoami` returned `ENEEDAUTH`); the verified GitHub Release remains the supported public distribution channel. The latest previously fetched upstream baseline is dated 2026-09-22 and has not been merged as part of this maintenance release.

## Runtime lifecycle boundary

- A running CodexPro instance is user-owned control state.
- Agents must never start or restart CodexPro.
- Do not stop a running instance without explicit user approval for that specific stop and reason.
- An approved stop targets only the exact owned CodexPro tree and leaves it stopped. Never broad-kill Node/tunnel processes.
- If reinstall is blocked by a running runtime and stop approval is absent, defer reinstall; safe source/docs/commit/push work may continue.

## Git/release boundary

- No force push/history rewrite.
- Commit/push only intended changes after final diff/status review.
- `continue full maintenance` is standing authorization for evidence-backed maintenance, docs, verification, intended main commit/push, and hosted CI verification; it does not authorize runtime stop/restart or release publication.
- An explicit **complete everything fully** request for a verified release-ready batch authorizes the complete scoped SemVer/tag/GitHub Release/Pages/released-artifact-install transaction subject to the runtime lifecycle rule; the operator need not repeat **publish release**.
- npm-registry publication remains separate and may occur only with existing independently verifiable auth/trusted publishing.

## Verification baseline

Choose the smallest risk-proportional set:
- docs/planning only: Markdown/link/reference/state checks + `git diff --check` + final diff review;
- local module/source: focused regression + `npm run build`;
- shared MCP/CLI/admin/runtime surface: focused regression + build + `npm run smoke`;
- concurrency/process/output/release risk: add `npm run stress`;
- dependency/release: add `npm audit --audit-level=high` and release packaging.

Never report “all tests passed” unless the complete relevant set actually ran.

## Durable development rules

- No Codex CLI for implementation, debugging, tests, review, or delegation.
- Preserve unrelated dirty/staged/untracked work, profiles, secrets, tunnels, worktrees, and external durable Goal state.
- Prefer extending existing modules/tools over new public tools/state stores. Full mode is already a large surface.
- Workspace/project configuration may tighten but never widen global/profile authority.
- All path-bearing provider/tool output passes PathGuard before use/disclosure.
- External binaries remain optional; no silent install/pull unless an existing explicitly authorized installer owns it.
- Windows is first-class; do not weaken PID/start-identity, canonical-path, file-lock retry, or exact-owner signaling guards for portability convenience.
- Keep semantic reasoning in the host model; CodexPro supplies deterministic evidence, execution, persistence, policy, and recovery.

## Navigation

- Roadmap/status: `docs/agentic/PLAN_INDEX.md`.
- Architecture direction: `docs/agentic/ARCHITECTURE_ROADMAP.md`.
- Stable decisions: `docs/agentic/DECISIONS.md`.
- Development/release/verification workflow: `docs/agentic/DEVELOPMENT_WORKFLOW.md`.
- Specs: `docs/superpowers/specs/`.
- Implementation plans: `docs/superpowers/plans/`.
- Public capability documentation: `FEATURES.md`, `GETTING_STARTED.md`, `README.md`, `FAQ.md`, `SECURITY.md`.

## Memory update rule

Keep only verified durable facts, decisions, active blockers, and current external baselines here. Replace stale state instead of appending a diary. Put detailed execution chronology, release hashes, CI run IDs, and obsolete branch state in Git/GitHub/changelog/task handoffs.
