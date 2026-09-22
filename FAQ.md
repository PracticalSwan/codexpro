# CodexPro Full FAQ

## What is CodexPro Full?

CodexPro Full is the independently maintained `PracticalSwan/codexpro` fork. It preserves the `codexpro` CLI, MCP protocol, profile format, and upstream MIT lineage, but maintains its own 0.31-0.32 feature line including durable operations, process/event continuity, repository intelligence, optional CodeGraph/LSP integration, artifact I/O, guarded Git writes, and Durable Goals.

Canonical fork: `https://github.com/PracticalSwan/codexpro`

Upstream project: `https://github.com/rebel0789/codexpro`

The fork is distributed independently as **`codexpro-full`**, while the installed CLI remains **`codexpro`**. GitHub Releases are the canonical public release channel. The upstream npm package `codexpro@latest` is a different distribution; `codexpro-full` is not published to the npm registry yet. For the complete fork feature map, see [FEATURES.md](FEATURES.md).

## Which ChatGPT account should I use?

Use a ChatGPT account and web surface that can create or connect custom MCP apps. OpenAI's current documentation says full MCP, including write/modify actions, is available to Business and Enterprise/Edu, while Pro can connect MCP apps with read/fetch permissions. Availability, UI labels, and permissions can change during the beta, so check the current ChatGPT Apps / Developer mode controls for your plan.

CodexPro does not unlock custom MCP apps, unlock models, bypass account limits, or provide account access. It connects only to the ChatGPT MCP/app surface your account already has.

Plan access and model tool support are separate, and availability can change. If CodexPro actions are unavailable in that chat, use another tool-capable ChatGPT surface or the Pro context fallback for that session.

## How is CodexPro different from generic workspace bridges?

They can look similar at the transport layer because both use a local MCP-style bridge and a workspace root.

CodexPro is built around one product loop:

```text
install -> setup in a repo -> connect the OpenAI Tunnel ID in ChatGPT -> inspect/edit/verify/review allowed projects
```

The main differences are:

- CodexPro is ChatGPT custom MCP app + MCP first, not a generic workspace bridge.
- Bash, write/edit, tool mode, Codex session reads, and handoff execution are separate safety controls.
- Durable context is repo-backed through `AGENTS.md` and `.ai-bridge/*`, so important project memory stays reviewable in files.
- The normal workflow emphasizes diffs, `show_changes`, smoke tests, and handoff status files.
- CodexPro keeps a strict boundary: no model proxying, account pooling, third-party Pro site scraping, quota bypassing, or OS sandbox claims.

## What changed in the 0.33.2 maintenance release?

Artifact Export diagnostics now check the actual `export_file` registration. Local Service Probe remains package-default-off; a user may persist an opt-in for their own future profiles via `codexpro settings user-default --local-service-probe on`, while individual workspaces can override it with `codexpro settings set --local-service-probe off`. Existing profiles are not automatically migrated for other users.

## What is included in the 0.33.0 feature release?

Release 0.33.0 includes bounded runtime/build provenance and guarded local status/stop commands, deterministic capability/profile diagnostics, provider-backed symbol context, read-only notebook/table/dependency evidence, workspace briefings, and verification failure context. `probe_local_service` is a separate default-off Full-mode capability limited to one explicit loopback HTTP GET/HEAD request. It never follows redirects, sends credentials, or claims that the target listener belongs to the selected workspace. Generic `node_modules` access remains blocked; only the exact declared-dependency inspector has a containment-checked exception.

CodexPro connects ChatGPT to a user-approved local repository over MCP. Repository access, command permissions, and change review remain explicit.

## What does Repository Analysis understand?

Repository Analysis builds a local repository map from bounded, inspectable evidence:

- project and package manifests
- source/test/config/documentation paths
- common declarations, imports, includes, and internal module relationships
- Git changes and existing project verification scripts

It supports TypeScript/JavaScript, Python, Go, Rust, Swift, Java, C#, C, and C++ declaration patterns. Unsupported languages still participate in safe inventory and lexical search.

