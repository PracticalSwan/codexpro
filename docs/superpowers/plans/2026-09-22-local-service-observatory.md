# Plan 46 — Local Service Observatory Implementation Plan

Created: 2026-09-22
Status: Verified
Priority: P1
Spec: `docs/superpowers/specs/2026-09-22-local-service-observatory-design.md`

## Goal

Add one explicit, default-off, Full-mode `probe_local_service` tool that lets the host model observe the actual GET/HEAD behavior of an explicitly requested loopback HTTP development endpoint without creating browser automation or a generic network client.

## Architecture

```text
profile/env capability gate
          |
          v
probe_local_service
          |
          v
src/localServiceProbe.ts
          |
          +--> strict URL parser/loopback validation
          +--> node:http one-shot GET/HEAD
          +--> short timeout/body budget
          +--> allowlisted response metadata
          +--> bounded JSON/text shaping
          `--> redaction
```

No browser, proxy, cookies, auth, redirect-following, persistent session, crawler, background process, or new dependency.

## Relationship to the current roadmap

- Reuse Plan 39 capability explanation/admin conventions; do not add another control surface.
- Do not modify Plan 38 runtime lifecycle behavior.
- Do not auto-feed probe results into Plan 40 context, Plan 42 briefing, or Plan 43 verification.
- Share only bounded/redaction principles with Plans 41/44.
- Remain independent from Plan 45 dependency inspection.
- Plan 46 is the last planned feature in the current sequence before a real-project evidence pause.

## Task 1 — Add failing network-boundary tests first

**Files**
- Create: `scripts/local-service-probe-smoke.mjs`

**Fixture design**
- Start ephemeral Node HTTP servers bound explicitly to `127.0.0.1` and, when available, `::1`.
- Use temporary high ports only.
- Fixture endpoints:
  - `/json` — bounded JSON;
  - `/text` — text containing a synthetic secret to verify redaction;
  - `/binary` — binary payload;
  - `/redirect` — 302 to another path;
  - `/slow` — delayed response;
  - `/large` — body beyond configured maximum;
  - HEAD behavior.

**Assertions**
- [ ] capability disabled blocks use;
- [ ] GET/HEAD succeed on allowed loopback;
- [ ] 3xx is returned but not followed;
- [ ] body limit truncates predictably;
- [ ] timeout aborts predictably;
- [ ] binary body is not emitted;
- [ ] redaction applies;
- [ ] `http://example.com`, RFC1918/LAN addresses, `file:`, `https:`, URL userinfo, missing port, and ports <1024 are rejected;
- [ ] localhost resolution must be loopback-only.

Expected state: focused test fails because the module/config/tool do not exist.

## Task 2 — Implement the deep one-shot probe module

**Files**
- Create: `src/localServiceProbe.ts`
- Reuse: `src/redact.ts`, `src/deadline.ts`

**Steps**
- [ ] Define the small request/result types from the design.
- [ ] Parse and validate URL before opening a socket.
- [ ] Add loopback-address helper for IPv4/IPv6.
- [ ] Resolve `localhost` with `dns.lookup(..., { all: true })` and require every result to be loopback.
- [ ] Require explicit port 1024–65535.
- [ ] Use `node:http.request` directly with method GET/HEAD, fixed safe headers, no agent pooling, and no proxy integration.
- [ ] Never follow redirects.
- [ ] Bound URL, timeout, body bytes, header values, and elapsed timing.
- [ ] Abort/destroy request on timeout/body-limit/outer cancellation.
- [ ] Return allowlisted headers only.
- [ ] Detect JSON/text/binary conservatively from Content-Type plus bounded parse attempt.
- [ ] Build bounded JSON structure with depth/key/array limits.
- [ ] Redact all returned strings/structured values.
- [ ] Do not persist body/URL query contents outside normal one-call result handling.

**Code-quality gate**
- One module owns URL/network/budget/result behavior.
- Server registration remains thin.
- No general-purpose HTTP abstraction is introduced.

## Task 3 — Add explicit capability/profile wiring

**Files**
- Modify: `src/config.ts`
- Modify: `src/profileStore.ts`
- Modify: `scripts/codexpro.mjs`
- Modify: `src/http.ts`
- Modify: Plan 39 capability-explanation module if it exists by implementation time; otherwise use the current diagnostics/capability convention without creating a second system.
- Modify: `config.example.env`
- Extend: settings/admin/config smoke tests.

**Steps**
- [ ] Add `localServiceProbeEnabled: boolean`, default false.
- [ ] Add `CODEXPRO_LOCAL_SERVICE_PROBE` parsing.
- [ ] Preserve saved profile/current runtime distinction.
- [ ] Add existing-style CLI/settings/admin toggle; no new UI page.
- [ ] Sanitize profile/runtime output consistently.
- [ ] Ensure changing the saved setting does not mutate a running runtime.
- [ ] Surface deterministic disabled reason through Plan 39 conventions when available.

## Task 4 — Register exactly one Full-mode MCP tool

**Files**
- Modify: `src/server.ts`
- Extend: tool-surface tests.

**Steps**
- [ ] Register `probe_local_service` only when tool mode is Full **and** the capability is enabled.
- [ ] Schema exposes only `url`, GET/HEAD, timeout, and body limit.
- [ ] No header/body/auth/redirect/proxy/TLS inputs.
- [ ] Existing policy/tool lifecycle wrappers remain authoritative.
- [ ] Return concise text plus structured content.
- [ ] Do not add endpoint discovery/crawl/status-history tools.

## Task 5 — Verify the security boundary and complementary behavior

**Commands**
```bash
node scripts/local-service-probe-smoke.mjs
node scripts/settings-smoke.mjs
node scripts/http-smoke.mjs
node scripts/diagnostics-smoke.mjs
npm run build
npm run smoke
git diff --check
```

**Acceptance gate**
- [ ] no public/LAN/arbitrary DNS requests;
- [ ] no implicit/privileged ports;
- [ ] no redirect following;
- [ ] no credentials/cookies/custom headers;
- [ ] no response-body persistence;
- [ ] no browser/process/job/Goal creation;
- [ ] no automatic use by workspace briefing, context, or verification;
- [ ] current process manager behavior unchanged;
- [ ] no new dependency.

Run `npm run stress` only if implementation introduces shared socket state/concurrency (the plan intentionally avoids this).

## Task 6 — Documentation and completion

**Files**
- Update after verified implementation: `FEATURES.md`, `README.md`, `FAQ.md`, `SECURITY.md`, `config.example.env`.
- Update durable project docs: `PROJECT_MEMORY.md`, `PLAN_INDEX.md`, `CONTEXT_MAP.md`, `DECISIONS.md`, `CHANGELOG.md`.

**Documentation requirements**
- State clearly that the capability is default-off, Full-only, loopback HTTP GET/HEAD only.
- State that GET transport semantics do not guarantee the target endpoint is side-effect-free.
- State that CodexPro does not verify workspace ownership of the target port in v1.
- Do not describe it as browser automation, API testing, monitoring, or arbitrary network access.

**Completion evidence**
- [ ] focused network security smoke pass;
- [ ] settings/admin/diagnostics smoke pass;
- [ ] build pass;
- [ ] full smoke pass;
- [ ] `git diff --check` pass;
- [ ] final diff confirms only one new public tool and one default-off capability;
- [ ] Plan status changes to Verified only after exact implementation evidence exists.
