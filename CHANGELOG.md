# Changelog

## Unreleased
- Fixed Windows/Node 24 CI races in HTTP-state continuity: transient temporary-directory locks now get bounded `fs.rm` retries after child teardown; structured-job startup tolerates bounded live-process identity-probe delays without weakening nonce/PID/start-key checks; fresh MCP clients explicitly reuse the original `workspace_id` and server-canonical workspace root; the job-runner regression is now part of `npm run smoke`; and transitive `hono` is refreshed to 4.13.7 to clear the current moderate security advisories.
- Clarified deadline/continuation behavior: the synchronous deadline is per MCP call rather than a whole-ChatGPT-turn timer, continuation checkpoints must be persisted proactively before risky long phases, and operators should leave a multi-minute margin below an observed host cutoff.
- Added an opt-in per-user global staged-commit safety hook (`codexpro hooks staged-commit enable`) that applies to every current and future CodexPro workspace without auto-trusting arbitrary project hooks; legacy project hooks pointing to the same packaged safety script are de-duplicated.
- Added a focused public getting-started guide covering stable-vs-main installation, OpenAI tunnel/key setup, daily startup, and safe multi-session/multi-project operation; README, FAQ, and the public site now link to the same workflow.
- Fixed installed-runtime observability so `server_config`, `codexpro_inventory`, and HTTP `/healthz` expose the actual `codexpro-full` package version; server config also exposes the HTTP session capacity and idle TTL.
- Fixed continuation-off tool gating so `continuation_*` MCP tools are not advertised or registered when task continuation is disabled.
- Fixed connection diagnostics so a recovered successful response can return current health to `healthy` while preserving historical dispatch/response failure counters.
- Fixed `show_changes` dirty-state reporting in large/unusual untracked workspaces: untracked status now uses collapsed Git porcelain output instead of expanding every untracked file, avoiding output-limit fallback to a false-clean result; collapsed untracked directories receive bounded recursive fingerprints and redacted synthetic text diffs so child edits invalidate same-session reviews; repeated unchanged reviews still suppress duplicate diff output without hiding current dirty status.
- Raised the default bounded HTTP MCP session capacity from 64 to 128 after a 70-client concurrency regression reproduced live-session eviction at the previous ceiling; the existing 30-minute idle TTL remains unchanged.
- Added an atomic per-user OpenAI tunnel lease so a second live CodexPro launcher cannot reuse the same tunnel ID on another local port/workspace and silently take over ChatGPT routing; stale leases are reclaimed, while distinct tunnel IDs remain concurrently usable.
- Marked browser/Telegram task continuation as experimental/incomplete pending deferred fresh-session installed-runtime acceptance; package defaults remain disabled.
- Hardened task-aware continuation telemetry, diagnostics, activity summaries, and Telegram error paths against private-looking browser/Telegram/account metadata, with synthetic security regressions for the public/reporting boundaries.
- Added strict continuation release guards for the managed-browser extension permission/host allowlists, private browser/session artifact paths, private ChatGPT routes, Telegram credentials/callbacks, and packaged textual state.
- Added formal continuation threat-model documentation plus sanitized live and fresh-ChatGPT-session acceptance checklists; browser continuation remains human-gated and does not scrape conversation output or automate login, Retry, model switching, approvals, safety controls, or restriction circumvention.
- Fixed `activity_log` self-recording so reading the evidence ledger is observational and does not advance its own sequence.
- Fixed Durable Goal `isolation_active` reporting so projected Goals no longer report active isolation after their worktree has been removed, while retained isolation metadata remains durable provenance.
- Fixed workspace-policy v2 write-family enforcement so a `write` resource rule also governs the mutation tools `edit`, `apply_patch`, and `apply_change_set`; non-mutating `prepare_change_set` can be governed independently, while application rechecks every prepared target and denies the entire transaction when any member is denied.
- Fixed Context Selection v2 change-strategy relationship direction so directly dependent tests are selected even when their filenames do not resemble the changed source file.
- Fixed CodeGraph readiness diagnostics so an installed but uninitialized workspace index is reported unavailable instead of current.
- Normalized structured verification failure locations to workspace-relative paths before repair synthesis, omitting out-of-workspace locations, and made activity-ledger check summaries distinguish passed/failed/not-run verification while retaining invocation-level `ok`/`error` status semantics.
- Added an opt-in Docker execution backend for one-shot Bash and workspace processes with a single workspace mount, `--network none`, bounded memory/CPU/PIDs, no host environment inheritance, no automatic install/pull/build/login, ownership-checked cleanup, and explicit no-fallback behavior. Windows Stage A is live-verified; Durable Goals remain host-only because the safe detached-worktree Git metadata gate does not pass with workspace-only mounts. Linux live validation remains pending.
- Migrated the MCP TypeScript runtime to the stable v2 split packages (`@modelcontextprotocol/server`, `client`, and `node`) with Zod 4, while deliberately retaining the legacy 2025 protocol era by default. Interactive `ask` policy remains fail-closed because hosted ChatGPT server-driven multi-round approval support is not yet verified.
- Added bounded deterministic repair metadata to `verify_changes`, including failure categories, likely paths, related tests, retry guidance, and next actions without autonomous repair execution.
- Added a bounded sanitized per-workspace activity/evidence ledger and read-only `activity_log` tool.

