# OpenAI Secure MCP Tunnel Migration — Implementation Plan

**Status:** Approved for execution by user on 2026-09-06
**Spec:** `docs/superpowers/specs/2026-09-06-openai-secure-mcp-tunnel-design.md`

## Scope

Implement the OpenAI Secure MCP Tunnel as the primary launcher path without changing CodexPro's MCP server protocol or weakening its local authentication boundary.

## 1. Contract tests first

Add a focused `scripts/openai-tunnel-smoke.mjs` that uses temporary roots and a fake official-client executable to prove:

- `--tunnel openai` is recognized and requires a valid tunnel ID.
- settings persist tunnel ID/client path but never OpenAI credentials.
- a fake tunnel-client receives the expected tunnel ID, local MCP target, referenced auth headers, and ephemeral health URL file.
- the raw CodexPro bearer token is absent from child argv and launcher logs.
- CodexPro waits for fake `/readyz` before reporting ready.
- ngrok shorthand remains available as fallback.

Run the focused check before implementation and confirm it fails for missing OpenAI support.

## 2. Launcher/config integration

Update `scripts/codexpro.mjs` only as needed to:

- add `openai` to tunnel validation, setup choices, profile summaries, and doctor;
- make `openai` the no-profile/default `codexpro start` route;
- preserve existing saved profile precedence;
- resolve and verify the official tunnel-client binary;
- validate `openaiTunnelId` and prohibit credential persistence;
- supervise tunnel-client using a temporary health URL file and `/readyz` readiness probe;
- keep the local MCP token and inject bearer auth via environment references for discovery and normal requests;
- print a Tunnel-specific ChatGPT connection block instead of a public Server URL.

Keep `ngrok`, Cloudflare, Tailscale, and local-only modes behavior-compatible.

## 3. Package/docs integration

Update the package connect aliases and public docs so OpenAI Secure MCP Tunnel is the recommended ChatGPT path and ngrok is documented as the stable HTTP fallback. Do not claim live OpenAI validation until the user's Platform-side actions are complete.

## 4. Verification

Run, in order:

1. `node scripts/openai-tunnel-smoke.mjs`
2. `npm run build`
3. focused settings/doctor smoke as affected
4. `npm run smoke`
5. `npm audit --audit-level=high`
6. `git diff --check`
7. final diff/spec-compliance/security review

Do not run live `tunnel-client doctor`, connect a real tunnel, create Platform resources, enter API keys, edit the user's saved production profile, or change the ChatGPT connector. Stop and hand those actions to the user after local verification succeeds.
