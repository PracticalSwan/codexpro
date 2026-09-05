# Public Launch Checklist

CodexPro is a local developer bridge. Treat public launch readiness as two separate gates:

1. The fork release artifact/source checkout is safe and understandable for local developers.
2. The ChatGPT Plugins surface is stable enough for users to connect a Server URL.

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
Cloudflare or ngrok tokens
.ai-bridge runtime files
node_modules
local screenshots or reports
```

## ChatGPT App Gate

Before announcing broadly:

- Test in ChatGPT Plugins with a fresh plugin install.
- Test quick tunnel, saved ngrok domain, and local-only mode.
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

- Keep auth enabled for public tunnels.
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
- public URL strategy
- that the Server URL is copied
- that Enter opens ChatGPT connector settings
- how to stop the process

For stable URLs, `codexpro setup` must save enough profile state so future starts from the same workspace only need:

```bash
codexpro start
```

## Known Non-Goals For The Current Local Package

- CodexPro is not an OS sandbox.
- CodexPro does not guarantee a ChatGPT model can call MCP tools.
- CodexPro does not change ChatGPT, Codex, or OpenAI quota behavior.
- Quick Cloudflare tunnels are not permanent URLs.
- A single shared public URL for every user requires a hosted relay architecture, not only a local npm package.
