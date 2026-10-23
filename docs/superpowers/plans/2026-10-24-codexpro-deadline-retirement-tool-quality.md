# Plan 48 — CodexPro 0.34: Deadline Retirement and Focused ChatGPT Tool Quality
Date: 2026-10-24 (Asia/Bangkok)
Status: **Released in v0.34.0 (2026-10-24); optional metadata changes omitted without real-host evidence**
Canonical repository: current authorized CodexPro checkout; branch `main`.
Source baseline observed: `49366b18f5fad4aae5b8953e42be0c43fc7554b0`; package/global CLI version `0.33.9`.
User authorized source implementation, tests, docs, Git commit and push. Running CodexPro remains protected; public publication requires the usual hosted gates.

## 1. Desired outcome and decision

Make CodexPro smaller and easier for contemporary ChatGPT/GPT-6 clients to use. **Retire the configurable per-MCP-call deadline feature fully**, including its observability/probe and time-budget routing. Preserve independent safety limits and established durable execution primitives. Improve selected existing MCP tool metadata only where a prompt evaluation identifies a real problem. Make no new tool family, host-specific GPT-6 router, public-plugin distribution system, or UI framework.

Treat this as one focused, independently reviewable `0.34.0` maintenance change with two ordered internal tracks:
- **P0 / required:** remove the obsolete synchronous-deadline subsystem with controlled compatibility migration.
- **P1 / conditional:** pilot description/schema/annotation improvements on existing tools, shipping only improvements that pass evaluations without regressions.
- **P2 / required:** remove obsolete setup-page fields and update active documentation/diagnostics and release evidence as part of P0, not as a standalone redesign.

`0.34.0` is proposed because CLI/profile/API field removals are breaking changes in a pre-1.0 release; follow the repo's SemVer convention when implementation begins.

## 2. Evidence, environment, and constraints

Read-only 2026-10-24 audit found:
- Git `main` clean and synchronized with `origin/main` at the baseline SHA above.
- 11 saved workspace profiles: **one live CodexPro instance** with an owned launcher, MCP server and tunnel on the local MCP port; 10 profiles stopped. Exact process identity and ownership **must be independently rechecked** before any future stop. Do not publish workstation-specific roots or process identifiers.
- `npm audit --audit-level=high` reported zero vulnerabilities. Only `typescript` 5.9.3 → 7.0.2 and `@types/node` 24.19.2 → 26.6.5 appeared as newer major versions; neither is within this plan.
- The source has approximately 268 broad deadline-related references, spread across 23 nonhistorical code/test/doc files plus archived plans, while `src/server.ts` already provides tool annotations, structured content, MCP server instructions and optional UI cards.
- Tool surface is already large (about 90 explicit full-mode names). Existing minimal/standard/full exposure gates, `supertool`, direct tools, PathGuard, permission gates, protected profiles, workflows, jobs, resumable batches, Durable Goals, MCP v2 compatibility, and Secure MCP Tunnel already exist.
- Public stable release is `v0.33.8`. Private local `0.33.9` candidate is not publicly released because GitHub rejects Actions dispatch with HTTP 422 despite repo permissions showing enabled. Do not infer this external restriction has cleared.

Official documentation compared:
- Plugin architecture: https://developers.openai.com/plugins/concepts/plugins
- Skills versus MCP server: https://developers.openai.com/plugins/concepts/skills
- MCP tool contract: https://developers.openai.com/plugins/concepts/mcp-server
- Tool metadata evaluation: https://developers.openai.com/plugins/guides/optimize-metadata
- Private tunnel / plugin testing: https://developers.openai.com/plugins/deploy/connect-chatgpt
- Secure MCP Tunnel limitation for public publishing: https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- Plugin packaging: https://developers.openai.com/plugins/build/plugins
- Security and privacy: https://developers.openai.com/plugins/guides/security-privacy
- GPT-6 Chat behavior: https://help.openai.com/en/articles/20001354-gpt-6-and-other-models-in-chatgpt

