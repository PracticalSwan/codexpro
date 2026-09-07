- **Activity/evidence ledger** ? bounded per-user JSONL with workspace cursors, filters, structured IDs, and best-effort writes.
## Durable touched-file checkpoints

- `write`, `edit`, `apply_patch`, and `apply_change_set` return `chk_*` rollback points.
- `restore_checkpoint` is all-or-nothing and SHA-guarded against later user edits.
- Preimages are deduplicated and stored outside the project; whole-repository/Git rollback is intentionally not provided.

# CodexPro Full 0.32.3 — Feature Guide

CodexPro Full is PracticalSwan's independently maintained CodexPro fork. It keeps the `codexpro` CLI and MCP compatibility while adding the 0.31–0.32 agentic, continuity, safety, code-intelligence, artifact, and Durable Goal features. The release package is `codexpro-full`; installing it still provides the `codexpro` CLI.

> Repository: `https://github.com/PracticalSwan/codexpro`
> Upstream lineage: `https://github.com/rebel0789/codexpro`

Feature availability depends on the active profile. Use `server_config` and `tool_surface_diagnostics` first when you need to know what the current ChatGPT session can actually call.

## Quick start

From an installed build:

```bash
cd /path/to/your/repo
codexpro start
```

In ChatGPT:

```text
Use CodexPro. Call server_config, then open_current_workspace with include_tree=false.
Inspect the relevant files, make only the requested changes, verify them, and show the final diff.
```

For cross-session workspace targeting, keep the returned `workspace_id` and pass it explicitly. Implicit selection is intentionally MCP-session-local.

## 1. Connection, profiles, and workspaces

| Capability | Main tools / commands | How to use it |
| --- | --- | --- |
| Runtime configuration | `server_config` | Check version, modes, capability gates, limits, and sanitized runtime state. |
| Workspace open | `open_current_workspace`, `open_workspace` | Open the launch repo or another explicitly allowed root. |
| Workspace list | `list_workspaces` | See allowed/open workspace identities without reading arbitrary paths. |
| Workspace snapshot | `workspace_snapshot` | Get a bounded project summary, Git state, important files, and recent commits. |
| Multi-project profiles | `codexpro settings set --project ...` | Allow several known projects through one connector. |
| Stable saved profiles | `codexpro setup`, `codexpro settings` | Save tunnel, port, modes, capabilities, and non-secret defaults for later starts. |
| Connection test | `codexpro connection-test` | Diagnose whether ChatGPT requests reach the local MCP server without enabling mutation tools. |
| Health check | `codexpro doctor` | Check Node/build/profile/port/tunnel prerequisites before connecting. |

## 2. Capability and safety gates

CodexPro exposes tools according to the active configuration and optional `.codexpro-policy.json`.

| Gate | Typical values | Effect |
| --- | --- | --- |
| Tool mode | `minimal`, `standard`, `full` | Controls how much of the MCP toolbox is advertised. |
| MCP compatibility | SDK v2 / legacy protocol | Uses the stable split MCP v2 packages, but defaults to the 2025 protocol era; interactive `ask` and Tasks stay disabled until separately verified client capabilities exist. |
| Write mode | `off`, `handoff`, `workspace` | Controls direct workspace mutation. |
| Bash mode | `off`, `safe`, `full` | Removes Bash entirely, allows restricted verification, or permits trusted full shell use. |
| Analysis | on/off | Enables built-in repository analysis. |
| Codex sessions | `off`, `metadata`, `read` | Controls local Codex history discovery and bounded transcript reads. |
| Artifact export | on/off | Controls `export_file`. |
| Durable Goals | on/off | Controls the Goal lifecycle tools. |
| CodeGraph | on/off | Enables the optional CodeGraph provider and, when writable, explicit sync. |
| LSP | on/off | Enables an explicitly configured language-server adapter. |
| Git push | on/off | Controls whether `git_push` exists at all. No force-push interface exists. |
| Environment inheritance | on/off | Controls whether unrestricted parent environment inheritance is allowed. |

Use `effective_policy` to see how a workspace policy tightens the global/profile configuration. Workspace policy can reduce authority; it cannot widen it.

## 3. File, tree, image, and search tools

