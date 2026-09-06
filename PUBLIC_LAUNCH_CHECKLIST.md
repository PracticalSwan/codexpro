# Public Launch Checklist

CodexPro is a local developer bridge. Treat public launch readiness as two separate gates:

1. The fork release artifact/source checkout is safe and understandable for local developers.
2. The ChatGPT connector surface is stable enough for users to connect the OpenAI Tunnel ID, with Server URL transports kept as tested fallbacks.

Do not present CodexPro as a fully reviewed public ChatGPT app until it has gone through the current app review flow.

## Release Gate

Run the authoritative release check before tagging:

```bash
npm ci
npm run release:check
git diff --check
```

The public release package is `codexpro-full`; it intentionally installs the compatible `codexpro` CLI. GitHub Releases are the canonical release channel. The upstream npm package `codexpro@latest` is not this fork. npm-registry publication of `codexpro-full` is optional and must not be claimed until npm authentication or trusted publishing is configured and the published package is verified.

The tarball must not include:

```text
.env files
local tunnel URLs
CodexPro tokens
OpenAI runtime API keys
Cloudflare or ngrok tokens
.ai-bridge runtime files
node_modules
local screenshots or reports
```

## ChatGPT App Gate

Before announcing broadly:

- Test a fresh ChatGPT connector using **Connection: Tunnel** and the intended OpenAI tunnel ID/workspace.
- Run sustained/reconnect validation of the official tunnel-client before declaring the OpenAI path production-ready.
- Test saved ngrok fallback, Cloudflare quick fallback, and local-only mode separately.
- Refresh actions after widget URI or metadata changes.
- Confirm CSP stays enabled (Developer mode prerequisite).
- Capture screenshots for:
  - app connection screen
  - `server_config`
  - `open_current_workspace`
  - one `write`
  - one `edit`
  - one `search`
  - one failure state
- Run the same golden prompts on each release and compare behavior.

Suggested golden prompts:

```text
Use CodexPro. Call server_config, then open_current_workspace with include_tree=false. Read README.md and summarize the project without editing files.
```

```text
Use CodexPro. Create a small static site from PRODUCT.md by writing index.html, styles.css, and README.md. Verify with one targeted search.
```

```text
Use CodexPro. Try to read .env. Explain why the request is blocked.
```

```text
Use CodexPro. Run bash with pwd, then run bash with a blocked command. Report both outcomes.
```

## Security Gate

- Keep CodexPro bearer auth enabled for OpenAI mode and all public HTTP fallback tunnels.
- Verify no OpenAI runtime API key appears in profiles, process argv, logs, screenshots, or release artifacts.
- Keep `CODEXPRO_BASH_MODE=safe` by default.
- Keep `CODEXPRO_WRITE_MODE=workspace` only for agent mode.
- Keep blocked path tests for `.env`, `.git`, `node_modules`, private keys, and symlink escapes.
- Do not broaden allowed roots during setup unless the user explicitly asks.
- Do not log query strings, tokens, file contents, prompts, or full command output by default.
- Re-run live `proc_*` and `evt_*` cross-call continuity checks after HTTP/runtime-state changes.
- Verify allowed hidden workspace events and blocked-path exclusion after workspace snapshot/event changes.
- Verify bounded `git_blame(max_lines=5)` after Git subprocess/output changes.
- Verify Goal wrong-fingerprint rejection and no auto commit/push/merge after Goal changes.

## Onboarding Gate

Fresh-user setup should work from the GitHub Release artifact (`https://github.com/PracticalSwan/codexpro/releases/download/v0.32.3/codexpro-full-0.32.3.tgz`) or a verified source checkout. The upstream `npx codexpro@latest` path is not a fork release channel.

The terminal must clearly show:

- workspace root
- current mode
- connector strategy and Tunnel ID for OpenAI mode
- that OpenAI mode does not claim/copy a public Server URL
- that Enter opens ChatGPT connector settings and instructs the user to choose Connection: Tunnel
- how to stop the process

For the primary OpenAI path, `codexpro setup`/`settings set` must save the non-secret Tunnel ID and client path (never the runtime API key) so future starts from the same workspace only need:

```bash
codexpro start
```

## Known Non-Goals For The Current Local Package

- CodexPro is not an OS sandbox.
- CodexPro does not guarantee a ChatGPT model can call MCP tools.
- CodexPro does not change ChatGPT, Codex, or OpenAI quota behavior.
- Quick Cloudflare tunnels are not permanent URLs.
- OpenAI Secure MCP Tunnel still requires an OpenAI Platform tunnel scoped to the correct ChatGPT workspace and a runtime API key supplied outside the CodexPro profile.
- A vendor-independent single shared public URL for every user would still require a hosted relay architecture.