**Do not conflate the ChatGPT model with the MCP server.** GPT-6 Sol, its reasoning effort, host selection, Intelligent UI, and available tools are host-controlled. CodexPro can improve advertised tool affordances, response contracts, and safety, but cannot force model selection or client-side scheduling.

## 3. Explicit keep / retire / defer decisions

| Item | Decision | Rationale |
|---|---|---|
| Configurable synchronous-call deadline, bounded/observe mode, CLI/env/web form/profile controls | **RETIRE** | Primary requested removal; duplicates host timing assumptions |
| `DeadlineBudget`, context propagation, per-call yielding solely for this budget | **RETIRE** | Not needed after budget retirement |
| `tool_time_probe` and corresponding diagnostics/telemetry fields | **RETIRE** | Diagnostic exists solely for obsolete deadline |
| Deadline-derived execution thresholds and server instruction text | **RETIRE** | Produces misleading artificial routing cutoffs |
| Per-child command timeouts, HTTP loopback-probe timeout, retry/backoff, output-size bounds, cancellations | **KEEP** | Actual safety/integrity protections, independent of call-level deadlines |
| Managed workspace processes, jobs, batch resumes, Durable Goals | **KEEP/FREEZE** | Useful for long work and already owned by existing modules |
| PathGuard, project trust, auth, local-only controls, policy/permission gates, change journal | **KEEP** | Safety and recoverability |
| Minimal/standard/full tool modes; optional widget cards; local status page | **KEEP** | Already useful; avoid rebuilding interfaces |
| Existing public tool names, IDs and core result shapes (except deadline-only fields) | **KEEP** | Preserve consumers and saved workflows |
| Blanket redesign/rename of ~90 tools, new execution orchestrator, model-specific router or scheduler | **EXCLUDE** | High cost, weak evidence |
| New plugin marketplace infrastructure, external hosting/proxy, bundled lifecycle hooks | **DEFER** | Personal private tunnel suffices; public submission needs public HTTPS and different auth/security decisions |
| New plugin skills, resource framework, multi-widget UI, plugin analytics service | **DEFER** | Only consider after measured unmet need; existing instructions/tool cards cover workflow |
| Unrelated Node/TypeScript major upgrades | **EXCLUDE** | No security finding or user need |
| Targeted MCP metadata improvements, possible output schema on stable read-only tools | **CONDITIONAL** | Ship only if proven safe and useful by evaluation |

Do not delete historical release notes, specifications, or past plans. Mark their present applicability as retired/superseded in active documents; retaining history is not retaining executable functionality.

## 4. P0 — Deadline subsystem retirement

### 4.1 Map and protect contracts (red tests first)
- Snapshot `tools/list` and exposed descriptors for minimal, standard, full, with representative policy modes, before modification.
- Snapshot sanitized `server_config`, `tool_surface_diagnostics`, `connection_diagnostics`, `codexpro status` and authenticated `/setup` responses. Compare schemas; identify deadline-only keys versus independently useful telemetry.
- Add explicit regressions asserting that obsolete call-deadline settings, flags and tool names no longer appear in public metadata, UI, CLI help, config, runtime state, or new profile saves.
- Capture baseline per-command timeout, cancellation, resource/path policy, and safe read/write behavior for adjacent features; no external network operation beyond existing loopback fixture.