| Capability | Tools | Example |
| --- | --- | --- |
| Directory tree | `tree` | "Show `src` to depth 2." |
| Single file read | `read` | "Read `src/server.ts` around the tool-mode logic." |
| Batch reads | `read_many` | "Read `package.json`, `README.md`, and `AGENTS.md` together." |
| Text search | `search` | "Find references to `workspace_events`." |
| Batch search | `search_many` | "Search for `Goal`, `CodeGraph`, and `git_push` in one call." |
| Fuzzy file finding | `find_files` | "Find files related to workspace policy." |
| Image inspection | `view_image` | "Open the screenshot under `docs/evidence`." |
| Repository analysis | `inspect_workspace` | "Map the main source/test/config areas and important declarations." |

Search falls back to a bounded Node implementation when ripgrep is unavailable.

## 4. Context and instruction gathering

| Capability | Tools | How to use it |
| --- | --- | --- |
| Ranked task context | `gather_context` | Give a target file/symbol and ask for only the context needed to work on it. |
| Path instructions | `instructions_for_path` | Resolve the applicable `AGENTS.md` chain for a target path. |
| Skill discovery | `codexpro_inventory`, `load_skill` | Discover/load local skills only when the task needs them. |
| Project context bundle | `codex_context` | Get bounded project instructions, handoff state, and Git context. |
| Pro context export | `export_pro_context` | Create a durable context bundle for a model/chat surface that cannot call MCP tools. |

## 5. Safe file mutation

Direct source mutation requires `writeMode=workspace`.

| Capability | Tools | Safety behavior |
| --- | --- | --- |
| Write file | `write` | Workspace-contained writes with optional expected SHA-256 and durable operation receipt. |
| Exact edit | `edit` | Exact replacement with the same path/secret/stale-write guards. |
| Patch | `apply_patch` | Guarded unified-diff application scoped to the selected workspace. |
| Attachment import | `import_file` | Imports ChatGPT Apps SDK file references from approved HTTPS hosts only. |

Sensitive paths such as `.git`, `.env*`, private keys, dependency directories, and configured blocked globs remain protected.


## 6. Durable operations and transactional changes

State-changing tools can return durable `op_*` receipts and accept idempotency keys.

| Capability | Tools | How to use it |
| --- | --- | --- |
| Recover operation state | `operation_status` | Query an `op_*` after a lost/uncertain MCP response. |
| Prepare transaction | `prepare_change_set` | Build a SHA-guarded multi-file change set. |
| Apply transaction | `apply_change_set` | Apply the prepared set only if preconditions still match. |
| Safe revert | `revert_operation` | Revert a supported operation while its in-memory preimages remain available. |

This is useful when a ChatGPT request may be retried or when several files must change as one guarded unit.

## 7. Bash, long-running processes, and verification

| Capability | Tools | How to use it |
| --- | --- | --- |
| One-shot shell | `bash` | Run a focused build/test/inspection command allowed by the active Bash mode. |
| Start process | `start_workspace_process` | Start a workspace-owned long-running command and keep the returned `proc_*`. |
| Process state | `workspace_process_status` | Check the same `proc_*` on a later MCP call. |
| Incremental output | `read_workspace_process_output` | Read bounded output with a cursor; later reads continue instead of replaying everything. |
| Stop process | `stop_workspace_process` | Stop the workspace-owned process deterministically. |
| Discover/run checks | `run_checks` | Run trusted project scripts/checks and receive structured test results. |
| Change-aware verification | `verify_changes` | Select checks from changed paths and return bounded deterministic repair evidence for pass/fail/not-run outcomes. |

`proc_*` handles are process-runtime state, so they survive separate ChatGPT HTTP/MCP calls while the CodexPro runtime remains alive.

Optional Docker execution is selected only with `CODEXPRO_EXECUTION_BACKEND=docker` plus an already-local `CODEXPRO_DOCKER_IMAGE`. Host remains the default. Docker mode keeps existing Bash authorization and PathGuard checks, mounts only the selected workspace at `/workspace`, disables networking, bounds memory/CPU/PIDs, passes no inherited host environment into the container, and never installs Docker or pulls/builds/logs into a registry. Explicit Docker selection fails closed when the daemon or configured local image is unavailable; it does not fall back to host execution.

Current support status: Stage A (one-shot Bash and workspace processes) is live-verified on Windows Docker Desktop. Durable Goal tasks remain host-only because the detached-worktree compatibility probe cannot provide required Git metadata without mounting repository state outside the selected worktree. Linux host support is not advertised until a real Linux-host live validation is completed.

## 8. Workspace continuity

