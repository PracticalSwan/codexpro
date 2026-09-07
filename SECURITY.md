Activity logs exclude prompts, raw stdout/stderr, authentication values, full environment data, and absolute paths; write failures never change the underlying operation result.

# Security Policy - CodexPro Full

This document applies to the `PracticalSwan/codexpro` fork. Upstream lineage remains `rebel0789/codexpro`; report fork-specific findings against the PracticalSwan repository.

CodexPro exposes a local workspace to an MCP client. Treat it like a developer tool with access to your source tree, not like a hosted SaaS app.

## Supported Version

Security fixes target the latest published version only until the project reaches `1.0.0`.

Feature-specific notes follow GitHub `main`; npm users should check the published version before relying on a new command.

## Reporting

Please report security issues privately before opening a public issue. If the repository has GitHub private vulnerability reporting enabled, use that. Otherwise contact the maintainer listed by the project owner.

Do not include secrets, private repository contents, tunnel tokens, or `.env` values in reports.

## Terms Boundary

CodexPro is not designed to bypass, avoid, pool, resell, or modify ChatGPT, Codex, OpenAI, or third-party model limits. Do not market, deploy, or configure it that way.

Each user should connect their own ChatGPT account, use only product surfaces available to that account, and follow the limits, safety rules, and terms for ChatGPT, Codex, OpenAI, and any third-party model provider they connect.

## Threat Model

CodexPro can expose:

- file metadata and selected file contents from allowed workspaces
- git status and diffs
- `.ai-bridge` planning files
- optional shell command execution through the `bash` tool, hidden when bash mode is off
- optional write/edit/apply_patch/import_file capability depending on `CODEXPRO_WRITE_MODE`, advertised only in workspace write mode
- optional ChatGPT attachment import through `import_file`, which downloads only platform-provided HTTPS file references from approved origins and never accepts arbitrary model-supplied URLs
- optional local handoff execution through `codexpro execute-handoff`, run from the user's terminal only
- optional local execute/review looping through `codexpro loop-handoff`, run from the user's terminal only with a user-provided reviewer command and iteration limit
- durable operation receipts, idempotent mutations, transactional change sets, and in-memory safe-revert preimages
- workspace-owned long-running processes plus trusted checks and change-aware verification
- optional guarded Git stage/commit and separately gated Git push; no force-push interface exists
- optional CodeGraph/LSP code-intelligence adapters
- bounded archive/document inspection/extraction and opaque artifact export
- opt-in Durable Goals with detached Git worktrees, exact approval/review fingerprints, and explicit projection authorization

## Failure Model

Review changes against these failure modes before release:

| Failure mode | Expected control |
| --- | --- |
| Tunnel path reaches local MCP without intended auth | OpenAI mode keeps MCP loopback-bound and bearer protected; the official tunnel-client injects the bearer from an environment reference. Public/non-loopback HTTP fallbacks fail closed unless a CodexPro token is configured. |
| Raw CodexPro, OpenAI runtime, or Cloudflare token appears in UI, argv, logs, docs, profile, or package output | CodexPro tokens are redacted, OpenAI runtime keys stay out of workspace profiles and may be supplied by environment or a protected per-user secret file, tunnel-client receives only a secret reference, and Cloudflare tunnel tokens use local files for persistence. |
| ChatGPT can edit outside the intended repo | Allowed roots are explicit; path resolution rejects escapes, blocked globs, and symlink traversal. |
| ChatGPT can run arbitrary shell by default | Bash defaults to safe mode, can be disabled, and full mode is a trusted-local-only choice. Safe mode can still run repo package scripts, so use `--no-bash` for untrusted repos. |
| Handoff mode still exposes generic writes | Handoff/pro modes do not advertise generic `write`/`edit`/`apply_patch`; bounded handoff tools write `.ai-bridge` files only. |
| Local Codex history is treated as ChatGPT memory | Codex session access is opt-in metadata/read mode and never attaches to a live Codex app session. |
| Browser admin mutates live runtime unexpectedly | Admin profile changes apply on restart; active runtime policy stays stable for the current session. |
| Repeated public token guesses consume unlimited attempts | HTTP authentication rejects tokens shorter than 24 bytes and rate-limits failed attempts per client address. |
| URL-token credentials persist in browser history or referrers | Browser onboarding removes token parameters from the visible URL after capture and sends no-store/no-referrer response headers. Prefer an Authorization header when the MCP client supports one. |
| Timed-out or runaway-output bash commands leave descendant processes running | POSIX commands run in a dedicated process group and Windows termination uses taskkill /t; timeout and the separate observed-output safety ceiling terminate the process tree. The smaller retained-output limit only truncates the returned transcript and does not kill a healthy command. |
| Automatic `cloudflared` install trusts a mutable download | The installer uses a pinned release URL and verifies the platform asset SHA-256 before writing or extracting it. |
| Remote MCP tool runs Codex/OpenCode/Pi directly | Agent execution remains a user-started CLI/watch process on the local machine. |
| Autonomous loop drives ChatGPT Web or bypasses approvals | `loop-handoff` only runs local terminal commands over `.ai-bridge` files; it does not resume browser sessions, approve prompts, or expose a remote MCP executor. |
| Optional Git write path stages/pushes more than intended | Staging is explicit-path; guarded commit checks expected branch/HEAD/staged set; `git_push` is hidden unless separately enabled, and no force-push interface exists. |
| Durable Goal changes source before review | Goal execution runs in detached worktrees and stops at review/projection boundaries; source projection requires exact fingerprints plus explicit authorization. |
| Installing MCP SDK v2 silently enables interactive authority | Runtime capability reporting remains `protocolEra=2025`, `supportsInputRequired=false`, and `supportsTaskExtension=false`; unsupported workspace-policy `ask` rules are rejected rather than auto-allowed. |
| Docker execution exposes host credentials, networking, or unrelated filesystem state | Docker mode is opt-in, local-image-only, uses one selected-workspace bind mount, `--network none`, bounded resources, a fixed non-secret container environment, option-safe image validation, and ownership-checked cleanup. No Docker socket, host home, credentials, arbitrary mounts, auto-pull/build/login, or explicit-Docker-to-host fallback is provided. |
| Hidden workspace events expose blocked paths | Allowed hidden workspace paths may generate events, but PathGuard continues to exclude blocked paths such as `.git`, `.env*`, and private-key locations. |
| Reviewer masks a failed external command | `loop-handoff` requires explicit reviewer verdict assignments and rejects reviewer `PASS` after failed executor, test, or reviewer commands unless the user opts into the supported executor/test override behavior. |

The main risks are:

- connecting an untrusted MCP client
- weakening local bearer authentication or exposing an HTTP fallback without auth
- running with `CODEXPRO_BASH_MODE=full`
- running with `CODEXPRO_WRITE_MODE=workspace` on an important repo
- executing an untrusted `.ai-bridge/current-plan.md` or custom `execute-handoff --command`
- running `loop-handoff` with an untrusted reviewer command or without a small `--max-iters`
- adding overly broad allowed roots
- leaking a `codexpro_token`, OpenAI runtime API key, or Cloudflare tunnel token
- trusting a downloaded `cloudflared` binary without understanding where it came from

- Durable checkpoints store only touched-file preimages outside the workspace and restore only when every current postimage hash still matches; they never use Git reset/checkout or overwrite later user edits.

## Safer Defaults

Default daily mode after one-time OpenAI Platform tunnel setup:

```bash
# Run `codexpro openai-key save` once, or set CONTROL_PLANE_API_KEY for a session-only credential.
codexpro start \
  --root /path/to/repo \
  --bash safe
```

Safer planning-only mode:

```bash
codexpro start \
  --root /path/to/repo \
  --mode handoff \
  --bash safe
```

OpenAI mode keeps the MCP server on loopback, keeps CodexPro bearer authentication enabled, and passes that bearer to the official tunnel-client through an environment reference. The non-secret `tunnel_...` ID and client path may be saved in the workspace profile. A persisted OpenAI runtime API key is stored only in the protected per-user secret file and is passed to tunnel-client by `file:` reference. Persistent runtime keys live only in `~/.codexpro/secrets/openai-runtime-key` with restrictive local permissions.

For stable public hostnames, keep the CodexPro auth token stable but private:

```bash
mkdir -p ~/.codexpro
openssl rand -hex 32 > ~/.codexpro/http-token
chmod 600 ~/.codexpro/http-token

codexpro start \
  --root /path/to/repo \
  --tunnel cloudflare-named \
  --hostname codexpro.example.com \
  --tunnel-name codexpro \
  --token-file ~/.codexpro/http-token \
  --bash safe
```

## Hard Rules