Relationships are labeled `exact`, `strong`, or `inferred`. The repository map does not replace a compiler or language server. CodexPro does not require a language server, daemon, embedding service, or vector database.

Analysis is process-local and cached by a bounded workspace fingerprint. Direct CodexPro writes, edits, and patches invalidate that cache. If limits are reached, results say `partial` and retain normal tree/search/read/review fallback behavior.

Set `CODEXPRO_ANALYSIS=0` to disable this layer while keeping the standard file, search, Git, and review tools available.

Terminal users can inspect the same facts without ChatGPT:

```bash
codexpro inspect --json
codexpro review --json
```

## What is the `codexpro` supertool?

Note: this FAQ documents the PracticalSwan fork. Do not assume the upstream npm `codexpro@latest` package contains fork-only features.

`codexpro` is a stable wrapper tool for advanced setups. It accepts:

```json
{ "action": "search", "args": { "query": "needle", "path": "src" } }
```

Call it with `action=list_actions` to see what the current server mode actually allows. It cannot call tools that are hidden by `--tool-mode`, `--no-bash`, or non-workspace write mode.

Use explicit tools such as `read`, `search`, `edit`, `bash`, and `show_changes` for normal work. Use the supertool when ChatGPT connector caching, custom workflows, or stable wrapper-style integrations matter more than separate visible tool descriptors.

## What is the recommended install path for this fork?

For the full first-time setup, OpenAI tunnel/key steps, and multi-project examples, see [GETTING_STARTED.md](GETTING_STARTED.md).

Install the latest tagged/stable artifact directly from GitHub Releases:

```bash
npm install -g https://github.com/PracticalSwan/codexpro/releases/download/v0.33.2/codexpro-full-0.33.2.tgz
```

Stable **0.33.2 includes Plans 38–46**, long-lived OpenAI tunnel recovery, Windows Bash/handoff maintenance, and current continuity/isolation hardening. Build main from source only for future **Unreleased** fixes:

```bash
git clone https://github.com/PracticalSwan/codexpro.git
cd codexpro
git checkout main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.33.2.tgz
```

Then run setup from the repository you want ChatGPT to work on:

```bash
cd /path/to/your/repo
codexpro setup
```

After setup, daily startup from that repository is simply:

```bash
codexpro start
```

The upstream `npx codexpro@latest` / `npm install -g codexpro@latest` path is not a release channel for CodexPro Full.

## How do I update CodexPro Full?

Update the fork checkout, rebuild the tarball, and reinstall it:

```bash
cd /path/to/codexpro
git pull origin main
npm install
npm run build
npm pack
npm install -g ./codexpro-full-0.33.2.tgz
codexpro --version
```

Then restart `codexpro start` from the target workspace. Saved profiles under `~/.codexpro` remain in place.

Do not use upstream `codexpro@latest` as an update mechanism for fork-only 0.31-0.32 behavior.

## How is CodexPro different from ChatGPT's built-in web Agent?

They solve different jobs.

ChatGPT's web Agent is for browsing, web research, and general web tasks. By default it cannot open a local Git repo on your machine, read `AGENTS.md`, inspect your current branch/`git diff`, run local verification commands, or keep edits inside an allowed workspace.

CodexPro is a local MCP bridge: your ChatGPT session talks to an approved folder on your computer through a custom MCP app/connection. Developer mode is only the ChatGPT setting that enables this custom app workflow. It does not replace the web Agent, bypass account limits, or turn ChatGPT into a remote shell service.

Use the web Agent for web work. Use CodexPro when the source of truth is a local repository.

## How do I import a ChatGPT attachment into my repo?

In workspace write mode, CodexPro advertises `import_file`. ChatGPT must pass an Apps SDK file object:

```json
{
  "download_url": "https://...",
  "file_id": "file_...",
  "mime_type": "image/png",
  "file_name": "screenshot.png"
}
```