| Capability | Tools | How to use it |
| --- | --- | --- |
| Workspace event cursor | `workspace_events` | Take an `evt_*` baseline, then request later create/edit/delete/rename deltas. |
| Task checkpoint | `save_task_snapshot` | Store bounded task facts, inspected files, decisions, verification, and remaining work. |
| Task restore | `load_task_snapshot` | Load the saved checkpoint in a later call/session. |

Allowed hidden workspace paths participate in event snapshots; blocked paths still remain excluded.

## 9. Git and repository intelligence

Read-only Git tools are available in full mode; write tools also require workspace write mode.

| Capability | Tools | How to use it |
| --- | --- | --- |
| Current state | `git_status`, `git_diff`, `show_changes` | Inspect changes and review final diffs. |
| History | `git_history`, `git_show` | Read bounded commit history and revision content. |
| Blame | `git_blame` | Request a bounded line range, e.g. `max_lines=5`. |
| Package graph | `package_graph` | Detect package boundaries and dependency edges. |
| Change impact | `change_impact` | Find likely affected code/tests for selected changes. |
| Preflight | `preflight_changes` | Scan intended changes for safety/release issues. |
| Explicit staging | `git_stage` | Stage only named paths. |
| Guarded commit | `git_commit` | Commit only when expected branch/HEAD/staged-set guards match. |
| Optional push | `git_push` | Appears only when `allowGitPush=true`; there is no force-push path. |

For a practical Full Access profile with `allowGitPush=false`, `git_push` is intentionally absent.

## 10. Code intelligence

CodexPro always has built-in lexical/repository analysis. Optional providers add deeper structure.

| Capability | Tools / provider | How to use it |
| --- | --- | --- |
| Built-in analysis | `inspect_workspace`, `search`, `find_files`, `gather_context` | Works without an external index. |
| Provider status | `code_intelligence_status` | Check CodeGraph/LSP availability and freshness. |
| CodeGraph queries | routed through `search`/context tools | Ask for a symbol/structural query when CodeGraph is enabled. |
| CodeGraph sync | `codegraph_sync` | Run only when the index is stale and explicit sync is appropriate. |
| LSP adapter | optional | Available only when explicitly configured and enabled. |

CodexPro 0.32.3 supports CodeGraph 1.6.x, including Windows npm-shim execution without generic shell interpolation.

## 11. Codex session navigation

When `codexSessions=read`:

| Capability | Tools | How to use it |
| --- | --- | --- |
| List sessions | `codex_sessions` | Find local Codex sessions relevant to a workspace. |
| Read bounded session | `read_codex_session` | Read a bounded portion of a selected local JSONL session. |
| Search session | `search_codex_session` | Search a large transcript and receive stable byte anchors. |
| Read around anchor | `read_codex_session_around` | Retrieve a small context window around a search match. |

These are read-only history tools. They do not attach to or control a live Codex conversation.

## 12. Archive, document, and artifact I/O

| Capability | Tools | How to use it |
| --- | --- | --- |
| Archive inspection | `inspect_archive` | List bounded ZIP metadata without extraction. |
| Transactional extraction | `extract_archive` | Extract a safe archive into a new contained destination. |
| Traversal protection | archive tools | `../` / absolute escape entries are rejected. |
| Document inspection | `read_document` | Extract bounded text/metadata from PDF and OOXML documents without executing Office. |
| Artifact export | `export_file` | Export a workspace file as an opaque `codexpro-export://...` embedded resource. |

Artifact export intentionally avoids making a raw local path the user-facing resource identity.

## 13. Durable Goals

Durable Goals are the highest-level 0.32 orchestration feature. They require Goals enabled, workspace writes, Bash, Git, and supported local Goal storage.

Lifecycle:

```text
propose_goal
→ approve_goal
-> start_goal
-> awaiting_review
→ review_goal
-> awaiting_projection
-> project_goal
```

Management tools:

```text
goal_status
list_goals
pause_goal
resume_goal
cancel_goal
```

Key properties:

- bounded DAG dependency scheduling
- detached Git-worktree execution
- Goal state that survives the initiating MCP connection
- exact proposal/review fingerprints
- explicit projection authorization with `authorize=true`
- source HEAD/state guards before projection
- no automatic commit
- no automatic push
- no automatic merge, deploy, publish, or upload

Use Goals for multi-step local tasks that need durable execution and an explicit human/agent review boundary before changes reach the source workspace.

## 14. Handoff and local executor workflows

Handoff mode is for planning when ChatGPT should not directly edit source.