- Added durable touched-file checkpoints for `write`, `edit`, `apply_patch`, and `apply_change_set`, with bounded out-of-workspace preimages and hash-guarded `restore_checkpoint` that refuses to overwrite later user edits.
- Added explicit trusted-project lifecycle hooks with out-of-repository path+SHA trust records, CLI-only trust mutation, read-only MCP trust status, argv-only execution, sanitized environment, bounded hook resources, and pre-tool blocking that cannot override declarative policy.
- Added workspace policy v2 ordered per-action/resource allow/deny rules with normalized filesystem/Bash/Git resources, multi-resource fail-closed behavior, v1 backward compatibility, and supertool-equivalent enforcement.
- Established the MCP compatibility seam on the maintained v1 line, then migrated that seam to the stable v2 split packages under Plan 18 while preserving legacy protocol behavior and keeping input-required approvals and Tasks disabled.
- Made the interactive `codexpro openai-key save` prompt render `*` masks for entered characters and erase masks on backspace without echoing the runtime key.
- Fixed Full Access profile capability persistence: `settings set` and setup now preserve Analysis, Artifact Export, Durable Goals, CodeGraph, LSP, Git push, and environment-inheritance flags; `settings show` reports their effective state.
- Made OpenAI Secure MCP Tunnel the primary ChatGPT transport for new/no-profile `codexpro start` launches, using the official `tunnel-client`, tunnel-ID validation, `/readyz` supervision, and loopback-only local MCP forwarding.
- Kept CodexPro bearer authentication enabled in OpenAI mode and pass it to tunnel-client through referenced data rather than raw argv; OpenAI runtime API keys can now be saved once in a protected per-user secret file and are never written to workspace profiles.
- Preserved existing HTTP transports as explicit fallbacks. Migrating a saved ngrok profile to OpenAI retains its hostname/config so `codexpro ngrok` can reuse the previous stable endpoint.
- Added OpenAI-aware profile/admin/doctor surfaces and a fake-client regression suite that verifies default selection, fallback preservation, readiness gating, child supervision, and secret non-disclosure without contacting OpenAI.

## 0.32.3 (2026-09-06)

- Separated the fork distribution as `codexpro-full` while preserving the installed `codexpro` CLI and existing MCP/profile compatibility.
- Reworked GitHub automation into a bounded cross-platform CI matrix, release-integrity checks, tag-driven GitHub Release packaging with SHA-256 assets, and Dependabot maintenance.
- Made CI smoke fixtures self-contained by configuring repository-local Git identity and canonicalizing Windows temporary workspace roots before guarded workspace checks.
- Prepared the static `docs/` site and repository metadata for the fork's own GitHub Pages documentation.
- Repositioned the PracticalSwan fork as **CodexPro Full** while preserving the `codexpro` CLI/package/protocol compatibility surface and upstream MIT attribution. Canonical repository, issue, release-guard, local-admin, and documentation metadata now point to `PracticalSwan/codexpro`.
- Added `FEATURES.md` as the canonical 0.32.3 capability guide and refreshed active README/FAQ/security/launch/profile documentation so the fork is not confused with the separately published upstream npm package.
- Consolidated the verified CodexPro Full line onto canonical main and removed active documentation/UI dependencies on the temporary feature branch so branch cleanup does not break install, badge, or documentation links.
- Fixed workspace_events so allowed hidden workspace paths participate in create/edit/delete/rename snapshots while blocked paths such as .git remain excluded by PathGuard.
- Clarified open_current_workspace / open_workspace selection semantics: implicit selection remains intentionally MCP-session-local for isolation, and structured results now tell cross-session HTTP/ChatGPT callers to pass workspace_id explicitly.

## 0.32.2 (2026-09-05)

- Added persistent practical-profile capability settings to the authenticated local control page, including analysis, artifact export, Durable Goals, CodeGraph/LSP provider configuration, Git-push gating, environment inheritance, Bash transcript, and widget origin; secrets remain hidden and unchanged unless managed through their existing protected paths.
- Wired those saved capability settings through `codexpro start` so the next runtime actually receives the selected gates, while retaining existing workspace/tunnel/authentication profile state.
- Updated the optional CodeGraph provider for CodeGraph 1.6.x (`status [path]`, `query --path`, `sync [path]`), including its current JSON result shape and explicit freshness status. Windows npm shims are invoked through the trusted package entrypoint without shell interpolation.

## 0.32.1 (2026-09-05)

- Fixed live ChatGPT HTTP continuity for workspace-owned `proc_*` process handles and `evt_*` workspace-event cursors by moving those registries to process-level runtime state shared across MCP sessions; per-session close no longer destroys them, while HTTP shutdown still terminates owned child processes deterministically.
- Fixed `git_blame(max_lines=...)` to bound Git itself with a line range and one look-ahead line for truncation detection, preventing `ENOBUFS` on ordinary larger tracked files.
- Added cross-session HTTP regressions for process status/output/stop and event-cursor reuse, plus a large-file blame regression with a deliberately small output buffer.
## 0.32.0 (2026-09-05)