### 4.2 Remove production enforcement, without removing safety limits
- `src/deadline.ts`: delete the deadline budget, `AsyncLocalStorage` context and normalization API when all callsites are migrated.
- `src/server.ts`: eliminate `withSyncCallDeadline` wrapper, `tool_time_probe` registration/discovery, budget-dependent response fields and per-call deadline instructions. Keep structured results, telemetry duration, error handling and policy check wrappers unchanged.
- `src/checksOps.ts`: checks use the existing bounded *per-command* timeout and preserve explicit partial/failed/cancelled semantics; eliminate `deadlineYielded`, `deadlineLimitedChild` and incomplete state only caused by budget exhaustion. Avoid turning a failed check into a success.
- `src/contextBatch.ts` and `src/analysis/resumable.ts`: remove budget-yield branches, but **retain** explicit pagination, bounded batch sizes, continuation tokens, resumable jobs and other independent limits.
- `src/localServiceProbe.ts`: remove deadline-derived reduction in network timeout; retain its explicit 250–10,000 ms bounded local GET/HEAD timeout, allowlist, response-size caps and no redirects.
- `src/executionGuidance.ts` and `src/server.ts`: remove percentages/thresholds derived from the deleted 20-minute budget. Preserve compact, semantic long-work advice: prefer durable processes/jobs for high variance, potentially lengthy verification, or dependency/review graphs. Do not silently introduce a replacement fixed countdown or new scheduler.
- `src/diagnosticsOps.ts`: remove `runToolTimeProbe`, deadline counters, current/saved deadline fields; preserve neutral elapsed-duration telemetry, actual command timeouts, job progress and capability status. Update every consumer (including `src/http.ts`).
- `scripts/codexpro.mjs`: remove per-call budget parsers/CLI options/env forwarding/status fields and help text. **Separately choose/document the tunnel client's connection TTL based on supported tunnel-client transport needs, not the removed call budget.** Do not set infinity or change reconnect/heartbeat safety casually. Preserve launcher lease/PID/start-identity and ownership checks.

### 4.3 Saved-state migration and compatibility
- `src/config.ts`, `src/profileStore.ts`, `src/http.ts`: delete deadline types/fields from active contracts and setup forms. Leave unrelated settings and saved values untouched.
- On reading legacy profiles/runtime records, old deadline keys must **not influence behavior**. Provide a clear nonsecret migration notice for old CLI flags/env variables, or reject them with an actionable message; do not silently re-enable the feature.
- Implement a **narrow, atomic, reversible migration** for saved profiles *only when needed*: validate canonical root/owner, snapshot/back up exact bytes in protected local state, remove only the two obsolete fields, preserve credentials, all other values and file permissions. Test malformed and protected/symlink profile rejection.
- A running CodexPro instance must not be stopped, upgraded or rewritten under this planning instruction. Later implementation requires a fresh explicit stop approval for the exact current owner before global install; no automatic restart.
- Version public field removals and document noncompatible legacy clients that expect removed deadline diagnostics. Do not repurpose old field names.

### 4.4 Tests and documentation
- Replace `scripts/deadline-smoke.mjs`, `scripts/deadline-diagnostics-smoke.mjs`, `scripts/tool-time-probe-smoke.mjs` and obsolete sections of `scripts/execution-routing-smoke.mjs` with focused **absence + adjacent safety** assertions, or remove fully redundant fixtures if stronger covered checks exist; remove them from `package.json` scripts.
- Update affected `scripts/http-smoke.mjs`, `scripts/settings-smoke.mjs`, `scripts/checks-smoke.mjs`, `scripts/verification-repair-smoke.mjs`, `scripts/diagnostics-smoke.mjs` and existing fixture helpers.
- Update active `AGENTS.md`, `docs/agentic/DEVELOPMENT_WORKFLOW.md`, `docs/agentic/DECISIONS.md`, `README.md`, `GETTING_STARTED.md`, `FEATURES.md`, `CHATGPT_PROMPT.md`, `config.example.env` and `CHANGELOG.md`; reconcile `docs/agentic/PLAN_INDEX.md`. Preserve historical plan files as archives marked no longer operative.
- Static negative checks search all **active** code/config, emitted package, help/status output and exposed tool descriptors for obsolete keys. Old words may legitimately remain in changelog/history or a concise migration error message.

**P0 acceptance:**
1. No configurable per-MCP-call deadline feature or probe in the generated MCP tool surface, CLI/UI, active configuration, or freshly persisted profiles.
2. Existing command/network/cleanup/cancellation/size safety limits still pass positive and negative tests.
3. Verification/checks and resumable batches do not truncate due to retired per-call budget; independent continuation and job status still work.
4. Tunnel connects/reconnects with the standalone TTL behavior; no stale or missing-owner signals.
5. Profile migration proves targeted field removal and byte/value preservation of everything else, with rollback coverage.