| Capability | Tools / CLI | How to use it |
| --- | --- | --- |
| Read handoff | `read_handoff` | Read `.ai-bridge/current-plan.md` and related bounded state. |
| Wait for handoff | `wait_for_handoff` | Wait for a handoff/status update. |
| Write agent handoff | `handoff_to_agent`, `handoff_to_codex` | Save a bounded plan/status handoff without remotely executing the local agent. |
| Execute locally | `codexpro execute-handoff` | User-started terminal execution of the saved plan. |
| Watch locally | `codexpro watch-handoff` | User-started watcher for new handoff plan hashes. |
| Bounded loop | `codexpro loop-handoff` | User-started execute/review loop with explicit commands and iteration limits. |

The executor/watch/loop commands remain local CLI features; they are not exposed as unrestricted remote MCP execution.

## 15. Diagnostics, telemetry, and self-test

| Capability | Tools | How to use it |
| --- | --- | --- |
| Connection diagnostics | `connection_diagnostics` | Check MCP/HTTP health and bounded failure counters. |
| Tool-surface diagnostics | `tool_surface_diagnostics` | Compare expected vs registered tools for the current gates. |
| Local telemetry | `local_telemetry` | Inspect bounded tool timing/count/error metadata without prompts/source contents. |
| Self-test | `codexpro_self_test` | Run read-only runtime/security/toolchain checks; optional write probe is separate. |
| Authenticated local control page | local browser UI | Inspect status and save non-secret next-run profile settings. Tokens stay hidden. |

## 16. ChatGPT cards and UI

Custom tool cards are optional:

```bash
CODEXPRO_TOOL_CARDS=1 codexpro start
```

They provide compact UI for selected high-signal results while raw reads/searches stay in normal chat output.

## 17. Tunnels and remote connection options

CodexPro's primary ChatGPT transport is OpenAI Secure MCP Tunnel. The launcher supervises the official `tunnel-client`, keeps the local MCP server on loopback with CodexPro bearer authentication intact, injects that bearer value through an environment reference rather than argv, and requires tunnel-client `/readyz` before reporting ready.

```text
OpenAI Secure MCP Tunnel (default for new/no-profile start)
ngrok stable dev domain (HTTP fallback)
Cloudflare quick tunnel (HTTP fallback)
Cloudflare named tunnel (HTTP fallback)
Tailscale Funnel (HTTP fallback)
local-only HTTP
```

Common commands:

```bash
codexpro start
codexpro openai --openai-tunnel-id tunnel_0123456789abcdef0123456789abcdef
codexpro ngrok --hostname your-name.ngrok-free.dev
codexpro start --tunnel cloudflare
codexpro stable --hostname codexpro.example.com --tunnel-name codexpro
codexpro tailscale --hostname your-device.your-tailnet.ts.net
codexpro start --tunnel none
```

The OpenAI runtime key is read from `CONTROL_PLANE_API_KEY` (or the official client's `OPENAI_API_KEY` fallback) and is never persisted by CodexPro. Public/non-loopback HTTP fallback use should keep CodexPro authentication enabled.

## 18. Practical Full Access profile

A strong local trusted-repo profile typically uses:

```text
mode = agent
toolMode = full
writeMode = workspace
bashMode = full
analysisEnabled = true
codexSessions = read
artifactExportEnabled = true
goalsEnabled = true
codeGraphEnabled = true
lspEnabled = false unless configured
allowGitPush = false
inheritEnv = false
authentication = enabled
```

This exposes the broad toolbox while keeping remote Git publication and unrestricted environment inheritance disabled.

## 19. What CodexPro Full does not do

CodexPro Full is still a local developer bridge. It does not:

- provide or proxy models
- bypass ChatGPT/Codex/OpenAI limits
- pool accounts
- act as an OS sandbox
- silently widen workspace access
- force-push
- auto-commit/push/merge Goal results
- expose authentication tokens through normal diagnostics
- treat local Codex history as hidden ChatGPT memory

## Feature discovery rule

The definitive live answer is always the running server, not a static document:

```text
server_config
→ tool_surface_diagnostics
→ effective_policy
```

Those three calls tell you the actual version, enabled gates, registered tools, and workspace-specific restrictions for the current session.

## Context Selection v2

`gather_context` supports task, symbol, and change strategies under a hard byte ceiling with bounded scores/reasons, advisory token estimates, and per-workspace runtime caching. `prepare_subtask_context` returns the same evidence as data only and never launches a model or process.
