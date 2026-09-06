<p align="center">
  <img src="docs/favicon.svg" width="72" height="72" alt="CodexPro Full logo">
</p>

<h1 align="center">CodexPro Full</h1>

<p align="center">
  PracticalSwan's independently maintained CodexPro fork for full local ChatGPT coding workflows.
</p>

<p align="center">
  <a href="https://github.com/PracticalSwan/codexpro/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/PracticalSwan/codexpro/ci.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/PracticalSwan/codexpro/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/PracticalSwan/codexpro?style=flat-square"></a>
  <img alt="CodexPro Full" src="https://img.shields.io/badge/CodexPro%20Full-0.32.3-2563eb?style=flat-square">
</p>

## Project status

**CodexPro Full** is the `PracticalSwan/codexpro` fork. It keeps the upstream `codexpro` CLI, MCP protocol, profile format, and workspace model for compatibility, while maintaining a separate feature line with the 0.31-0.32 safety, continuity, code-intelligence, artifact, Git, and Durable Goal work.

```text
Canonical fork: https://github.com/PracticalSwan/codexpro
Upstream:       https://github.com/rebel0789/codexpro
Current fork:   0.32.3
```

CodexPro Full uses the independent distribution package **`codexpro-full`** while preserving the installed CLI command **`codexpro`**, MCP protocol, profiles, and workspace model. **GitHub Releases are the canonical public release channel.** The upstream npm package `codexpro` is a different distribution; the `codexpro-full` npm registry package is not published yet.

## What it is

CodexPro Full is a local MCP server that connects a compatible ChatGPT Plugins session to projects you explicitly allow on your own machine.

Depending on the active profile, ChatGPT can:

- inspect, search, read, and understand a repository
- write/edit/patch files with path and stale-write guards
- use durable operation receipts, idempotency, transactions, and safe revert
- run trusted checks and own bounded long-running workspace processes
- keep event cursors and durable task checkpoints across MCP calls
- inspect Git history, blame, package relationships, change impact, and preflight state
- stage explicit paths and create guarded commits
- use built-in analysis plus optional CodeGraph/LSP providers
- browse local Codex session history in bounded read-only mode
- inspect safe ZIP/PDF/OOXML content and export workspace artifacts back to ChatGPT
- execute opt-in Durable Goals in detached Git worktrees with review/projection authorization
- use planning-only handoff workflows when direct source editing is not desired

See **[FEATURES.md](FEATURES.md)** for the complete feature map and short usage examples.

CodexPro Full is not a hosted SaaS service, model proxy, quota bypass, account pool, OS sandbox, or unrestricted remote shell.

## Install this fork

### From the GitHub Release

```bash
npm install -g https://github.com/PracticalSwan/codexpro/releases/download/v0.32.3/codexpro-full-0.32.3.tgz
codexpro --version
```

### From a source checkout

```bash
git clone https://github.com/PracticalSwan/codexpro.git
cd codexpro
git checkout main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.32.3.tgz
codexpro --version
```

Expected version for this branch:

```text
0.32.3
```

If you already have a verified fork tarball, install that tarball directly instead of rebuilding it.

### Runtime requirements

- Node.js 20+
- a ChatGPT surface that can connect to custom MCP plugins
- the official OpenAI `tunnel-client` plus an OpenAI Platform tunnel/runtime key for the default ChatGPT path; public HTTPS is only needed for HTTP fallback modes
- Git for Git/Goal features
- optional CodeGraph 1.6.x or LSP only when those providers are enabled

## Connect in ChatGPT

1. Start CodexPro from the target repository:

   ```bash
   cd /path/to/your/repo
   codexpro start
   ```

2. One time, create an OpenAI Secure MCP Tunnel for the same ChatGPT workspace and provide its `tunnel_...` ID to CodexPro. Run `codexpro openai-key save` once to store the restricted runtime key in CodexPro's protected per-user secret file, or keep using `CONTROL_PLANE_API_KEY` for session-only credentials.
3. In ChatGPT, enable Developer mode and keep CSP enforcement enabled. Open Settings -> Connectors, choose **Connection: Tunnel**, and select or paste the same Tunnel ID.
4. Keep CodexPro and the official `tunnel-client` running while you use the connector. The local MCP endpoint stays loopback-only and bearer protected.
5. In chat, start with:

   ```text
   Use CodexPro. Call server_config, then open_current_workspace with include_tree=false.
   ```

For a workspace opened with `open_workspace`, keep its returned `workspace_id`. Implicit workspace selection is intentionally MCP-session-local, so pass `workspace_id` explicitly after ChatGPT/HTTP MCP session turnover.

## Recommended practical Full Access profile