- Added workspace-owned long-running process management with opaque handles, bounded cursor output, deterministic cleanup, trusted check discovery/execution, change-aware verification, and structured test results. Windows restricted Bash now preserves the minimal process-launch environment npm needs and derives `ComSpec` from an existing `SystemRoot\System32\cmd.exe` when required.
- Added bounded batch reads/searches, path-specific AGENTS instruction resolution, ranked/dependency-aware context gathering, workspace event cursors, and strict durable task checkpoints that store task facts rather than hidden reasoning.
- Added bounded Git history/show/blame, package graphs, change-impact analysis, preflight scanning, explicit-path staging, HEAD/branch/staged-set guarded commits, and opt-in push with no force-push path.
- Added streamed Codex-session search with stable byte anchors and bounded read-around navigation for large local JSONL histories.
- Added built-in fuzzy file finding plus optional explicitly configured CodeGraph and LSP adapters. External provider paths are revalidated through the workspace guard; CodeGraph synchronization remains explicit and hidden when unavailable.
- Added safe ZIP inspection/transactional extraction, bounded non-executing PDF/OOXML document inspection, and opt-in bounded MCP embedded-resource export without local-path disclosure.
- Added opt-in Durable Goals with bounded DAG scheduling, detached Git-worktree execution that survives MCP disconnects, cross-process ownership/recovery, pause/resume/cancel, explicit safety review, and fingerprint-guarded source projection. Goals never auto-commit, push, merge, deploy, publish, or persist task stdout/prompts/hidden reasoning.
- Extended workspace policy so it can disable optional Git-push/code-intelligence/artifact/Goal capabilities and lower process/check/archive/document/export/Goal resource ceilings without broadening global authority.


## 0.31.0 (2026-09-05)

- Added a strict, tightening-only per-workspace `.codexpro-policy.json` with centralized effective-policy enforcement, bounded validation, additional blocked paths, verification guidance, tighter resource ceilings, and the read-only `effective_policy` MCP surface.
- Added the shared operation journal/concurrency core with durable bounded receipts, `operation_status`, idempotent retries for mutation tools, transactional multi-file change sets, safe hash-checked revert, resource budgets, and deterministic workspace/file leases. Change-set preimages remain memory-only and are never written to the journal.
- Added bounded local observability with connection, tool-surface, and telemetry MCP diagnostics plus the authenticated `/admin/diagnostics` API and local admin diagnostics panel. Diagnostics retain counters and sanitized metadata only, not prompts, file contents, tokens, or raw command output; normal MCP SSE stream closure is tracked without being misclassified as a response failure.
- Made `git_diff(include_diff=false)` use bounded `git --numstat` output instead of materializing the full unified diff, preserving nested-repository path scoping and Git failure diagnostics while avoiding output-buffer exhaustion on large diffs.
- Reconciled the maintenance integration stack against current upstream/fork state, refreshed vulnerable transitive lockfile dependencies, and tightened release-package checks so internal agent/planning/private state cannot enter the npm tarball.
- Hardened Windows sensitive-path handling across file tools and safe Bash: blocked names now match case-insensitively, and NTFS alternate-data-stream paths are checked against their base file so variants such as `.ENV`, `.Git`, `ID_RSA`, uppercase private-key extensions, and `.ENV:secret` cannot bypass the guard.
- Made the execute-handoff release smoke accept resolved Windows `.cmd` adapter paths instead of requiring the bare CLI name.
- Prioritized tracked source/config/infrastructure files within bounded repository analysis and stopped documentation/generated filenames from creating runtime risk signals on their own.
- Added parsed recent commits and bounded AI handoff context to `workspace_snapshot` structured output so it matches the information promised by the tool descriptor.
- Added bounded regex search to the Node fallback in an interruptible worker when ripgrep is unavailable, exposed search capabilities explicitly, and made ripgrep JSON/stdout decoding safe across UTF-8 stream chunk boundaries.
- Made `codexpro_self_test` read-only by default and separated health from intentional security posture: skipped/info checks no longer make a healthy trusted full-mode configuration report WARN.
- Separated Bash transcript retention from runaway-output termination: verbose commands can finish successfully with bounded returned output, while a higher observed-output ceiling terminates true output floods and reports explicit termination/byte/encoding diagnostics.
- Made Bash descriptions and server instructions reflect `bash=full`, removed misleading static destructive/open-world annotations from the mixed-capability `codexpro` supertool, and made compact Bash output refer to the structured tool result rather than a card.
- On Windows, Bash stdout/stderr are retained as raw bytes and decoded per stream after exit, preserving UTF-8, recovering UTF-16 output with BOM or NUL-pattern evidence, and accepting high-confidence supported legacy encodings such as GBK/GB18030.
- Preserved explicitly opened descendant workspace IDs across HTTP MCP sessions with a process-level registry, while keeping implicit workspace selection session-local.
- Fixed `apply_patch` in workspaces that are subdirectories of a parent Git repository by applying workspace-relative patches under the Git prefix and rejecting Git's zero-exit `Skipped patch` result.
- Made `codexpro_self_test` Pro-context probing independent of the write probe and restore or remove its temporary `.ai-bridge/codexpro-self-test.md` file after diagnostics.
- Fixed the local web profile editor to reuse the captured CodexPro token as a Bearer credential after browser history cleanup, so Save profile works on token-protected setups.
- On Windows, Bash now prefers Git for Windows instead of silently launching WSL, and server/self-test diagnostics report the resolved Bash, Git, and search runtimes including Node search fallback. Set `CODEXPRO_BASH_EXECUTABLE` to an absolute Bash path for an explicit override.
- Path-scoped Git tools now resolve a nested repository beneath a wider non-Git workspace root before running status/diff operations.

## 0.30.0 (2026-08-08)