- Do not disable CodexPro bearer authentication for OpenAI Secure MCP Tunnel or public HTTP fallback modes.
- Public tunnel mode and non-loopback binds fail closed if `CODEXPRO_HTTP_TOKEN` is missing.
- HTTP tokens shorter than 24 bytes are rejected. Use a generated random token, not a memorable password.
- Do not commit printed connector URLs that include `codexpro_token`.
- Production integrations must use OAuth or `Authorization: Bearer <token>`. Query-string tokens are a personal connector compatibility mode, not a shared or multi-user production authentication design.
- Do not commit or save OpenAI runtime API keys in CodexPro profiles. Use `codexpro openai-key save` for protected local persistence, or a restricted `CONTROL_PLANE_API_KEY` for session-only use; grant only the tunnel permissions required by the official client.
- Do not put the OpenAI runtime API key on the `codexpro` command line or paste it into chat.
- Do not commit Cloudflare tunnel tokens.
- Do not paste raw Cloudflare tunnel tokens into browser pages or screenshots. Use `--cloudflare-token-file` or the local page's Cloudflare token file field instead.
- Use `--mode handoff` for planning workflows where ChatGPT should not edit source files. Handoff mode does not advertise generic `write`/`edit` tools.
- Preview local handoff execution with `codexpro execute-handoff --dry-run` before running an unfamiliar adapter or custom command.
- Preview autonomous local loops with `codexpro loop-handoff --dry-run`, keep `--max-iters` small, and prefer `--require-human-confirmation` until you trust the reviewer command.
- Keep `execute-handoff` local. Do not wrap it in a remote MCP tool unless you add a stronger approval and sandbox story.
- Keep `loop-handoff` local. Do not use it to automate ChatGPT Web, Codex approvals, account access, third-party Pro sites, quota limits, or product safety prompts.
- Use default agent mode only with trusted ChatGPT sessions and repo-specific roots.
- Use `--no-bash` when ChatGPT should never trigger shell commands in the workspace.
- Use `--bash-session <id> --require-bash-session` when bash should be enabled only for calls that explicitly target this local CodexPro terminal label.
- Keep Codex session history access off unless needed. `--codex-sessions metadata` only lists local Codex JSONL metadata; `--codex-sessions read` allows bounded transcript reads.
- Keep `CODEXPRO_CONTEXT_DIR` as a workspace-relative hidden directory such as `.ai-bridge`; CodexPro rejects source, build, dependency, credential, and absolute context directories.
- Use `--bash full` only for trusted local repos.
- Keep `allowGitPush=false` unless remote publication is explicitly required. No force-push interface is provided.
- Treat Durable Goal approval, review, and projection fingerprints as authorization boundaries; do not bypass them.
- Do not enable unrestricted environment inheritance unless a trusted workflow explicitly requires it.
- Do not treat MCP session ids or bash session labels as Codex conversation ids. CodexPro does not execute inside a Codex app session.
- Prefer a repo-specific `--root` instead of `--allow-home`.
- Use `--no-install-cloudflared --cloudflared <path>` if your organization requires a managed Cloudflare Tunnel binary.

## Cloudflare Binary Install

For the one-command public tunnel flow, CodexPro can download the official Cloudflare `cloudflared` release into `~/.codexpro/bin` on supported macOS, Windows, and Linux systems. It does not install a system service, does not use sudo/admin rights, and does not modify shell startup files.

Resolution order:

```text
1. explicit --cloudflared path or CLOUDFLARED_BIN
2. cloudflared already available in PATH
3. ~/.codexpro/bin/cloudflared or cloudflared.exe
4. download the pinned official Cloudflare release unless --no-install-cloudflared is set
```

CodexPro currently pins `cloudflared` `2026.7.2` and verifies the selected asset
against its published SHA-256 before writing or extracting it. Updating the
version requires updating every supported platform digest in
`scripts/cloudflared-release.mjs` and passing `npm run test:settings`.

Use `--install-cloudflared` to reinstall the verified pinned binary. Use
`--no-install-cloudflared` to disable downloads.

## Built-In Guards

CodexPro blocks common sensitive paths by default:

- `.env` and `.env.*`
- `.git` internals
- `node_modules`
- common private key names
- build/cache folders such as `dist`, `build`, `.next`, `coverage`, `.cache`
- symlinks that resolve outside the workspace or into blocked paths

These guards reduce risk. They are not an OS sandbox.
- Workspace policy v2 may add ordered per-tool/resource allow/deny rules. These rules are tightening-only: global/profile capability gates run first, multi-resource mutations fail when any target is denied, and the supertool cannot bypass the same decision.
- Project hook files are inert until their canonical workspace path and exact hook-file SHA-256 are trusted with the local CLI. Trust mutation is not exposed through MCP; hook commands use argv execution, sanitized environment, bounded stdin/output/time, and cannot override policy denial.
