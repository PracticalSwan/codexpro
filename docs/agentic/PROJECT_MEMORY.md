# CodexPro Project Memory

Last verified: 2026-10-15 (Asia/Bangkok)

## Canonical workspace and identity

- Repository: `D:\Side Projects\codexpro`.
- Fork/origin: `PracticalSwan/codexpro`; canonical branch `main`.
- Upstream: `rebel0789/codexpro`.
- Latest fetched upstream baseline observed on 2026-10-05: `113472c6ff0a1516b6f223a43cd355abdf2e61ae`. The five upstream commits since the prior `482d003` baseline were reviewed selectively against the divergent Full fork: the applicable Windows handoff settlement, runner-owned execution-log contract, and packed-package install validation were ported without wholesale merging upstream release/version history.
- Product identity: **CodexPro Full**. Distribution package: `codexpro-full`; installed CLI and compatibility surface remain `codexpro`.
- Current public stable release: **v0.33.8**, tag commit `c4e88fb232825cc45bacc35e94b29d5c330ccf97`; GitHub Release archive SHA-256 `6b434fca0f0c31c82cb81000bffe4e66c9d4af663f161440d6bb72eb421b93c3` matches both its public sidecar and GitHub asset digest. The public archive is a release-channel build of that exact revision; a disposable install verified all three CLI entrypoints, all 308 packaged files byte-match the global Windows installation, and the live Pages site serves the 0.33.8 install URL. GitHub Releases are canonical; npm-registry publication requires separate verified authentication.
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

- **Latest local candidate update (2026-10-15; NOT a public release):** Fixed a reproducible setup-page bug where Discard after a successful profile Save reset dropdown, checkbox, and text fields to page-load values instead of the latest saved values. The regression was red before the fix, and browser tests passed afterward for Save → Discard, rejected Save, in-flight edits, dropdown/checkbox restoration, and 390px mobile layout. Full local `npm ci` + `npm run release:check` passed (complete smoke, stress, zero audit vulnerabilities, and packed install) before commit. Code commit `99e73a98fbf425e96a06b23dd3c907dc5378a094` is pushed to origin/main. The **current installed** Windows NVM global `codexpro-full@0.33.9` is a locally packed **main-channel** build of that exact code commit; archive SHA-256 `c0854b2c1606fb2bd666d3c4aa05b4f47daac3bc48f45b99369ebcc7c7b39499`. A strictly isolated disposable consumer installed it successfully. Post-install verification: 308 archive entries accounted for, 307 exact matches and one npm-normalized CLI shebang; 13/13 protected file hashes unchanged (10 saved profiles, per-user preferences, 2 hook/secret files); runtime stopped, no CodexPro-owned process and no port 8787 listener. **GitHub Actions platform-disabled state still blocks fresh hosted Windows/Ubuntu CI, Pages, version tag, and official GitHub Release. Public stable remains v0.33.8; do not label candidate 0.33.9 published.** WSL Ubuntu has no Node.js installed, so no independently qualified Linux validation was claimed.
- **v0.33.9 source candidate (2026-10-15, NOT released):** User-authorized local setup/status simplification, corrected OpenAI Tunnel ID workflow, responsive Save/Discard and unsaved-change handling, refreshed compatible dependencies, and a fix for intermittent hook stdin EPIPE crashes. The complete local npm ci + npm run release:check succeeded at candidate source commit 3e7e6d0f5ae7d78f74531df44ea474556332ca59, including full smoke, stress, zero audit vulnerabilities, and isolated packed-artifact installation; desktop and mobile browser interaction tests passed. The candidate was pushed to origin/main. **GitHub-controlled Actions restriction blocks publication:** repository Actions permissions are enabled (enabled=true, allowed_actions=all), workflows are active, but push creates no workflow runs and manual dispatch of CI returns HTTP 422: Actions has been disabled for this repository, even after idempotently reapplying the same enabled policy. Pages has not rebuilt for the new commit. The mandatory exact-commit hosted Windows/Ubuntu CI and Pages checks cannot run, so **do not tag/publish v0.33.9 or claim its archive is stable** until GitHub restores Actions and those checks pass; stable remains v0.33.8. GitHub documentation says a separate account/platform disabled state may require GitHub Support rather than repository-settings changes.
- **Previous v0.33.9 local candidate baseline (2026-10-15; superseded by the latest local candidate above):** After the local full release gate passed again at source revision `2b40e95016230c544012dceab06e5bdd4fd1b2a4`, the verified local package `codexpro-full-0.33.9.tgz` (SHA-256 `c09bfa19a2f476a0f306a34dac461072a13489f68a82fa37f3f59cf1ad3e23fe`, 308 packaged files) was disposable-installed and then globally installed under the existing Windows NVM prefix. The installed package reports version `0.33.9`, build revision `2b40e95...`, channel `main`. Exactly 307 files byte-match the archive; npm normalized only the executable shebang CRLF to LF in `scripts/codexpro.mjs` (the remaining bytes are identical). The identity-verified v0.33.8 launcher/server/tunnel tree was stopped with explicit operator authorization, without touching unrelated processes. CodexPro remains **stopped**, with no port-8787 listener or CodexPro-owned process; agents must not start it. All 10 saved workspace profile files, the per-user preferences file, and two hook/secret files preserved their pre-install SHA-256 hashes (13/13 unchanged). Four aged, unreferenced, non-symlink `codexpro-openai-tunnel-*` health-scratch directories were verified ownerless and removed; zero remain. Two unrelated stale workspace runtime records were left unmodified. This is a **local source candidate install**, not a released artifact or substitute for the still-blocked hosted CI, Pages, tag, and GitHub Release checks.