- Published the multi-project allowlist that was already on `main`: `codexpro settings set --project`, `--clear-projects`, session-local `open_workspace` selection, and matching FAQ guidance. npm `0.29.0` did not include those commits, which caused empty Allowed Roots reports after following current docs.
- Rejected invalid relative `HOME` values such as `=` in restricted bash child environments, prefer a usable absolute `USERPROFILE`/`HOME`, and forward Windows `APPDATA`/`LOCALAPPDATA` when valid so npm cache dirs are not created inside workspaces.
- Raised the bash `timeout_ms` hard cap from 180s to 10 minutes by default (max 15 minutes via `CODEXPRO_MAX_BASH_TIMEOUT_MS`). Per-command default remains 30s.
- Follow directory symlinks under configured skill roots during skill discovery so managers such as cc-switch can install skills as links. Thanks @yuczzzzz. Keep symlinked/junction skills tagged by their configured scan root and accept both realpathed and caller-supplied home spellings so Windows junctions keep `user` / `~/` identity.
- Added `import_file` for ChatGPT Apps SDK attachments (`openai/fileParams`), with HTTPS host allowlisting, redirect revalidation, streaming size limits, SHA-256 checks, MIME sniffing, and workspace write-mode gating.
- Documented update steps (`npm install -g codexpro@latest`), ChatGPT web Agent vs CodexPro, and dual-account / dual-tunnel process separation in the English and Chinese FAQs.
- Updated transitive dependencies so `npm audit --audit-level=high` reports zero known vulnerabilities.

- Added saved additional projects with `codexpro settings set --project <path>`, session-local workspace selection through the existing `open_workspace` tool, and `--clear-projects` for removing the saved allowlist.
- Isolated workspace selection between HTTP MCP sessions while preserving explicit workspace-id access for configured roots, with stdio, HTTP, profile, and regression coverage.
- Added native workspace image inspection for PNG, JPEG, GIF, and WebP files through `view_image`.
- Added optional SHA-256 preconditions and canonical-path write serialization for `write` and `edit`, preventing stale multi-session edits from silently replacing newer file content. New files use atomic replacement; existing files retain inode-bound metadata and hard-link identity through in-place updates.
- Added `codexpro start --headless` with non-interactive readiness output, supervised HTTP-runtime failure propagation, runtime PID status, and signal cleanup.
- Updated the MCP SDK and affected transitive HTTP, URI, and pattern-matching dependencies to patched releases; the release audit now reports zero known vulnerabilities.
- Hardened public HTTP authentication with a 24-byte minimum token, per-client failed-attempt throttling, no-store/no-referrer browser responses, and immediate removal of onboarding token parameters from the visible URL.
- Pinned automatic `cloudflared` installation to release `2026.7.2` and verify each supported platform asset against its published SHA-256 before writing or extracting it.
- Closed cross-session and concurrency gaps by isolating `show_changes` checkpoints per MCP session and making `apply_patch` share canonical per-file write locks with `write` and `edit`.
- Made bounded ripgrep truncation tolerate an interrupted final JSON record, rejected symlinked `.ai-bridge` handoff paths, and terminated timed-out bash process trees instead of only their direct shell process.
- Closed the follow-up security findings by rejecting symlinked handoff leaf files, bounding and force-terminating output-heavy bash trees, disabling unbounded regex in the Node search fallback, size-capping verified `cloudflared` downloads, removing `cmd.exe call` re-expansion, excluding internal plans from npm packages, and adding a protected `--token-file` path for stable launches.
- Added Windows CI coverage and made smoke, stress, tunnel-shim, and runtime-status checks portable across Windows and Unix hosts.
- Made skill inventory and name-only `load_skill` use one deterministic winner per skill name, with workspace skills taking precedence over user-global and plugin skills.
- Kept explicit `source` and `path` overrides available for diagnostics or intentionally loading a suppressed duplicate.

## 0.29.0 (2026-07-13)

- Replaced the heavy v9 Apps widget with a compact, host-theme-aware v10 card for selected user-visible results: workspace, analysis, changes, Git status, handoff, and terminal verification.
- Fixed cards that stayed on a loading placeholder after ChatGPT completed a tool call by accepting bounded nested result envelopes and showing a clear unavailable state instead of an infinite animation.
- Kept raw reads and searches in normal chat output, added local copy support only for bounded terminal results, and added widget bridge smoke coverage.
- Added guarded release scripts that reject wrong-folder and `npm --prefix` pack/publish attempts, verify the canonical CodexPro tarball, and require a full release check before publishing.

## 0.29.0-beta.1 (npm beta, 2026-07-11)

- Added bounded multi-language repository analysis, grouped search results, change-impact and test recommendations, `codexpro inspect` / `codexpro review` CLI commands, and compact opt-in tool cards.
- Added `codexpro connection-test`, a read-only connector profile with no bash or tool cards, plus request-arrival logging and current ChatGPT Plugins troubleshooting.
- Added Tailscale Funnel as a saved tunnel/profile option, including `codexpro tailscale --hostname ...`, launcher support, admin profile support, and settings smoke coverage.
- Added proxy-aware Cloudflare quick tunnels: when proxy env vars are set, CodexPro requests quick-tunnel credentials through `curl --proxy`, runs `cloudflared` with a temporary credentials file, ignores Cloudflare API URLs, and cleans the credentials file after shutdown.
- Hardened Codex handoff execution on Windows by resolving spawnable Codex shims, asking Codex to read the plan file instead of argv-passing the whole plan, and recording git status in handoff artifacts.
- Added concise connector-creation troubleshooting to the English and Chinese FAQs.
- Bounded browser-facing tool-card structured payloads and binary-file text checks so CodexPro emits less data without reducing normal tool-result or binary-detection quality.
- Allowed targeted line-range reads and search matches in text files slightly above `maxReadBytes`, while keeping full-file reads and very large scans bounded.
- Replaced the overlong README with a shorter install, tunnel, safety, RAM-boundary, and development guide.
- Added a guarded `apply_patch` MCP tool for unified-diff edits inside workspace write mode, with blocked-path and secret-content checks before patches are applied.
- Added last-shown review checkpoints to `show_changes`, so repeated unchanged reviews collapse while new workspace changes still produce a fresh diff.
- Fixed checkpoint-hit `show_changes` responses so repeated unchanged reviews report zero new diff stats instead of carrying stale addition/deletion counts.
- Scoped `apply_patch` result diffs to the applied patch, so unrelated dirty tracked files are not folded into the patch card.
- Hardened safe bash filtering, path canonicalization, binary-file checks, ripgrep truncation reporting, and supertool argument validation around edge-case bypasses found by stress testing.
- Redacted child tunnel process output before logging or surfacing startup failures so Cloudflare `TUNNEL_TOKEN` values cannot leak from failed named-tunnel launches.
- Kept `codex_sessions` metadata mode from returning transcript-tail summaries, skipped unreadable stale history files, and accepted source paths under symlink-resolved Codex history roots.
- Hardened search, context export, path blocking, skill loading, and change summaries around hidden files, colon-containing paths, `.env` descendants, large-file limits, user skills, and diff stats.
- Blocked raw newline and carriage-return command separators in safe bash mode before whitespace normalization, including through the stable `codexpro` supertool wrapper.
- Corrected docs to describe Developer Mode account eligibility as broader than Plus/Pro while keeping the model/tool-surface limitation explicit.

