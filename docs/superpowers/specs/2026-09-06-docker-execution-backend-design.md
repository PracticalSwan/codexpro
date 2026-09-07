# Optional Docker Execution Backend Design

**Date:** 2026-09-06
**Status:** In Progress - Windows Stage A verified; Goals host-only; Linux live validation pending
**Priority:** P3 / deferred
**Plan ID:** 21
**Depends on:** 03, 05, 11, 13

## Goal
Add an optional Docker-backed execution mode for trusted project commands while preserving the current host backend as the default and keeping Docker completely optional.

## Feature covered
- **#52 — optional Docker execution backend**

## Research rationale
OpenHands and similar harnesses gain stronger reproducibility/isolation from container execution. CodexPro should adopt only the narrow execution-backend idea, not a container orchestration platform. The feature must remain local, explicit, and compatible with the existing operation/process/Goal layers.

## Current-state fit
- `runBash()` owns bounded one-shot command execution and safe/full Bash policy.
- `WorkspaceProcessManager` owns long-running workspace processes.
- Goal task execution reuses `runBash()`/`runChecks()` inside detached Git worktrees.
- Existing config already controls environment inheritance, output limits, timeouts, and process count.

## Architecture
Introduce one execution-backend seam with two adapters: `host` and `docker`. The host adapter preserves current behavior. Docker is selected only by explicit configuration and invokes the user-installed Docker CLI; CodexPro never installs Docker or pulls images automatically. Stage A covers one-shot Bash and workspace processes. Stage B enables Goal tasks only after a live worktree/Git metadata compatibility probe passes on the target platform.

## Proposed files
**Create**
- `src/execution/types.ts`
- `src/execution/hostBackend.ts`
- `src/execution/dockerBackend.ts`
- `src/execution/index.ts`
- `scripts/execution-backend-smoke.mjs`
- `scripts/docker-backend-live-smoke.mjs`

**Modify when implementation is authorized**
- `src/config.ts`
- `src/bashOps.ts`
- `src/processOps.ts`
- `src/runtimeState.ts`
- `src/goals/runner.ts`
- `src/server.ts`
- `src/http.ts`
- `scripts/process-smoke.mjs`
- `scripts/goals-smoke.mjs`
- `SECURITY.md`, `FEATURES.md`, `config.example.env`, `CHANGELOG.md`
## Planned interfaces
```ts
export type ExecutionBackendKind = "host" | "docker";

export interface ExecutionRequest {
  workspace: Workspace;
  command: string;
  cwd: string;
  timeoutMs: number;
}

export interface ExecutionBackend {
  readonly kind: ExecutionBackendKind;
  run(request: ExecutionRequest): Promise<BashExecutionResult>;
  start(request: ExecutionRequest): Promise<BackendProcessHandle>;
  stop(handle: BackendProcessHandle): Promise<void>;
}

export interface DockerExecutionConfig {
  executable: string;
  image: string;
  network: "none";
  memoryMb: number;
  cpus: number;
  pidsLimit: number;
}
```

## Requirements
- D-001: `executionBackend="host"` remains the default and must preserve all existing command/process/Goal behavior.
- D-002: Docker mode is opt-in and unavailable unless the configured Docker executable is present, Docker daemon access works, and the configured image already exists locally.
- D-003: CodexPro shall never install Docker, enable Docker Desktop, authenticate a registry, or auto-pull/build an image in normal runtime operation.
- D-004: Docker containers mount only the selected workspace root at `/workspace`; no host home, credential directory, Docker socket, arbitrary extra mount, or parent directory is exposed.
- D-005: Containers run without `--privileged`, without host PID/IPC, with `--network none`, bounded memory/CPU/PIDs, bounded output, and the existing host-side timeout/termination controls.
- D-006: Docker mode shall not inherit the host environment. Only a small fixed non-secret environment required for deterministic execution may be set explicitly.
- D-007: Existing Bash safe/full authorization happens before backend dispatch; selecting Docker shall never widen command authority.
- D-008: Workspace cwd is translated only after `PathGuard` containment succeeds; container paths are generated from normalized workspace-relative paths.
- D-009: Long-running containers are owned by `WorkspaceProcessManager`, receive deterministic labels/IDs, and are stopped/removed on explicit stop or CodexPro shutdown.
- D-010: Stage B Goal support is disabled until a real isolated-worktree probe proves that required Git/worktree semantics can be represented without mounting unrelated repository/credential state writable into the container.
- D-011: If Stage B cannot satisfy D-010 on a platform, Goals remain on the host backend even when ordinary Bash/process Docker mode is available; this degradation is explicit in diagnostics.
- D-012: Docker unavailability must not hide or break host execution; diagnostics report unavailable/degraded state without automatic fallback from an explicitly requested Docker execution call unless configuration says host.
## Docker command contract
For Stage A, the adapter constructs a deterministic command equivalent to:

