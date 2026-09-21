# Plan 46 — Local Service Observatory Design

Created: 2026-09-22
Status: Planned
Priority: P1

## Problem

CodexPro can inspect source, Git state, tests, processes, and logs, but it cannot directly observe the HTTP behavior of a local development service. This leaves an important evidence gap between “the code/tests suggest the endpoint works” and “the running loopback service actually returned this status/body shape.”

The missing capability should be a small **local runtime sensor**, not browser automation, an API-testing platform, a crawler, or an arbitrary network client.

## Goals

- Add one opt-in read-only `probe_local_service` MCP tool.
- Observe an explicitly requested loopback HTTP endpoint using GET or HEAD only.
- Return status, timing, selected response metadata, bounded/redacted body preview, and bounded JSON structure when applicable.
- Keep the request implementation independent from browsers, proxies, cookies, credentials, and the internet.
- Make the capability useful alongside existing `proc_*` without creating process orchestration or service ownership claims.
- Add no new dependency.

## Non-goals

- No browser/DOM/JavaScript automation.
- No generic HTTP client or arbitrary internet access.
- No POST/PUT/PATCH/DELETE/OPTIONS mutation workflow.
- No cookies, Authorization headers, API keys, client certificates, or credential store.
- No WebSockets/SSE client.
- No OpenAPI/GraphQL test generation, fuzzing, contract engine, or request collection format.
- No automatic endpoint crawling/discovery.
- No proxy support.
- No TLS/certificate-bypass machinery in v1.
- No claim that the target service is owned by the selected workspace.

## Relationship to Plans 38–45

- **Plan 38:** runtime lifecycle/provenance concerns the CodexPro process itself; Plan 46 must never reuse `codexpro stop` or runtime ownership to control the target app.
- **Plan 39:** use the capability-explanation/profile/admin conventions for an explicit default-off `local_service_probe` capability. Do not add a separate settings UI.
- **Plan 40:** context providers remain source intelligence; no HTTP results are silently injected into `gather_context`.
- **Plan 41/44:** notebook/table readers are file sensors. Plan 46 follows their bounded/redacted result discipline but has no shared parser/state.
- **Plan 42:** workspace briefing may report whether local service probing is enabled, but must not probe endpoints automatically.
- **Plan 43:** verification failure context remains deterministic from check evidence and must not auto-probe a service in v1.
- **Plan 45:** dependency reality answers “what library is installed”; Plan 46 answers “what loopback service actually returned.” They are complementary and independent.

Plan 46 belongs after Plan 45 in the roadmap because it introduces a new network trust boundary and should be the final planned capability addition before another real-project evidence pause.

## Existing seams to reuse

- `src/config.ts` and `src/profileStore.ts` — capability/profile state.
- `scripts/codexpro.mjs` and authenticated `src/http.ts` admin profile editor — existing operator configuration surface.
- Plan 39 capability explanation seam when available.
- `src/redact.ts` — response text/structured-value redaction.
- `src/deadline.ts` — call budget; the probe remains a short synchronous operation.
- `src/server.ts` — MCP registration/tool mode/policy gating.
- Existing activity/telemetry lifecycle wrappers; no second logging system.

## Capability gate

Add one explicit capability:

```text
localServiceProbeEnabled
```

Suggested environment/profile setting:

```text
CODEXPRO_LOCAL_SERVICE_PROBE=0|1
```

Default: **off**.

The saved profile and current runtime must distinguish next-launch vs effective state according to existing conventions. If Plan 39 is implemented first, its deterministic capability explanation should report `local_service_probe` as available/disabled without special-case UI architecture.

This flag grants only the narrow loopback GET/HEAD behavior below.

## Public tool

Add exactly one new top-level tool:

```text
probe_local_service
```

Suggested schema:

```ts
{
  workspace_id?: string;
  url: string;
  method?: "GET" | "HEAD";
  timeout_ms?: number;
  max_body_bytes?: number;
}
```

No custom headers, cookies, auth, request body, proxy, redirect mode, or TLS options are exposed in v1.

## URL and network boundary

V1 supports **HTTP only**.

A request is allowed only when all conditions hold:

1. URL parses successfully with `new URL()`.
2. Protocol is exactly `http:`.
3. No username/password/userinfo is present.
4. Host is one of:
   - literal `127.0.0.1`;
   - literal `[::1]`;
   - `localhost` only after DNS lookup confirms every returned address is loopback.
5. Port is explicit and within 1024–65535.
6. URL length/path/query length remain bounded.
7. No proxy/environment routing is used.
8. Redirects are **not followed** in v1. A 3xx response is returned as evidence with a bounded/redacted `Location` value.
9. DNS is revalidated for every `localhost` request; do not cache a non-authoritative mapping across calls.