- **Disposable-install safety lesson (2026-10-15):** A manual test consumer without its own `package.json` caused npm to select an ancestor user-level project and briefly add a local candidate dependency there. The unintended dependency was uninstalled and the original direct dependency still works, but pre-existing transitive package-lock byte identity cannot be proven. Subsequent verification used an isolated consumer manifest and explicit npm prefix; the parent manifest hash remained unchanged. Future disposable installs must establish their own manifest and assert the resolved npm prefix before running npm.
- **v0.33.8 (2026-10-05):** Fixed an externally stopped OpenAI tunnel health-scratch leak. `codexpro stop` now removes only the exact validated `codexpro-openai-tunnel-*` directory directly under the OS temp root after the launcher/server ownership checks pass and the owned process tree is dead; tunnel recovery refreshes that recorded path, transient Windows deletion locks receive bounded retries, and corrupted/non-owned paths are rejected. The focused runtime-lifecycle regression was observed failing before the fix (`owned OpenAI tunnel health root remained after stop`) and passing afterward, with a companion guard proving an arbitrary path from runtime state is not deleted. The full local release gate passed on exact tag commit `c4e88fb232825cc45bacc35e94b29d5c330ccf97`; hosted CI run `37324352451` passed Windows/Node 24 and Ubuntu 24.04/Node 20, Pages run `37324350936` passed, and tag-triggered Release run `37325622592` passed. The public tarball SHA-256 is `6b434fca0f0c31c82cb81000bffe4e66c9d4af663f161440d6bb72eb421b93c3`.
- **v0.33.7 (2026-10-05):** Released the PID-reuse-safe OpenAI tunnel lease fix plus selectively reconciled upstream maintenance: Windows handoff execution settles from direct-child exit after a bounded close grace when descendants retain output handles; completion provenance is persisted; generated handoff plans no longer instruct implementation agents to write runner-owned `execution-log.jsonl`; and the release gate clean-installs the packed tarball in an isolated consumer and checks all three CLI entrypoints. Compatible dependency refreshes leave the high-severity audit at zero. The focused regressions were observed failing before their fixes, then the full local release gate passed twice on the final code/doc state; exact tag commit `85078a4e1c62c51d04aed3473ec153755e5dc975` passed hosted Ubuntu/Node 20, Windows/Node 24, Pages, and the independent tag-triggered Release gate. Investigation also found no CodexPro autostart in Scheduled Tasks, Run/RunOnce, Startup folders, Windows services, PowerShell profiles, or repository startup code.
- **v0.33.6 (2026-09-25):** Fixed an owner-verified Windows shutdown race in `codexpro stop`: after the recorded launcher exits, the CLI waits boundedly for its verified MCP server child without signaling an unverified PID. The delayed-child regression failed before and passed after the fix. The full local release gate passed (build, complete smoke, stress, zero-vulnerability audit, and package integrity), with zero leaked stress fixtures. The exact tag commit passed hosted Windows/Node 24 and Ubuntu 24.04/Node 20 CI, Pages, and the independent tag-triggered Release gate.
- **v0.33.5 (2026-09-25):** Shipped Git-ignore-aware workspace inspection (real CSX4201 inventory dropped from 403 files with 370 ignored outputs to 25 relevant files), corrected GitHub Release install help, pinned Ubuntu 24.04 CI/release runners, and bounded stress-fixture cleanup and diagnostic phase markers. Exact-commit hosted CI, Pages, and the tag-triggered release passed.
- **Temporary fixtures and CI diagnosis:** Historical CodexPro stress fixtures and 1,096 verified historical `codexpro-openai-*` test directories were cleaned during maintenance. v0.33.8 additionally closed the production OpenAI tunnel health-scratch leak left by externally initiated Windows stops. Current release and post-install verification leave zero `codexpro-stress-*` and zero `codexpro-openai-tunnel-*` directories. Hosted Windows smoke retains phase diagnostics for runner-specific stalls; no unsupported root-cause claim is made.
- **Historical v0.33.8 release-install baseline (2026-10-05):** The global Windows installation was CodexPro Full `0.33.8` from the checksum-verified public release artifact at revision `c4e88fb232825cc45bacc35e94b29d5c330ccf97` (build channel `release`). All 308 packaged files byte-match the installed package. All nine saved workspace profile hashes and the per-user preference hash `70F4A84263171BC564B225B008EADD155235068FE24B813695DB875348E3089F` remained unchanged across installation. Command resolution uses the valid NVM global prefix (`C:\nvm4w\nodejs\codexpro.cmd`). At that time every saved profile reported `stopped`, there was no port-8787 listener, running tunnel-client, OpenAI tunnel health directory, or stress fixture, and the workspace doctor reported `OK Ready`.
- **Publication boundary:** npm registry authentication is still unavailable as of 2026-10-15 (`npm whoami` exits nonzero), so no npm-registry publication was attempted. The verified GitHub Release remains the canonical public distribution channel. Upstream baseline `113472c6ff0a1516b6f223a43cd355abdf2e61ae` was reviewed selectively rather than merged wholesale because the Full fork is substantially divergent.

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
