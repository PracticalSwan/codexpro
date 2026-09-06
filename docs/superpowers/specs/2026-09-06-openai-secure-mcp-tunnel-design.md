# OpenAI Secure MCP Tunnel Migration — Design

**Status:** Approved for implementation by user on 2026-09-06
**Scope:** CodexPro launcher, profile/settings surface, diagnostics, tests, and operator docs

## Goal

Make OpenAI Secure MCP Tunnel the primary ChatGPT connection for `codexpro start`, while preserving existing HTTP tunnel modes—especially ngrok—as explicit fallbacks.

## Product behavior

- New/no-profile `codexpro start` defaults to `--tunnel openai`.
- Existing saved profiles keep their configured tunnel until the user changes them.
- `codexpro ngrok` and `codexpro start --tunnel ngrok` remain supported fallback paths.
- OpenAI mode invokes the official external `tunnel-client`; CodexPro does not reimplement the tunnel protocol.
- CodexPro's local HTTP MCP remains loopback-bound and bearer-token protected.
- The local bearer token is passed to tunnel-client only through an environment reference used by `--mcp.extra-headers` and `--mcp.discovery-extra-headers`; it must not appear in process arguments, logs, saved profiles, or docs.

## Configuration

OpenAI mode accepts:

- `--openai-tunnel-id <tunnel_...>`; env fallback `CONTROL_PLANE_TUNNEL_ID`; profile field `openaiTunnelId`.
- `--tunnel-client <path>`; env fallback `TUNNEL_CLIENT_BIN`; otherwise PATH, then the known local CodexPro/OpenAI client location when present.
- Runtime authentication stays owned by official tunnel-client through `CONTROL_PLANE_API_KEY` with `OPENAI_API_KEY` as its documented fallback. CodexPro never persists either key.

A tunnel ID must match `tunnel_<32 lowercase hexadecimal characters>`.

## Runtime contract

1. Validate local configuration before spawning children.
2. Start the existing local Streamable HTTP MCP server.
3. Wait for CodexPro `/healthz`.
4. Start `tunnel-client run` with the tunnel ID, `channel=main` local MCP target, loopback ephemeral health listener, and health URL file.
5. Supply bearer auth through referenced environment data, not literal command arguments.
6. Read the health URL file and require tunnel-client `/readyz` HTTP 200 before declaring the connector ready.
7. Supervise both processes and terminate both on launcher shutdown or unexpected startup failure.

## ChatGPT UX

OpenAI mode does not expose or copy a public Server URL. The ready output must show:

- the OpenAI tunnel ID,
- tunnel-client readiness/UI URL when available,
- the local CodexPro status URL,
- instructions to use ChatGPT Settings → Connectors → Connection: Tunnel and select/paste the same tunnel ID.

The interactive control panel must not offer to copy a nonexistent public endpoint in OpenAI mode.

## Stop boundary

Implementation and local fake-client verification may proceed automatically. Live OpenAI validation stops before any action requiring the user's Platform account, tunnel creation, runtime API key, workspace selection, connector creation, or credential entry.

## Acceptance criteria

- OpenAI is the launcher default only when no saved/explicit tunnel overrides it.
- Existing ngrok behavior and saved ngrok profiles continue to work unchanged.
- No OpenAI/runtime API key is stored by CodexPro.
- Local CodexPro bearer auth remains enabled in OpenAI mode and no raw token appears in tunnel-client argv.
- `doctor`, settings, usage, README/security/domain docs explain the new primary/fallback model.
- Focused tunnel smoke, build, full smoke, audit, and `git diff --check` pass before the local implementation is reported complete.