CodexPro marks that argument with `_meta["openai/fileParams"]`. It downloads only temporary HTTPS URLs from approved ChatGPT/OpenAI file hosts, enforces `CODEXPRO_MAX_IMPORT_BYTES`, rejects private/loopback redirect targets, and writes into the allowed workspace only. Overwrite defaults to false. Arbitrary user- or model-supplied download URLs are rejected.

Example destination:

```text
docs/evidence/screenshot.png
```

If the client does not provide `download_url` and `file_id`, the tool returns an unsupported-reference error and creates no files.

## What do I enable in ChatGPT?

For the default OpenAI Secure MCP Tunnel path, first complete the one-time OpenAI Platform tunnel setup. Store the restricted runtime API key with `codexpro openai-key save`, or use `CONTROL_PLANE_API_KEY` only as a session-scoped override. Do not paste that key into ChatGPT or save it in a workspace profile.

Then open ChatGPT. In the current UI, individual users typically enable Developer mode under:

```text
Settings
-> Apps
-> Advanced settings
-> Developer mode: on
-> Enforce CSP in developer mode: on   # when this control is shown
```

Business / Enterprise / Edu workspaces may require an administrator to enable Developer mode/custom apps first. Then open the custom app/MCP connection UI and choose the tunnel connection.

Select the tunnel or paste the same `tunnel_...` ID printed by CodexPro. The local CodexPro bearer token is forwarded by the official `tunnel-client` from a referenced environment value; it is not part of the ChatGPT connector form or public URL.

If you deliberately use ngrok/Cloudflare/Tailscale instead, follow the HTTP fallback instructions and use the Server URL path for that connector.

## Should CSP stay enabled?

Yes. Keep Enforce CSP in developer mode enabled.

CodexPro widgets are built for the CSP-enabled path. They do not need unrestricted network access, external fonts, remote scripts, iframes, or third-party images.

## Does CodexPro bypass rate limits?

No.

CodexPro does not bypass, avoid, increase, pool, resell, or modify ChatGPT, Codex, OpenAI, or third-party model limits. Every request still runs through the user's own ChatGPT session and whatever limits that account has.

The useful part is that Codex and ChatGPT are different product surfaces. If one workflow is unavailable and another product surface you already have access to is still available, CodexPro lets you work against the same local repo without changing either product's limits.

## Can CodexPro use the newest ChatGPT models?

Only when your ChatGPT account exposes that model in the product surface you are using **and** that model/chat surface can call the custom MCP app. Model availability and MCP-tool availability are separate.

If CodexPro actions are unavailable in that chat, CodexPro cannot make that request reach the local server. CodexPro does not provide, proxy, resell, or unlock models; it gives compatible ChatGPT sessions local repo tools.

For models that cannot call tools, generate a repo context bundle instead:

```bash
codexpro pro-bundle --root /path/to/repo --copy
```

## What can ChatGPT see through CodexPro?

ChatGPT can see explicit workspace context exposed by tools:

- `AGENTS.md`
- `.ai-bridge` plans and status files
- git status
- git diff
- selected source files
- file tree and search results

It cannot read hidden Codex runtime memory or anything outside the allowed workspace unless you explicitly allow that root.

## What can ChatGPT edit?

In normal coding mode, ChatGPT can write and exact-edit files inside the configured workspace.

Safety defaults block common sensitive paths:

- `.env`
- private keys
- `.git`
- `node_modules`
- generated build/cache folders
- symlink escapes
- paths outside the workspace

Use handoff mode if you want ChatGPT to write a plan only and let Codex execute locally. In handoff mode, generic `write` and `edit` tools are not advertised to ChatGPT.

Use `CODEXPRO_WRITE_MODE=off` when you want direct `write` and `edit` tools removed from the advertised MCP tool list while still allowing bounded handoff/context files.

## Which Bash does CodexPro use on Windows?