## 5. P1 — Conditional GPT-6/MCP metadata pilot, not a platform rewrite

### Baseline
- Reuse the existing tool listing, `_meta.ui`/`openai/outputTemplate` cards, annotations and structuredContent. Avoid changing host model selection, reasoning level or server architecture.
- Create a **small golden prompt set** of approximately 20 prompts: 8 direct, 6 indirect/paraphrased, 6 negative (request is unsupported or belongs to a different tool). Include follow-up identifier reuse, wrong-workspace, read-only policy, potentially destructive edit and manual approval boundaries.
- Prefer the highest-frequency core actions: `open_current_workspace`, `search`, `read`, `show_changes`, `start_workspace_process`, `start_verification`, `job_status`, and `edit`. No need to edit all eight; select only observed failure cases.
- Record expected tools, exact schemas/permissions, false-positive activations, correct arguments and safe behavior **before any metadata edits**. Separate local protocol/schema validation from real ChatGPT model-selection evidence; never label synthetic tests as actual GPT-6 results.

### Controlled improvement
- First change **descriptions and argument documentation** on at most 4 tools with observed selection issues. Give concise 'use when / do not use when' distinctions, observable success/empty/error responses, and examples. Preserve public names and tool IDs.
- Review existing `readOnlyHint`/`destructiveHint`/`openWorldHint` and permission annotations for accuracy. Do not mislabel write/shell/external actions to make them easier to invoke. Backend authorization remains authoritative.
- Add an optional `outputSchema` to **at most 2 stable read-only results**, only if supported by the pinned SDK and verified against all success/empty/error outcomes without affecting structuredContent or older MCP clients. No blanket all-tools schema retrofit.
- Preserve optional UI cards as enhancements, not required parsing. Do not add another UI renderer or wrapper.
- Re-run the golden set with exactly the same prompts and supported host model where available. Compare correct-selection rate, wrong-tool rate, invalid argument rate, unsafe actions, and token/response bloat. Ship only improvements with **no safety regressions**, no negative-prompt precision loss, and a clear selection/argument improvement.

### GPT-6 policy
No `gpt-6` branching, manual model selection, model-id detection, reasoning-effort hacks, prompt-token dashboard, “intelligent UI generator”, or internal router. Local MCP tools should remain model-neutral and work with other supported clients.

## 6. Private connection and operator UX

- Keep the already-functional `/setup` page. Remove obsolete deadline controls/explanations, show the actual long-work choices (`start_workspace_process`, verification jobs and existing Goals) only as small explanatory copy.
- Keep accurate Secure MCP Tunnel ID versus Server URL instructions. Do **not** build a public hosted endpoint, OAuth server, plugin marketplace pipeline or separate plugin manifest for the current private local workflow.
- If host discovery genuinely requires reusable operator guidance, add **one short** private-connection troubleshooting section to existing docs. Avoid duplicating server-wide instructions with bundled skills.
- Defer local plugin packaging to a separately approved use case showing why a distributable plugin materially improves the current registered MCP app. Public submission additionally requires suitable public HTTPS hosting and authorization.

## 7. Execution sequence and verification gates

**Phase A — freeze baseline and migrations (read-only):**
1. Re-read `AGENTS.md`/project memory/workflow/index, current Git status, code changes, latest OpenAI/MCP references, all saved profiles and exact running process ownership.
2. Establish tool/CLI/API/profile contract snapshots and golden prompt evaluation set.
3. Document rollback source and protected profile byte-hash baseline.

**Phase B — P0 deadline retirement (first implementation batch):**
4. Write focused failing regression tests against obsolete feature visibility and saved-state behavior.
5. Delete executable deadline paths through CLI → config/store → server → verification/batches/probes → diagnostics/UX.
6. Migrate only validated legacy profiles with protected reversible snapshots **after authorized runtime-stop window**, or defer physical migration while the old runtime is running; never rewrite an active owner's state.
7. Verify the boundary tests, build, and complete smoke/stress as appropriate. Code + tests first; no unrelated refactor.