For trusted local repositories, the validated 0.32.3 profile is:

```text
Mode: agent
Tool mode: full
Write mode: workspace
Bash mode: full
Bash transcript: compact
Analysis: enabled
Codex sessions: read
Artifact export: enabled
Durable Goals: enabled
CodeGraph: enabled
LSP: disabled unless configured
Git push: disabled
Environment inheritance: disabled
Authentication: enabled
```

With `allowGitPush=false`, `git_push` is not exposed. There is no force-push interface.

Persist the capability portion of this profile with:

```bash
codexpro settings set --analysis on --artifact-export on --goals on --codegraph on --lsp off --allow-git-push off --inherit-env off
```

`codexpro settings show` reports the effective capability state, and later unrelated `settings set` changes preserve these flags.

Use a narrower profile for untrusted repositories.

## Daily workflow

A strong default ChatGPT workflow is:

```text
1. server_config
2. open_current_workspace
3. instructions_for_path / gather_context as needed
4. read/search/inspect
5. write/edit/apply_patch
6. run_checks or verify_changes
7. show_changes
8. git_stage/git_commit only when explicitly requested
```

For long-running commands, use `start_workspace_process` and keep the returned `proc_*` handle for later status/output/stop calls.

For change monitoring, take a `workspace_events` baseline and keep the returned `evt_*` cursor.

For multi-step durable execution, use the Goal lifecycle:

```text
propose_goal
-> approve_goal
-> start_goal
-> review_goal
-> project_goal
```

Goal execution never automatically commits, pushes, merges, deploys, publishes, or uploads.

## Core CLI

```bash
codexpro setup
codexpro start
codexpro doctor
codexpro connection-test
codexpro settings
codexpro inspect
codexpro review
```

Useful modes:

```bash
codexpro start --no-bash
codexpro start --tool-mode minimal
codexpro start --tool-mode standard
codexpro start --tool-mode full
codexpro start --mode handoff
codexpro start --mode pro
codexpro start --headless
```

Optional cards:

```bash
CODEXPRO_TOOL_CARDS=1 codexpro start
```

## Multiple projects

Save additional explicitly allowed projects:

```bash
codexpro settings set --project ~/code/web --project ~/code/api
codexpro settings show
codexpro start
```

Use `open_workspace` for another allowed root and keep the returned `workspace_id` for cross-session calls.

For hard isolation, run separate CodexPro processes on separate ports/hostnames.

## Connection options

The primary ChatGPT path is OpenAI Secure MCP Tunnel:

```bash
# after one-time Platform tunnel/key setup
codexpro openai-key save   # one-time masked prompt; stores a protected per-user secret file
codexpro settings set --tunnel openai --openai-tunnel-id tunnel_0123456789abcdef0123456789abcdef
codexpro start
```

Do not paste the runtime API key into chat, commit it, or save it in a workspace profile. `codexpro openai-key save` stores it only in a protected per-user secret file; `CONTROL_PLANE_API_KEY` remains the session-only override. `CONTROL_PLANE_TUNNEL_ID` and `TUNNEL_CLIENT_BIN` are optional environment alternatives for the non-secret tunnel ID/client path.

HTTP fallbacks remain available:

```bash
codexpro ngrok --hostname your.ngrok-free.dev
codexpro start --tunnel cloudflare
codexpro stable --hostname codexpro.example.com --tunnel-name codexpro
codexpro tailscale --hostname your-device.your-tailnet.ts.net
codexpro start --tunnel none
```

When an existing saved ngrok profile is migrated to OpenAI mode, CodexPro retains its ngrok hostname/config as fallback metadata so `codexpro ngrok` can reuse it. Public/non-loopback HTTP endpoints should keep CodexPro authentication enabled. Prefer `Authorization: Bearer <token>` when the MCP client supports headers. Query-string tokens are a personal compatibility fallback and must not be shared.

## Workspace policy

A workspace may add `.codexpro-policy.json` to tighten the active profile. It can reduce modes, disable optional capabilities, add blocked globs, and lower resource ceilings. It cannot widen global authority.

See [docs/workspace-policy.md](docs/workspace-policy.md).

## Trusted project hooks

Trusted repositories may define `.codexpro-hooks.json` lifecycle hooks. Hook files never execute merely because they exist: trust is stored outside the repository and binds the canonical workspace plus exact hook-file SHA-256. Inspect or trust the current fingerprint locally with `codexpro trust status` / `codexpro trust hooks`; MCP exposes read-only `project_trust_status`. See [docs/hooks.md](docs/hooks.md).

## Durable checkpoints