For Windows-native workspaces, CodexPro prefers Git for Windows Bash when it is installed. It does not silently auto-select `C:\Windows\System32\bash.exe`, because that executable launches WSL and can expose a different Git, Node, npm, path model, and filesystem runtime from the native CodexPro process.

Current `main` has an explicit runtime selector. `auto` keeps the Windows-native preference, `native-bash` requires a native Bash, and `wsl` is the explicit WSL opt-in:

```powershell
$env:CODEXPRO_BASH_RUNTIME = 'auto'       # auto | native-bash | wsl
$env:CODEXPRO_BASH_EXECUTABLE = 'C:\Program Files\Git\bin\bash.exe'
$env:CODEXPRO_GIT_EXECUTABLE = 'C:\Program Files\Git\cmd\git.exe'
codexpro start
```

With `CODEXPRO_BASH_RUNTIME=wsl`, CodexPro invokes WSL explicitly as `wsl.exe --exec bash -lc ...`; auto mode never silently turns a Windows-native workspace into a WSL execution environment. `server_config` and `codexpro_self_test` report the selected Bash runtime, dedicated Git runtime, shell-visible toolchain, and whether search is using ripgrep or the Node fallback.

## What happens if a local handoff is interrupted or tries to push remotely?

On current `main`, `execute-handoff`, `watch-handoff`, and `loop-handoff` treat remote publication as a separate side effect. Standard Git/GitHub remote mutations are blocked in the guarded executor environment by default, inherited `GH_TOKEN` / `GITHUB_TOKEN` values are removed, and an authorized workflow must opt in with `--allow-remote-mutations`. This is a guard around standard `git` / `gh` paths, not a substitute for reviewing arbitrary custom executors.

Handoff receipts record the parent and child PIDs. A parent signal first records `interrupting`, then `interrupted` only after child teardown. If `wait_for_handoff` sees an old `running` / `interrupting` receipt whose recorded processes are gone, it reports `orphaned`. Interrupted/orphaned results require reconciliation: inspect Git and the target system before retrying a material operation because its external outcome may be ambiguous.

## Can CodexPro bind bash to a specific session id?

CodexPro cannot attach to, read, or execute inside a specific Codex app conversation or terminal session.

The MCP `bash` tool runs from the CodexPro server process you started for the configured workspace. MCP session ids are HTTP transport state between ChatGPT and CodexPro; they are not Codex conversation ids.

What CodexPro can do is require a matching local bash session label before it runs shell commands:

```bash
codexpro start --bash-session main --require-bash-session
```

Then `bash` calls must include `session_id: "main"`. This helps avoid accidental shell execution in the wrong CodexPro terminal, but it is not remote control of an existing Codex app chat.

CodexPro can list local Codex session ids and titles when you explicitly opt in:

```bash
codexpro start --codex-sessions metadata
```

This reads local Codex JSONL history under `~/.codex/sessions` and `~/.codex/archived_sessions` and returns metadata plus `codex resume <session-id>` commands. Use `--codex-sessions read` only if you also want bounded transcript reads. It does not attach to a live Codex app conversation.

If you do not want ChatGPT to trigger shell commands while you work in Codex, start CodexPro with bash disabled:

```bash
codexpro start --no-bash
```

This removes the `bash` MCP tool from the advertised tool list. ChatGPT can still use non-bash CodexPro tools such as workspace open, read, search, and show_changes. Direct `write`/`edit` are advertised only in workspace write mode.

If you only want ChatGPT to plan and leave execution to Codex or another local agent:

```bash
codexpro start --mode handoff --no-bash
```

## Which tunnel should I choose?

Use this rule:

```text
Recommended ChatGPT path: OpenAI Secure MCP Tunnel
Stable HTTP fallback:     ngrok free dev domain
Disposable HTTP demo:     Cloudflare quick tunnel
Custom-domain fallback:   Cloudflare named tunnel
Tailnet HTTP fallback:    Tailscale Funnel
Local MCP clients:        local-only mode
```