## 0.28.6 (main, pending npm latest)

- Added the stable `codexpro` supertool wrapper for advanced connector-cache/custom workflows, while preserving tool/write/bash mode gates.
- Hardened direct HTTP auth defaults, local `--no-auth`, token redaction, search parsing, selected-path Pro exports, and handoff polling state.
- Added `npm run stress` to cover full-mode MCP behavior, supertool dispatch, skill caps, card payloads, search edge cases, Pro export, and handoff polling.
- Fixed CLI env precedence so `CODEXPRO_HOST` / `CODEXPRO_PORT` override generic `HOST` / `PORT`, preventing ambient process env from widening a launcher-validated bind.
- Normalized stable public hostnames in CLI settings/setup/start flows and accepted common `--flag=value` syntax.

- Made ChatGPT tool-card descriptor metadata opt-in with `CODEXPRO_TOOL_CARDS=1`, so default `tools/list` responses stay plain MCP and avoid fragile widget metadata during tool discovery.
- Added `codexpro loop-handoff` for bounded local execute/review loops over `.ai-bridge/current-plan.md`, with a required local `--review-command`, `--max-iters`, dry-run preview, optional test command capture, and stop conditions for no diff, repeated diff, missing follow-up plans, reviewer errors, and human cancellation.
- Hardened `loop-handoff` external-command boundaries: commands are preflighted before execution, reviewer verdicts require explicit `CODEXPRO_REVIEW=...` assignment lines by default, and reviewer `PASS` no longer masks failed executor/test/reviewer commands unless the user opts into the supported override behavior.
- Fixed loop change detection so `--stop-if-no-files-changed` and `--stop-if-same-diff` compare each iteration against a pre-execution baseline and count unstaged diffs, staged diffs, and untracked file fingerprints outside `.ai-bridge`.
- Switched loop guard decisions to an uncapped git-state fingerprint instead of hashing or vetoing on the trimmed reviewer diff artifact.
- Kept handoff plan hashing on the handoff read-size budget instead of `--max-output-bytes`, so valid plans larger than captured output excerpts do not abort the loop after execution.
- Made loop change fingerprints content/status based instead of timestamp based, so repeated identical tracked-file writes stop as no new changes instead of looking different because of volatile mtimes.
- Normalized Git porcelain paths back to workspace-relative paths before loop clean-start filtering and change fingerprinting, with path-scoped status and untracked-file scans so nested workspaces inside larger Git repos are handled correctly.
- Bounded untracked file fingerprinting so symlinks are reported via `readlink` and regular files hash only a capped prefix instead of following arbitrary paths or reading entire generated artifacts.
- Tightened `--require-clean-git-start` so staged renames are treated as handoff-only only when both rename endpoints are inside `.ai-bridge`.
- Stopped reviewer `FAIL` and implicit review verdicts from continuing when the reviewer deletes, empties, or restores `.ai-bridge/current-plan.md` to the scaffold instead of writing a usable follow-up plan.
- Kept the autonomous handoff loop CLI-only and local-terminal-owned; it does not expose agent execution as a remote MCP tool, automate ChatGPT Web, approve product prompts, proxy models, or bypass limits.
- Extended handoff smoke coverage with a fake reviewer that fails once by writing a follow-up plan, then passes on the second local executor iteration, plus failed executor, failed reviewer, bare `PASS`, staged-only, untracked-file, bounded-untracked, dirty-baseline, repeated-identical-write, nested-workspace, nested-untracked-workspace, outside-untracked-nested-workspace, large-dirty-baseline, unavailable-diff-artifact, large-plan-over-output-cap, staged-rename, deleted-follow-up-plan, and implicit-deleted-plan cases.

## 0.28.5