**Phase C — P1 metadata only if measurable (separately reviewable):**
8. Run golden prompts against current descriptors, then select **only actual** metadata problems.
9. Edit up to four tool descriptions; pilot at most two stable read-only output schemas if pinned SDK supports them. Re-evaluate. If no improvement, ship **nothing** for P1.

**Phase D — maintenance, release, operator safety:**
10. Synchronize help/site/docs, changelog, active planning status and version; compute release compatibility notes and `git diff --check`.
11. Full local `npm ci`, `npm run build`, focused tests, `npm run smoke`, `npm run stress`, `npm audit --audit-level=high`, `npm run release:pack`, `npm run package:smoke`; verify exact archive hashes, package-file allowlist and isolated npm consumer prefix before installation.
12. Require exact-commit hosted Windows and Ubuntu CI, Pages deployment and release gates **before public tag/release claims**. If GitHub Actions still returns 422, stop at a verified source candidate and label it unpublished; do not invent CI or publish unverified release assets.
13. Global install only after checking **all** saved profiles and obtaining explicit authorization to stop the **currently running** specific process tree. Never start/restart CodexPro as part of an agent run. Preserve profile/auth/tunnel state and verify installed provenance, doctor, absence of owner leaks.
14. Verify working tree, origin/main SHA, intended diff, protected state hash invariants, retained manual-start requirement, and report any skipped/live-host checks.

## 8. Explicit non-goals and risk register

**Non-goals:** new MCP tools, model provider routing, autonomous agent or task scheduler, new storage database, additional background daemons, platform-wide telemetry, public plugin publication, unsupported SDK migration, unrelated dependency upgrades, workflow engine refactors, browser automation, and broad tool renaming/pruning.

**Risks and mitigations:**
- **User data/profile integrity:** atomic targeted migration, preserve unrelated unknown fields and all credentials, isolated backups, never rewrite active runtime state.
- **Timeout safety regression:** budget removal must not remove per-command/network retry/cancel limits or change the tunnel TTL accidentally.
- **Contract break:** remove only deadline-specific public keys/tools; record migration and SemVer; test cached tool lists and legacy-client behavior.
- **Unexpected long tool hang:** rely on independent operation-specific bounds, explicit jobs/process cancellation, host control, and manual follow-up; no artificial replacement global budget.
- **Metadata regression:** no blanket rewrite; golden prompts include negative cases and safety/confirmation edges; revert unhelpful changes.
- **External GitHub Actions restriction:** report and gate publication, never bypass by falsely claiming hosted tests.
- **Running CodexPro instance:** do not stop/reinstall until explicit scope/approval and refreshed PID-start ownership proof.

## 9. Acceptance / definition of done

- [ ] Feature retirement proven at source, built package, CLI, MCP advertised tool list, diagnostics, authenticated UI, profile creation/migration and documentation.
- [ ] Existing tasks, processes, jobs, batch continuation, goals, policy, auth, tunnel renewal, cancellation, and safe limits retain coverage.
- [ ] Full project test and package gate passes; zero new security vulnerabilities introduced.
- [ ] Real-host tool selection improvement is measurable **or** conditional P1 is omitted.
- [ ] No redundant tools, new dependencies, daemons, databases, public plugin infrastructure or unrelated changes.
- [ ] Protected state retained; manual-only startup enforced; any stop/install separately authorized while currently running.
- [ ] Final intended Git diff, commit, push, package provenance and external release status independently verified.
- [ ] Public `0.34.0` called released only after hosted CI, tag-triggered release, Pages and archive checks actually succeed.

## 10. Planning disposition

One focused plan governs this implementation. The operator subsequently authorized source implementation, local verification, the exact-owned runtime stop, remote CI and release work. Source changes are committed on main; release and profile migration remain separately gated on their verified preconditions. The original pre-approval constraints above are historical scope notes, not the current execution status.