`codexpro start` defaults to OpenAI Secure MCP Tunnel for new/no-profile launches. Existing saved profiles keep their current tunnel until you migrate them, so an established ngrok setup is not silently broken. After migrating an ngrok profile to OpenAI, CodexPro keeps the ngrok hostname/config as fallback metadata and `codexpro ngrok` can reuse it.

Cloudflare quick tunnel URLs change on restart. HTTP fallback modes expose a public/non-loopback endpoint and should keep CodexPro token authentication enabled.

## Does CodexPro recover the OpenAI tunnel if it fails after running for a while?

Yes, in **0.32.4 and later**. CodexPro gives the official tunnel-client a response-forwarding TTL longer than CodexPro's maximum bounded synchronous call (60 minutes plus a five-minute transport margin), heartbeats `/readyz` after startup, and watches the tunnel child process.

If that child exits or remains not-ready across the failure threshold, CodexPro marks runtime transport unavailable, replaces **only** the tunnel-client child with bounded backoff, and restores `ready` only after the replacement passes `/readyz`. The local MCP server, runtime generation, workspace selection, bearer-auth boundary, and tunnel lease stay in place.

This recovery behavior is part of the tagged **0.32.4** stable artifact.

## Why does ChatGPT show “Something went wrong” when I create a connector?

Usually ChatGPT could not reach the public MCP URL. A generated `trycloudflare.com` URL is not proof that `cloudflared` stayed connected.

Run the connection test:

```bash
codexpro connection-test --root /path/to/repo
```

This keeps `read`, `tree`, `search`, and `load_skill`, but disables file writes,
bash, and tool cards. In ChatGPT, open the custom app/MCP connection UI from Apps / Developer mode (exact labels vary by plan/client), paste the complete Server URL for the HTTP fallback, and choose the matching authentication option.

The terminal output separates the failure boundary:

- No `POST /mcp received`: the request did not reach CodexPro. Check the ChatGPT
  custom app/MCP connection UI and the tunnel.
- `POST /mcp -> 401`: paste the complete URL, including `codexpro_token`.
- `POST /mcp -> 2xx`: ChatGPT reached CodexPro and the MCP endpoint responded.

The URL token is a personal-use compatibility fallback for connector forms
without custom headers. Shared or multi-user production deployments require
OAuth or `Authorization: Bearer <token>`. CodexPro
requires at least 24 token bytes, removes token parameters from the local
browser address after onboarding, and rate-limits failed authentication
attempts.

Keep CodexPro running while testing. A Cloudflare quick-tunnel URL changes on
every restart. If Cloudflare returns `530` / `Error 1033`, check DNS or
proxy-client DNS handling on the machine running `cloudflared`.

ChatGPT manages custom MCP connections under Apps / Developer mode, with labels that can vary by plan/client. The browser error
`Failed to execute 'removeChild' on 'Node'` occurs in the ChatGPT page, before
CodexPro can handle an MCP request. Remove or recreate the stale custom app/connection
from that UI, then retry with the current URL. CodexPro cannot repair
that browser-side entry.

Official references:

- OpenAI: connect an MCP server to ChatGPT: https://developers.openai.com/apps-sdk/deploy/connect-chatgpt
- OpenAI: MCP server authentication: https://developers.openai.com/apps-sdk/build/auth
- ngrok dev domains: https://ngrok.com/docs/universal-gateway/domains
- Cloudflare Tunnel routing: https://developers.cloudflare.com/tunnel/routing/
- Cloudflare Tunnel DNS records: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/

## Can I keep the same ChatGPT connection every day?

Yes. With the default OpenAI Secure MCP Tunnel path, keep the same Platform tunnel ID assigned to the same ChatGPT workspace and save that non-secret ID in the CodexPro workspace profile. Daily startup remains:

```bash
codexpro start
```