Use `node:http` (and `node:dns` for localhost validation) rather than a convenience HTTP client that may introduce proxy/redirect behavior.

The tool does not prove workspace ownership of the listening service. Return that fact explicitly rather than inferring ownership.

## Request behavior

- Allowed methods: GET and HEAD only.
- Default method: GET.
- Fixed safe request headers only, for example bounded `Accept` and a CodexPro user agent.
- Do not forward ambient process cookies, auth, proxy, or user headers.
- No keep-alive pool is required; prefer a one-request bounded connection.
- Clamp timeout to a short window, recommended 250–10,000 ms with conservative default such as 3,000 ms.
- Respect the outer synchronous deadline as well as the probe-specific timeout.
- Abort/destroy the request when timeout/body limit/outer cancellation requires it.

GET is transport-read-only but a poorly designed target endpoint may still have side effects. Documentation must state that the capability is explicit opt-in and endpoint semantics are controlled by the target application.

## Response result

Suggested shape:

```ts
interface LocalServiceProbeResult {
  url: string;
  method: "GET" | "HEAD";
  status: number;
  statusText: string;
  elapsedMs: number;
  headers: {
    contentType?: string;
    contentLength?: number;
    location?: string;
  };
  body?: {
    kind: "json" | "text" | "binary" | "empty";
    preview?: string;
    bytesRead: number;
    truncated: boolean;
    jsonShape?: JsonShape;
  };
  workspaceOwnership: "unknown";
  warnings: string[];
}
```

Only return an allowlisted response-header subset. Do not return `Set-Cookie`, authentication headers, server trace headers, or arbitrary header dumps.

### JSON shape

For a small valid JSON response:

- return a bounded structural shape (object keys, arrays, primitive kinds);
- cap depth, key count, array samples, string length, and structured bytes;
- redact returned string values/previews;
- do not infer semantic sensitive categories.

For invalid/oversized JSON, return a bounded text preview and warning rather than failing the entire observation.

### Binary/non-text responses

- report MIME/content length/bytes read;
- do not return raw binary/base64 payloads;
- optionally return a tiny safe textual note only.

## Tool mode and policy

- Expose `probe_local_service` in **Full mode only** in v1.
- Require `localServiceProbeEnabled=true`.
- Keep Minimal and Standard unchanged.
- Existing tool policy can deny the tool by name.
- Do not infer enablement from Bash mode or process availability.

This deliberately treats loopback observation as a stronger capability than ordinary workspace file reads.

## Boundedness and execution class

- Execution class: synchronous.
- No `proc_*`, `job_*`, `batch_*`, or Goal state.
- One request per call.
- No retries in v1 except underlying connection behavior needed by Node.
- Clamp body bytes independently from normal process output limits.
- Never keep sockets, sessions, or endpoint histories after the call.

## Security and privacy

- Default-off capability.
- Loopback-only HTTP.
- Explicit port >=1024.
- No credentials/cookies/custom headers.
- No redirects followed.
- No proxy.
- No browser.
- No arbitrary DNS targets.
- All returned strings/JSON pass through current redaction.
- Response metadata is allowlisted.
- Do not persist response bodies in profiles, diagnostics, activity records, or durable state.
- Activity/telemetry may record only bounded tool/status/timing metadata under existing sanitized conventions.

## Acceptance criteria

- Disabled capability makes the tool unavailable/denied according to existing capability conventions.
- GET and HEAD to an explicit allowed loopback HTTP port work.
- `localhost` is accepted only when all resolved addresses are loopback.
- Public/private LAN hosts, arbitrary DNS names, file/data URLs, HTTP userinfo, implicit/privileged ports, and unsupported protocols are rejected.
- Redirects are reported but never followed.
- No Authorization, cookie, custom-header, body, proxy, or TLS-bypass path exists.
- JSON response returns bounded redacted preview/shape.
- Text response is bounded/redacted.
- Binary response never returns raw binary payload.
- Timeout and max-body limits terminate the request predictably.
- Target-service ownership is reported as unknown; the tool does not claim a workspace process owns the port.
- Tool exists only in Full mode and only when explicitly enabled.
- No new dependency, browser subsystem, request collection store, crawler, API test engine, or background process.

## Verification

- Add focused `scripts/local-service-probe-smoke.mjs` using ephemeral loopback fixture servers.
- Cover disabled gate, GET, HEAD, JSON, text, binary, timeout, truncation, redaction, 3xx non-following, forbidden hosts/protocols/userinfo/ports, and localhost resolution checks.
- Extend config/profile/settings/admin/tool-surface tests for the new default-off capability.
- `npm run build`.
- `npm run smoke` because config/profile/admin/MCP surfaces change.
- `git diff --check`.
- Stress is not required unless connection concurrency/shared socket state is added (it should not be in v1).
- Audit/package checks are not required unless a dependency is added (the design forbids one).
