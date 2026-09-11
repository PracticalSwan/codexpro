# CodexPro Full — Getting Started

This guide covers installation, first-time OpenAI Secure MCP Tunnel setup, daily startup, and safe multi-project/multi-session use.

## 1. Choose what to install

CodexPro Full is the `PracticalSwan/codexpro` fork. The installed command is still `codexpro`.

### Stable tagged release

Use the GitHub Release artifact when you want the latest tagged/stable build:

```bash
npm install -g https://github.com/PracticalSwan/codexpro/releases/download/v0.32.3/codexpro-full-0.32.3.tgz
codexpro --version
```

### Latest `main`

`main` can contain verified fixes listed under **Unreleased** before the next GitHub Release is tagged. Build from source when you specifically need those changes:

```bash
git clone https://github.com/PracticalSwan/codexpro.git
cd codexpro
git checkout main
git pull --ff-only origin main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.32.3.tgz
codexpro --version
```

Do **not** install `codexpro@latest` from npm expecting CodexPro Full; that is the upstream distribution, not this fork.

## 2. Prerequisites

Install or prepare:

- Node.js 20 or newer
- Git
- a ChatGPT surface that supports custom MCP/plugin connections
- the official OpenAI `tunnel-client` for the recommended connection path
- an OpenAI Platform Secure MCP Tunnel (`tunnel_...`)
- a restricted OpenAI runtime API key authorized for the tunnel

Keep ChatGPT Developer mode enabled and keep CSP enforcement enabled.

Official ChatGPT MCP connection documentation:

- <https://developers.openai.com/apps-sdk/deploy/connect-chatgpt>

## 3. One-time OpenAI tunnel setup

1. In OpenAI Platform, create a Secure MCP Tunnel for the ChatGPT workspace that will use CodexPro.
2. Install the official `tunnel-client` for your operating system and make it available on `PATH`, or provide its path during CodexPro setup.
3. Create a restricted runtime API key with the tunnel permissions required by the Platform setup.
4. Store that key locally with CodexPro's masked prompt:

```bash
codexpro openai-key save
```

Do not paste the runtime API key into ChatGPT, source files, Git, or workspace profiles.

## 4. Configure a project

Run setup from the repository ChatGPT should use:

```bash
cd /path/to/your/project
codexpro setup
```

For the recommended path, select the OpenAI tunnel mode and provide the non-secret `tunnel_...` ID. Save the workspace profile when prompted.

Check the result before starting the connector:

```bash
codexpro doctor
codexpro settings show
```

Daily startup from that project is then:

```bash
codexpro start
```

CodexPro keeps the local MCP server loopback-bound and bearer protected while the official tunnel client forwards the connection.

## 5. Connect ChatGPT

In ChatGPT, open the custom plugin/MCP connection UI (the label may appear as **Plugins** or **Connectors** depending on the client), choose **Connection: Tunnel**, and select or paste the same `tunnel_...` ID.

Then start a chat with a bounded discovery prompt such as:

```text
Use CodexPro. Call server_config, then open_current_workspace with include_tree=false.
```

When `open_workspace` returns a `workspace_id`, keep using that ID explicitly after MCP/session turnover.

## 6. Recommended: multiple ChatGPT sessions, multiple projects

For most users, run **one CodexPro runtime** and allow every project you want that runtime to serve. If the multi-session/isolation fixes are still listed under **Unreleased** in `CHANGELOG.md`, install current `main` rather than the older tagged artifact.

Example:

```text
Project A: C:\code\app
Project B: D:\work\api
```

One-time launch without saving Project B:

```powershell
cd "C:\code\app"
codexpro start --project "D:\work\api"
```

Or save Project B permanently in Project A's launch profile:

```powershell
cd "C:\code\app"
codexpro settings set --project "D:\work\api"
codexpro settings show
codexpro start
```

Open two ChatGPT conversations. In the first, select Project A with `open_workspace`; in the second, select Project B. Each conversation should retain and pass its own returned `workspace_id`.

A good per-chat pattern is:

```text
Chat 1: call server_config, then open_workspace for C:\code\app
Chat 2: call server_config, then open_workspace for D:\work\api
```

This gives separate workspace selection per MCP session while sharing one healthy runtime/tunnel.

Remove saved extra projects with:

```bash
codexpro settings set --clear-projects
```

## 7. Hard isolation: two independent CodexPro runtimes

Use two processes only when you need connector/process isolation. Each simultaneous runtime must have:

- a different local port, and
- a different OpenAI tunnel ID (or a distinct HTTP fallback endpoint).

Example:

```powershell
# Terminal 1
cd "C:\code\app"
codexpro start --port 8787 --openai-tunnel-id tunnel_A...

# Terminal 2
cd "D:\work\api"
codexpro start --port 8788 --openai-tunnel-id tunnel_B...
```

CodexPro intentionally rejects a second live launcher that reuses an already active OpenAI tunnel ID. A different local port alone does not create a separate ChatGPT connector identity.

If you see an error that the tunnel is already active, choose one of these fixes:

1. use the existing runtime and add the second project with `--project` / `settings set --project`, or
2. create and configure a different OpenAI tunnel ID for the second runtime.

## 8. Common problems

### `Workspace root is outside allowed roots`

Add that project to the launch profile and start a new runtime:

```bash
codexpro settings set --project /path/to/other/project
codexpro start
```

Saved profile changes apply to the next launch.

### `Unknown workspace_id`

Call `open_workspace` again for the intended allowed project, then use the newly returned `workspace_id` explicitly.

### Tunnel/session instability

Run:

```bash
codexpro doctor
codexpro settings show
```

Confirm only one live CodexPro launcher owns a given OpenAI tunnel ID. With current `main`, duplicate ownership is rejected before takeover.

## 9. Safe defaults to keep

- Keep ChatGPT Developer-mode CSP enforcement enabled.
- Keep CodexPro authentication enabled.
- Allow only repositories you actually want ChatGPT to access.
- Keep Git push disabled unless you explicitly need it.
- Never reuse one OpenAI tunnel ID across two simultaneous CodexPro runtimes.
- Never paste runtime API keys, MCP bearer tokens, private keys, or `.env` contents into chat.

## 10. Updating later

For a stable tagged release, install the newer GitHub Release artifact when one is published.

For a source installation:

```bash
cd /path/to/codexpro
git pull --ff-only origin main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.32.3.tgz
codexpro --version
codexpro doctor
```

Saved workspace profiles under `~/.codexpro` remain separate from the package installation.

For feature details and security boundaries, continue with [README.md](README.md), [FEATURES.md](FEATURES.md), [FAQ.md](FAQ.md), and [SECURITY.md](SECURITY.md).