- Added a compatibility alias for stale ChatGPT descriptors that still request `ui://widget/codexpro-tool-card-v8.html`, while keeping `ui://widget/codexpro-tool-card-v9.html` as the current advertised widget.
- Stopped advertising the `bash` MCP tool when `CODEXPRO_BASH_MODE=off` / `codexpro start --no-bash` is active, so ChatGPT has less opportunity to attempt a shell tool call in no-bash sessions.
- Stopped advertising direct `write` and `edit` tools unless `CODEXPRO_WRITE_MODE=workspace`; handoff/off modes keep handoff planning tools available for bounded `.ai-bridge` plan files without exposing generic source edit actions.
- Added smoke coverage that compares `codexpro_self_test` expected tools against the actually registered MCP tool set, so disabled tools cannot silently remain visible in ChatGPT's tool list.
- Tightened `CODEXPRO_CONTEXT_DIR` to workspace-relative hidden directories such as `.ai-bridge`, rejecting source/build/dependency/credential directories and absolute paths.
- Made saved profile handling stricter: non-agent modes cannot inherit `write=workspace`, relative tunnel config/token paths resolve from the workspace, and `settings set` refuses to persist raw Cloudflare tunnel tokens.
- Completed the local admin profile form for named Cloudflare/ngrok settings, including tunnel name, config paths, token-file path, and cloudflared auto-install preference.
- Fixed path-scoped `show_changes` so unrelated workspace status is not reported for a clean requested path.
- Kept duplicate `load_skill` matches ambiguous until the caller supplies the exact displayed skill path.
- Added `codexpro_self_test`, a local-only diagnostic that checks modes, expected tools, safe bash policy, selected-only Pro context, and an optional `.ai-bridge/codexpro-self-test.md` write/edit probe without touching source files.
- Upgraded ChatGPT cards to `ui://widget/codexpro-tool-card-v9.html` and attached compact card metadata to every CodexPro tool, with large git/tree/context/bash payloads folded or bounded instead of printed as a giant chat block.
- Added `include_important_files` and `include_changed_files` controls to `export_pro_context` plus CLI smoke coverage for exact selected-only bundles.
- Added a dedicated compact `server_config` renderer and accepted model-friendly aliases `workspace_snapshot.max_files` plus `git_diff.include_diff=false` to reduce avoidable retry/error loops in ChatGPT.
- Reconfirmed the compliance boundary in runtime diagnostics and docs: CodexPro is a local workspace MCP bridge, not a model provider, model proxy, quota bypass, resale layer, or remote executor.
- Added `codexpro start --no-bash` and documented that CodexPro does not bind MCP bash to a Codex app conversation id.
- Added an optional bash session guard with `--bash-session <id> --require-bash-session`; guarded `bash` calls must include the matching `session_id` before any shell command runs.
- Made bash chat transcripts compact by default, with `--bash-transcript full` for the old raw stdout/stderr chat output.
- Added opt-in local Codex session discovery with `--codex-sessions metadata|read`, including session ids, titles, cwd paths, source files, resume commands, and bounded transcript reads only in explicit `read` mode.
- Added a token-protected local profile editor at `/admin/profile` and the setup page so users can save tunnel, hostname, port, mode, bash, Codex session, write/tool mode, widget origin, and tunnel config defaults for the next `codexpro start` without exposing raw tokens in the browser.

## 0.28.4

- Made workspace cards compact by default, moving git details, discovered skills, and optional file tree output behind collapsible disclosure rows.
- Changed workspace open skill discovery to include workspace, user, and plugin skills by default while still exposing a focused `standard` tool surface.
- Added read-only `load_skill` so ChatGPT can load bounded `SKILL.md` instructions for discovered workspace, user, or plugin skills without exposing arbitrary path reads.
- Kept AGENTS detection in the workspace open result but stopped embedding the full AGENTS file in the open response; agents can read it explicitly when needed.
- Fixed setup propagation for `--widget-domain` and corrected workspace-card git status splitting for multi-file diffs.

## 0.28.3

- Added `CODEXPRO_WIDGET_DOMAIN` and the Apps SDK resource metadata keys `_meta.ui.domain` plus `_meta["openai/widgetDomain"]` so ChatGPT no longer reports that the widget domain is missing.
- Surfaced the widget domain in server config, HTTP status output, docs, env examples, and smoke tests.

## 0.28.2

- Moved ChatGPT visual cards from `bash` to the workspace open tools so the first call gives a compact project orientation instead of noisy terminal cards.
- Kept `bash` data-only for focused verification commands and strengthened server instructions to prefer `tree`, `search`, `read`, and `show_changes` for inspection/review.
- Upgraded the widget to v8 with a workspace summary renderer and a neutral waiting state instead of a stale-looking running card.

## 0.28.1

- Added `CODEXPRO_TOOL_MODE=minimal|standard|full`, with `standard` as the default focused ChatGPT tool surface and `full` preserving the previous advanced toolbox.
- Added `show_changes` as a review-oriented visual card for git status, diff stats, and optional diff while keeping raw `git_diff` data-only.
- Upgraded the ChatGPT widget to v7 with compact bash execution summaries, review cards, and cleaner handoff cards.
- Allowed `open_workspace` to accept `path` as an alias for `root` to reduce client argument mismatch failures.
- Allowed safe package scripts with colon suffixes such as `npm run build:clients` for build/test verification.
- Surfaced tool mode in server config, local status, workspace/context exports, launcher output, setup profiles, and docs.

## 0.28.0

- Added `codexpro execute-handoff` as an opt-in local executor for `.ai-bridge/current-plan.md`.
- Added `codexpro watch-handoff` as an opt-in local watcher that executes new handoff plans by content hash without exposing execution as a remote MCP tool.
- Added built-in local adapters for `opencode`, `pi`, and `codex`, plus a restricted `--command` template path for custom agents.
- Added `--dry-run`, `--yes`, timeout handling, stdout/stderr capture, `agent-status.md`, `implementation-diff.patch`, and `execution-log.jsonl` output.
- Kept `handoff_to_agent` planning-only; local execution is not exposed as a remote MCP tool.
- Fixed Windows release-gate coverage for symlink-escape smoke tests, Bash lookup, and custom executor paths containing spaces.
- Added smoke coverage for dry-run previews, custom command validation, execution status, diff collection, duplicate watch-plan skipping, and structured execution logging.
- Clarified that CodexPro is an official Developer Mode/MCP workflow, not a rate-limit bypass or model access provider.