CodexPro file mutations (`write`, `edit`, `apply_patch`, and `apply_change_set`) now return a bounded `chk_*` checkpoint. `restore_checkpoint` restores only those touched files and refuses to overwrite later edits. Checkpoint preimages live outside the workspace. See [docs/checkpoints.md](docs/checkpoints.md).

## Durable operations

State-changing tools can use idempotency keys and return durable `op_*` receipts. Query them with `operation_status`.

Full workspace-write mode also supports:

```text
prepare_change_set
apply_change_set
revert_operation
```

These provide SHA-guarded multi-file transactions and supported safe reverts.

## Processes and verification

Use:

```text
start_workspace_process
workspace_process_status
read_workspace_process_output
stop_workspace_process
run_checks
verify_changes
```

Process handles and event cursors survive separate ChatGPT HTTP/MCP calls while the same CodexPro runtime remains alive.

## Code intelligence

Built-in search/analysis always remains available.

Optional providers:

- **CodeGraph**: CodexPro 0.32.3 supports the CodeGraph 1.6.x CLI contract and explicit `codegraph_sync`.
- **LSP**: only when separately configured/enabled.

Use `code_intelligence_status` before relying on an optional provider. Do not sync CodeGraph unnecessarily when the index is already current.

## Git safety

Full mode includes bounded history/show/blame, package graph, change impact, preflight, explicit staging, and guarded commit.

A guarded commit can require the expected:

```text
branch
HEAD
staged path set
```

`git_push` only exists when explicitly enabled. No force-push interface exists.

## Archive, document, and export tools

CodexPro Full can:

- inspect safe ZIP archives without extracting
- reject traversal/absolute archive entries
- extract transactionally into contained destinations
- read bounded PDF and OOXML text/metadata without executing Office
- export a workspace file through an opaque `codexpro-export://...` resource identity

## Durable Goals

Durable Goals are opt-in and documented in [docs/goals.md](docs/goals.md).

They provide:

- persisted Goal/task state
- dependency-aware DAG scheduling
- detached Git-worktree execution
- pause/resume/cancel
- exact approval and review fingerprints
- explicit source projection authorization
- cross-call durability and recovery

Projection is deliberately separate from execution and review.

## Codex session navigation

With `codexSessions=read`, ChatGPT can use bounded local history tools:

```text
codex_sessions
read_codex_session
search_codex_session
read_codex_session_around
```

These do not attach to or control a live Codex app conversation.

## Handoff workflows

When ChatGPT should plan but not directly edit source, use handoff mode. CodexPro stores bounded planning/status artifacts under `.ai-bridge`.

Local terminal-only helpers include:

```bash
codexpro execute-handoff
codexpro watch-handoff
codexpro loop-handoff
```

They are not unrestricted remote MCP executors.

## Diagnostics

Use:

```text
connection_diagnostics
tool_surface_diagnostics
local_telemetry
codexpro_self_test
effective_policy
```

Diagnostics are designed to expose bounded health/configuration metadata without prompts, source-file contents, raw command transcripts, or authentication tokens.

The authenticated local control page can save non-secret next-run profile settings. Authentication tokens remain hidden.

## Safety defaults

- public/non-loopback HTTP requires authentication unless explicitly overridden
- writes are contained to allowed workspace roots
- `.env*`, `.git`, private keys, dependency/build/cache areas, symlink escapes, and configured blocked paths are protected
- workspace policy can only tighten authority
- safe Bash is available for reduced shell risk; `--no-bash` removes shell tools
- Goal workers receive reduced authority and stop at review/projection boundaries
- Git push is separately gated
- environment inheritance is separately gated
- telemetry is bounded and sanitized

Read [SECURITY.md](SECURITY.md) before exposing any public HTTP fallback tunnel or supplying tunnel credentials.

## Development

```bash
npm install
npm run build
npm run smoke
npm run stress
npm audit --audit-level=high
npm run release:pack
git diff --check
```

Run stress only when concurrency/process/output-limit/release-risk changes justify it.

## Repository and upstream lineage

Primary fork:

```text
https://github.com/PracticalSwan/codexpro
```

Upstream project:

```text
https://github.com/rebel0789/codexpro
```

This fork preserves upstream attribution and MIT licensing while maintaining its own feature/documentation line.

## Documentation

- [Website](https://practicalswan.github.io/codexpro/)
- [Feature guide](FEATURES.md)
- [FAQ](FAQ.md)
- [Security](SECURITY.md)
- [Workspace policy](docs/workspace-policy.md)
- [Trusted project hooks](docs/hooks.md)
- [Durable Goals](docs/goals.md)
- [Stable URL guide](DOMAIN_SETUP.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Contributors](CONTRIBUTORS.md)
