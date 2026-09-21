# Plan 38 — Runtime Lifecycle and Build Provenance Design

Created: 2026-09-22
Status: Planned
Priority: P0

## Problem

CodexPro already persists enough runtime state to identify an active launcher/server/tunnel, but operators still lack a supported `codexpro status` and `codexpro stop` workflow. During maintenance this forces manual process-tree inspection on Windows and makes cleanup dependent on implementation knowledge.

The installed package also reports only the SemVer from `package.json`. A source build made after a tagged release can therefore identify itself as `0.32.4` even when it contains later commits. This makes maintenance evidence, installed-runtime diagnosis, and bug reports unnecessarily ambiguous.

## Goals

- Add a read-only `codexpro status` command for the selected workspace/profile.
- Add a guarded `codexpro stop` command that stops only the recorded CodexPro-owned runtime tree.
- Add build provenance that distinguishes package version from source revision/channel.
- Surface the same sanitized provenance through CLI, `server_config`, doctor, and local diagnostics.
- Keep lifecycle behavior deterministic on Windows first without weakening macOS/Linux behavior.

## Non-goals

- No `restart` command.
- No agent-controlled automatic start/restart.
- No broad process-name termination such as killing every `node.exe` or `codexpro` process.
- No new daemon/service manager.
- No runtime auto-update, package installation, or release publication.
- No secret, token, absolute-path, or tunnel credential disclosure.
- No Git requirement at runtime for a packaged installation.

## Existing seams to reuse

- `scripts/codexpro.mjs`
  - `saveRuntimeConnection()`
  - `updateRuntimeTransportState()`
  - `clearRuntimeConnection()`
  - existing process helpers and runtime status files
  - CLI subcommand dispatch
- `src/profileStore.ts`
  - `RuntimeConnection`
  - `readRuntimeConnection()`
- `src/packageIdentity.ts`
  - package name/version identity
- `src/server.ts`
  - `server_config`
- `src/diagnosticsOps.ts`
  - sanitized diagnostics aggregation
- `src/http.ts`
  - local status/admin projection
- existing Windows process identity patterns in Jobs, Goals, continuation, and smoke tests

## Design

### 1. Build identity

Introduce a small focused `src/buildIdentity.ts` module. It owns a stable public shape:

```ts
export interface BuildIdentity {
  packageName: string;
  version: string;
  revision: string | null;
  channel: "release" | "main" | "source" | "unknown";
}

export function buildIdentity(): BuildIdentity;
export function displayVersion(identity: BuildIdentity): string;
```

The package build/release pipeline writes optional non-secret build metadata into the packaged artifact. Runtime code must not shell out to Git.

Expected display behavior:

- tagged/release package with no extra revision: `0.32.4`
- source/main package with revision: `0.32.4+main.88f570c`
- verbose surfaces retain full revision separately.

A missing metadata file is valid and degrades to `revision=null`, `channel="unknown"`.

### 2. Runtime status

Add a pure status resolver in the launcher layer that reads the existing runtime record and verifies:

1. runtime record belongs to the selected canonical root;
2. launcher PID is alive and matches the expected recorded process identity when identity data exists;
3. server PID is alive when recorded;
4. local health endpoint is queried only when it is loopback and token material is already available through protected local state;
5. stale records are reported as stale rather than silently treated as running.

Public status must expose bounded fields only:

```text
state: running | stopped | stale | degraded
launcher_pid
runtime_pid
transport
tunnel
local_port
generation_id
package_version
build_revision
build_channel
```

Paths follow current redaction/path-label rules.

### 3. Guarded stop

`codexpro stop` is an explicit user CLI action. It:

1. resolves the target root/profile;
2. loads the recorded runtime;
3. refuses when no owned runtime can be proven;
4. verifies the launcher/server identity before signaling;
5. requests graceful termination first;
6. waits a bounded interval;
7. on Windows only, may tree-terminate the exact verified owned launcher tree if graceful termination fails;
8. re-checks process death and port release;
9. removes only stale runtime/lease files that still bind to the exact terminated runtime identity.

The command must never identify targets by executable name alone.

### 4. Runtime lifecycle ownership

This feature does not change the project rule that agents must never start or restart CodexPro. The CLI feature exists for the human operator. Agent workflows may inspect `status`; an agent may invoke `stop` only when the user explicitly authorized that stop in the current task.

### 5. Diagnostics integration

Add build identity to:

- `codexpro --version --verbose`
- `codexpro doctor`
- `server_config`
- `/admin/diagnostics`
- local admin overview

Do not add a new MCP lifecycle mutation tool. Lifecycle stop remains a local CLI operator action.

## Failure behavior

- Stale PID/reused PID: fail closed; do not signal.
- Runtime record malformed: report stale/invalid; do not signal.
- Port still occupied by an unrelated process after target exit: report port occupied; do not kill the occupant.
- Health endpoint unavailable while process is alive: state is `degraded`, not `stopped`.
- Build metadata unavailable: show package version and `revision=unknown`.
- Tunnel child already absent: stop still succeeds if the owned launcher/server tree is correctly stopped.

## Security and privacy requirements

- Never print auth tokens, secret file paths, Telegram identifiers, browser routes, or private tunnel credentials.
- Reuse existing redaction and process-start-identity checks.
- No broad process enumeration is required for the normal path.
- Runtime cleanup must be exact-owner cleanup only.
- Build metadata contains only package/version/revision/channel/build timestamp if later justified; no username, machine name, local path, or environment snapshot.

## Acceptance criteria

- `codexpro status` correctly distinguishes stopped, running, stale, and degraded fixtures.
- `codexpro status --json` is stable and secret-free.
- `codexpro stop` refuses reused/stale/unowned PID fixtures.
- On Windows, exact owned-tree stop releases the expected port without terminating an unrelated Node process.
- Stale runtime metadata is removed only after exact ownership is proven.
- `--version` remains backward compatible; `--version --verbose` adds provenance.
- Packaged source revision is visible in `server_config`, doctor, and admin diagnostics.
- Fresh release packaging contains no repository path or secret.
- Existing runtime lifecycle rule remains documented and unchanged for agents.

## Verification

Focused lifecycle/provenance smoke first, then:

```text
npm run build
npm run smoke
git diff --check
npm audit --audit-level=high   # only if packaging/dependency inputs change
npm run release:pack           # required because build metadata affects package contents
```

Use stress only if process-stop concurrency behavior changes beyond the narrow owned-tree path.