## 0.27.2

- Added `handoff_to_agent` for file-based handoffs to Codex, OpenCode, Pi, or custom local implementation agents without executing local commands.
- Extended `.ai-bridge` with generic `agent-status.md`, `implementation-diff.patch`, and `execution-log.jsonl` files.
- Updated `read_handoff`, `codex_context`, Pro apply logging, docs, and smoke coverage for generic agent handoffs.
- Fixed secret detection so benign env-var references like `process.env.TOKEN` are not blocked or redacted as literal secrets.
- Shell-quoted generated agent command hints so model names cannot inject extra shell tokens.
- Bounded append-mode handoff reads with the configured text-file size guard.

## 0.27.1

- Fail closed when HTTP MCP auth is required but `CODEXPRO_HTTP_TOKEN` is missing, including public tunnel mode and non-loopback binds.
- Block additional safe-bash bypass paths for absolute paths, parent paths, environment expansion, sensitive paths, and `find` write/action flags.
- Added smoke coverage for the missing-token HTTP startup failure and safe-bash blocked command cases.

## 0.27.0

- Kept terminal startup focused on only the connector URL and essential controls; usage prompts now belong in README/docs only.
- Made `git_diff` data-only instead of a widget-rendered tool. This reduces noisy ChatGPT cards and avoids template fetch failures for empty/no-op diffs.
- Kept visual cards scoped to high-signal outputs: source writes, exact edits, Pro context exports, and Codex handoffs.
- Updated smoke coverage so routine inspection tools stay compact.

## 0.26.0

- Removed prompt management from the terminal control panel.
- Removed the `s` hotkey and all launcher-side suggested prompt generation.
- Kept usage prompts and workflow examples in documentation instead of runtime UI.

## 0.25.0

- Simplified the ready screen so startup shows one compact status block instead of a long boxed next-step panel.
- Reduced visible controls to the common actions: open ChatGPT, copy URL, open status, copy prompt, help, and quit.
- Changed the `s` control to copy the suggested ChatGPT prompt instead of printing the full prompt repeatedly.
- Cleaned up saved setup list formatting so reused ngrok/Cloudflare profiles are easier to scan in narrow terminals.

## 0.24.0

- Added `codexpro settings list` to show all saved workspace tunnel profiles.
- Added `codexpro settings use` and `--from-root` to copy a saved setup from one workspace to another.
- Improved first-run `codexpro start` behavior: if the current workspace has no settings but other saved setups exist, CodexPro shows them as a numbered list so users can reuse an existing ngrok or Cloudflare setup instead of retyping hostnames.
- Expanded settings smoke coverage for profile listing and reuse.

## 0.23.0

- Added a compact first-run tunnel picker to `codexpro start` when no workspace settings exist, so users can choose Cloudflare quick, ngrok, Cloudflare stable, or local mode without running the full setup wizard.
- Added `codexpro settings` with `show`, `set`, and `delete --yes` actions for persistent per-workspace tunnel preferences.
- Persisted the selected tunnel provider, hostname, port, mode, and CodexPro token until the user changes or deletes the workspace settings.
- Added `scripts/settings-smoke.mjs` and included it in `npm run smoke`.

## 0.22.0

- Added the v5 Apps SDK widget resource at `ui://widget/codexpro-tool-card-v5.html` with cleaner pending states and more polished diff/search/code cards.
- Added a token-protected local admin dashboard at `/` and `/setup` for workspace, mode, allowed-root, setup, profile, and ChatGPT connection visibility.
- Added the terminal `o` control to open the local admin dashboard while CodexPro is running.
- Updated HTTP smoke coverage to verify the onboarding page and v5 widget resource.

## 0.21.0

- Added `codexpro doctor` as a read-only setup diagnostic for Node, build artifacts, workspace profiles, port availability, tunnel prerequisites, clipboard support, and browser-open support.
- Added `scripts/doctor-smoke.mjs` and included it in `npm run smoke`.
- Added `PUBLIC_LAUNCH_CHECKLIST.md` with release gates, ChatGPT Developer Mode golden prompts, security checks, onboarding expectations, and current non-goals.
- Added `npm run doctor` and included the public launch checklist in the npm package surface.

## 0.20.0

- Made `codexpro setup` prompts clearer with a dim "Enter to proceed with default" hint before each defaulted input.
- Simplified the ready screen: the Server URL is described as already copied, and Enter is clearly labeled as opening ChatGPT connector settings.
- Added saved-profile hints so ngrok/Cloudflare stable setups tell users that future launches from the same workspace only need `codexpro start`.
- Added a local port preflight with clear guidance for running two repositories at the same time.
- Documented the multi-repo rule: each concurrent repo needs its own local port, and stable public tunnels need separate hostnames.

## 0.19.0

- Added per-workspace saved profiles under `~/.codexpro/profiles/`.
- `codexpro setup` now saves tunnel provider, hostname, port, mode, and a generated reusable CodexPro auth token by default.
- `codexpro start` now loads the saved profile for the current workspace unless `--no-profile` is passed.
- Added `--save-config`, `--no-save-config`, and `--no-profile` launcher flags.

## 0.18.0