The runtime API key can be stored locally with the masked `codexpro openai-key save` flow in CodexPro's protected per-user secret file, or supplied for one session through `CONTROL_PLANE_API_KEY`. It is never stored in the workspace profile. If you use an HTTP fallback instead, a stable ngrok/Cloudflare/Tailscale hostname can likewise be reused.

## What if I run CodexPro in two repos at once?

For normal multi-session use, prefer **one CodexPro runtime with multiple allowed projects**. Each ChatGPT conversation can select a different allowed root with `open_workspace` and retain its own `workspace_id`. Save the additional projects on the launch workspace:

```bash
cd ~/code/app
codexpro settings set --project ~/code/web --project ~/code/api
codexpro settings show
codexpro start
```

Confirm `Projects` lists the extra roots, then restart the connector so the admin page Allowed Roots list refreshes. Ask ChatGPT to open an allowed project. `open_workspace` makes it the selected project for that MCP session, and later tools can omit `workspace_id`. `open_current_workspace` switches back to the launch project.

`--clear-projects` removes the saved extra roots from that launch workspace profile:

```bash
codexpro settings set --clear-projects
```

Workspace selection is isolated between MCP sessions created by the client. A ChatGPT conversation is not guaranteed to map one-to-one to an MCP session. For strict connector isolation, use separate CodexPro processes **and distinct tunnel/connector identities**; a second local port alone is not a second ChatGPT connector.

CodexPro rejects a second live launcher that tries to reuse an active OpenAI tunnel ID, because that remote connector identity cannot safely point at two local runtimes. For strict separation, run two CodexPro processes with different local ports and distinct OpenAI tunnels (or distinct HTTP fallback hostnames):

```text
repo A: port 8787, tunnel/workspace A
repo B: port 8788, tunnel/workspace B
```

Run `codexpro setup` in each repo and save a profile per workspace. A Secure MCP Tunnel must be scoped to the ChatGPT workspace that will use it; do not reuse one tunnel/profile as a cross-account trust shortcut. See [GETTING_STARTED.md](GETTING_STARTED.md) for complete one-runtime/two-chat and two-runtime hard-isolation examples.

## How do multiple ChatGPT sessions avoid overwriting each other?

Workspace selection is session-local. For shared files, read the file first and pass its returned SHA-256 as `expected_sha256` to `write` or `edit`. CodexPro rejects the operation if the file changed after that read. New files use atomic replacement; existing files are updated in place to retain inode-bound metadata and hard links.

This protects against stale file content. It does not turn CodexPro into a collaborative merge server, so separate worktrees remain the stronger choice for large overlapping changes.

For service managers and background launches, use `codexpro start --headless`. It avoids prompts, clipboard and browser actions, reports readiness with `CODEXPRO_READY`, and exits nonzero if its HTTP runtime stops unexpectedly.

## Where is the canonical fork documentation?

The canonical fork is:

```text
https://github.com/PracticalSwan/codexpro
```

Public documentation is published at `https://practicalswan.github.io/codexpro/`. The repository README and [FEATURES.md](FEATURES.md) remain the source of truth. The upstream project remains credited at `https://github.com/rebel0789/codexpro`.

## Is CodexPro production safe?

CodexPro is a local developer bridge, not an OS sandbox.

Use it with repos you trust. Keep local CodexPro bearer auth enabled in OpenAI mode and token auth enabled for public HTTP fallbacks. Keep safe bash on unless you know why you need full bash. Read [SECURITY.md](SECURITY.md) before supplying tunnel credentials or exposing a public fallback.

## Where are saved settings stored?

CodexPro stores local state under `~/.codexpro` by default. On Windows that is usually `C:\Users\<you>\.codexpro`.

Workspace profiles are JSON files saved under:

```text
~/.codexpro/profiles/
```

Current runtime connection files are saved under:

```text
~/.codexpro/runtime/
```

Set `CODEXPRO_HOME` to move this directory.

Use:

```bash
codexpro settings
codexpro settings list
codexpro settings delete --yes
```

Saved tokens are redacted when profiles are displayed.