## 11. Local implementation evidence (2026-10-24)

- P0 source removal implemented in the 0.34.0 candidate: old budget implementation, observer mode, probe tool, deadline-based yields/routing/config/forms/diagnostics removed. Independent command/network/process limits and durable primitives remain.
- Retired CLI flags/environment values report actionable errors. Legacy profile reads drop obsolete keys and saves omit them; a disposable profile regression preserved credential and unrelated fields without modifying the source record on read. No real profile was migrated.
- The independent OpenAI tunnel TTL remains the previous finite 65-minute setting; public help points to released 0.33.8 until 0.34.0 becomes official.
- TypeScript build, release guard, selected smoke tests for routing, verification, batches, diagnostics, local-service probes, MCP compatibility, analysis, context, policies, capability explanations, preferences, tables and dependencies passed.
- Clean npm install, zero-high-vulnerability audit, archive packaging and isolated install smoke passed. Full `release:check` was later authorized and passed with isolated, test-owned runtimes; these fixtures were cleaned up, and no operator runtime was started.
- Conditional P1 metadata changes omitted because no controlled real-host GPT-6 tool selection baseline or demonstrated selection defect exists.
- The operator's runtime was subsequently stopped through its exact-owned process tree with explicit approval. Global installation still requires released-artifact checks and profile integrity verification. No public tag/release without exact-commit hosted Windows/Ubuntu CI and Pages.

## 12. Release and CI compute consolidation (2026-10-24)

- After explicit operator approval, stopped the exact owned CodexPro runtime process tree; no manual runtime was restarted.
- GitHub Actions began accepting workflow dispatch again. A previous candidate run exposed the release-help artifact link inconsistency and was cancelled once superseded to save compute.
- Retained mandatory Windows/Node 24 and Ubuntu/Node 20 CI smoke, full tag-triggered release verification, package integrity and security gates. Ignore documentation-only Markdown pushes/PRs; `workflow_dispatch` remains. Streamlined `npm run stress` to dedicated stress coverage (build and Goal smoke suites already run elsewhere in `release:check`).
- Corrected candidate CLI help to distinguish published stable downloads from unreleased candidate downloads, plus the build-identity regression and strict HTTP admin legacy-input tests.
- Full `npm ci` and `npm run release:check` passed on Windows Node 22.19.0 with controlled test fixtures and zero audit vulnerabilities. No test-owned CodexPro processes or port 8787 listeners remained.
- Exact-commit hosted CI and Pages, public tag/Release, protected profile migration and global installation are separate gates. Do not claim their success until verified.

## 13. Final v0.34.0 release evidence

- Tag `v0.34.0` peels to verified source `7d4054ee2da7a72a76852ab53c5f69fe615f8f84`. Hosted Ubuntu 24.04 / Node 20, Windows / Node 24, Pages, and the full tag-triggered Release workflow all passed at this SHA.
- Official GitHub archive `codexpro-full-0.34.0.tgz` and checksum sidecar are public. SHA-256 `701a7bdcfe04af3652cb6982eae80d7d5a3534bd5b6fdf45967f72a71ac88041`; 304 packaged files, `release` channel, exact tagged revision.
- Installed the downloaded release in a disposable consumer, validating all three CLI entrypoints. Installed the same verified public tarball globally in Windows NVM, verifying version 0.34.0 and release metadata.
- The global install preserved all 17 protected user files by hash. Removed only the two retired deadline keys from each of 11 saved profiles and retained exact pre-migration backup bytes in the user's protected local runtime archive. All 11 profiles pass `codexpro doctor` and report `stopped`. No CodexPro service was restarted and no port 8787 listener remains.
- GitHub Release is the canonical distribution. npm registry publication was not attempted because authentication was not configured; no credentials were requested or stored.
- Public documentation synchronization and the postrelease developer CLI stable-link correction are separate follow-up changes in `main`, not alterations to the immutable release archive.