```text
docker run --rm --init \
  --network none \
  --memory <bounded>m --cpus <bounded> --pids-limit <bounded> \
  --mount type=bind,src=<canonical-workspace>,dst=/workspace \
  --workdir /workspace/<relative-cwd> \
  --label codexpro.workspace=<workspace-id> \
  <preexisting-image> /bin/sh -lc <command>
```

The implementation must use argument arrays (`spawn`/`spawnSync`) rather than composing one shell command containing host paths or untrusted arguments.

## Goal/worktree compatibility gate
Before advertising Docker for Goals, the live probe shall:
1. create a temporary local Git repository and detached worktree;
2. run the same Goal backend mapping that production would use;
3. prove `git status`/required project checks work without writable access to unrelated host repository state;
4. modify a disposable worktree file and prove the source checkout remains unchanged;
5. clean up the container/worktree even after forced failure.

If that probe requires broad writable mounting of the source repository's Git metadata, Stage B is rejected and Goal execution remains host-only.

## Security and privacy
- Docker is an additional isolation layer, not a replacement for CodexPro authorization or PathGuard.
- Do not mount credentials, SSH agents, cloud config, browser state, Docker socket, or the host home directory.
- Do not pass CodexPro HTTP/auth tokens into containers.
- Do not claim Docker is a complete security sandbox; Docker daemon/rootless/runtime configuration remains operator-owned.
- Container names/labels and diagnostics contain bounded IDs, not source contents or secrets.

## Error and failure model
- Missing Docker executable/daemon/image -> structured unavailable result; no automatic install/pull.
- Mount/path translation failure -> fail before container creation.
- Timeout/cancel -> terminate then remove the owned container; record cleanup failure separately.
- Output remains governed by existing retained/observed byte limits.
- Container exit code maps to existing Bash/process result semantics so callers do not learn a second execution model.
- Unsupported Windows/macOS Docker Desktop behavior is capability-gated, not silently emulated.

## Verification strategy
- Pure adapter/argument tests in `scripts/execution-backend-smoke.mjs` run without Docker.
- Optional live test `scripts/docker-backend-live-smoke.mjs` runs only when an explicit test image is configured and proves real container lifecycle/mount/output/timeout behavior.
- `npm run build`, focused process/Goal smoke, `npm run smoke`, and `npm run stress` because process/resource behavior changes.
- Live Windows plus Linux validation is required before Docker mode is documented as supported.
- `git diff --check` and dependency/release checks if implementation changes package dependencies (none are expected).
## Alternatives considered
1. **Make Docker mandatory.** Rejected; local host execution is core CodexPro behavior and must remain dependency-light.
2. **Use Docker SDK/library dependency.** Rejected initially; the existing external-adapter policy favors the user-installed CLI and avoids a daemon-specific package dependency.
3. **Mount the entire host filesystem or Docker socket.** Rejected because that defeats the isolation goal.
4. **Automatically pull a default image.** Rejected because registry/network/credential side effects require explicit operator action.
5. **Implement a second Goal scheduler for containers.** Rejected; Docker is only an execution adapter under existing process/Goal orchestration.

## Non-goals
- Kubernetes, Podman abstraction, remote Docker hosts, or container orchestration
- image building/pulling/registry authentication
- arbitrary extra bind mounts
- privileged containers or Docker-in-Docker
- network-enabled container execution in this plan
- claiming hostile-code containment equivalent to a hardened VM sandbox
- replacing host execution

## Completion criteria
Host execution remains behaviorally unchanged. Docker Stage A is explicit, bounded, local-image-only, and verified through the real Bash/process surfaces. No credentials or unrelated paths are mounted. Containers are cleaned up deterministically. Goal Docker support is advertised only where the worktree compatibility gate passes; otherwise diagnostics explicitly report Goals as host-only.