- Added ngrok as a first-class tunnel mode with `codexpro ngrok --hostname <domain>` and `--tunnel ngrok`.
- Added ngrok support to the interactive `codexpro setup` public URL choices.
- Added ngrok executable/config resolution with clear setup errors for missing auth or unavailable domains.
- Documented reserved ngrok domains as a stable ChatGPT connector URL option.

## 0.17.0

- Added `codexpro setup` / `codexpro onboard` as an interactive onboarding wizard for workspace, port, mode, and public URL strategy.
- Reworked the launcher startup and ready screens into compact framed panels with status lines instead of long setup text.
- Added `npm run connect:setup` for source checkouts.
- Documented the guided onboarding path next to the one-command `codexpro start` flow.

## 0.16.0

- Reworked the widget pre-result state so in-progress tool calls show a compact running card instead of raw placeholder JSON.
- Added `codexpro stable` and `--stable` as shortcuts for Cloudflare named-tunnel mode.
- Added `codexpro stable-help` and friendlier missing-hostname guidance for fixed ChatGPT app URLs.
- Updated setup docs around stable URLs for users who cannot edit an existing ChatGPT app connector URL.

## 0.15.0

- Changed `codexpro start` to default to agent mode with workspace writes enabled.
- Added `--mode agent`, `--mode handoff`, `--mode pro`, plus shortcut flags `--agent`, `--handoff`, and `--pro-planning`.
- Reworked the terminal startup panel to copy the Server URL, hide long setup details by default, and expose details through controls.
- Updated the default suggested ChatGPT prompt so ChatGPT edits/writes/verifies directly instead of creating a handoff plan.
- Kept handoff and Pro-context workflows as explicit modes for planning-only use.

## 0.14.0

- Added cross-platform `cloudflared` bootstrap for macOS, Windows, and Linux.
- CodexPro now reuses `cloudflared` from PATH first, then `~/.codexpro/bin`, then downloads the official Cloudflare release into `~/.codexpro/bin` when needed.
- Changed `--install-cloudflared` to force a user-local reinstall instead of using Homebrew.
- Added `codexpro install-cloudflared` for stable-domain setup without starting the MCP server.
- Kept `--no-install-cloudflared` as the opt-out for locked-down or manually managed machines.
- Updated setup docs with OS-specific notes for clipboard, browser opening, and Cloudflare Tunnel.

## 0.13.0

- Added an interactive CodexPro terminal control panel after startup.
- Added Enter-to-open ChatGPT connector settings, `c` to copy URL, `p` to print app fields, `s` to print the suggested prompt, and `q` to stop.
- Quieted local MCP and Cloudflare logs by default so startup reads like a product flow.
- Made macOS/Homebrew `cloudflared` installation automatic by default when missing.
- Added `--no-install-cloudflared` to opt out of automatic installation.
- Changed the default user-facing start command to `npx codexpro@latest start`.

## 0.12.0

- Added clipboard-first `CodexPro Start` flow for ChatGPT Developer Mode.
- Public HTTPS connector URLs are copied automatically when clipboard support is available.
- Added `--open-chatgpt`, `--copy-url`, and `--no-copy-url` launcher flags.
- Added opt-in `--install-cloudflared` for macOS/Homebrew users.
- Added `npm run connect:chatgpt` for source checkouts.
- Updated README setup path around one command: `npx codexpro@latest start --open-chatgpt`.

## 0.11.0

- Renamed the package, CLI, app labels, widget metadata, and environment variables to CodexPro.
- Removed the duplicate CLI binary entry from `package.json`.
- Added `DOMAIN_SETUP.md` with Namecheap, Cloudflare, stable tunnel, and future hosted-relay guidance.
- Changed the generated model fallback bundle title to `CodexPro Context Bundle`.
- Regenerated build output and package lock metadata for the CodexPro package name.

## 0.10.0

- Prepared the project for public open-source use.
- Added npm package metadata, keywords, engine requirements, public package files, and `prepack`.
- Added `codexpro` as a package-name binary so `npx codexpro@latest ...` works.
- Added `codexpro pro-bundle` and `codexpro pro-apply` CLI subcommands.
- Added `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md`.
- Removed local runtime reports from the public package surface.
- Reworked docs to avoid private local paths and product-specific model claims.

## 0.9.0

- Added stable Cloudflare named-tunnel mode with `--tunnel cloudflare-named`.
- Added `npm run connect:stable`.
- Added support for existing tunnel names, Cloudflare dashboard tunnel tokens, token files, and cloudflared config files.
- Added stable-host health checks before printing the ChatGPT connector URL.

## 0.8.2

- Fixed duplicate `AGENTS.md` loading on case-insensitive filesystems.
- Kept `codex_context` data-only so it does not create noisy widget cards.

## 0.8.1

- Added `codex_context` for AGENTS-style instructions, `.ai-bridge` handoff files, git status, and optional git diff.

## 0.8.0

- Made widget rendering quieter by attaching visual cards only to high-signal change tools.
- Added request and tool-call logging without printing prompts, file contents, or tokens.

## 0.7.0

- Reworked the Apps SDK widget into compact developer cards.
- Kept widget CSP strict with no external fetches, fonts, scripts, images, or iframes.

## 0.6.0

- Added CSP metadata for ChatGPT Developer Mode widget rendering.
- Added `codexpro_inventory` for sanitized skill and MCP server names.

## 0.5.0

- Added Apps SDK widget resources for selected tool outputs.

## 0.4.x

- Added `export_pro_context`.
- Added terminal helpers for creating and applying planning-context bundles.
- Added `open_current_workspace` for safer first calls from ChatGPT.
