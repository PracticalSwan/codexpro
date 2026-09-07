# Optional Docker Execution Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Stage A implemented and live-verified on Windows on 2026-09-07 in the authorized Plans 12-21 batch. The Goal worktree compatibility gate resolves to host-only with the required workspace-only mount boundary. Linux-host live validation remains pending because the available WSL environment has Docker but no Node runtime, and this plan forbids installing missing tooling.

**Goal:** Add an opt-in Docker execution backend for one-shot Bash and workspace processes, then enable Goal task execution only where a live worktree/Git compatibility gate proves it safe.

**Architecture:** Create one execution-backend seam with host and Docker adapters. Host remains the default and preserves current behavior. Docker invokes the user-installed CLI with argument arrays, a single workspace bind mount, no network, bounded resources, and no automatic image pull. Existing `runBash`, `WorkspaceProcessManager`, and Goal orchestration stay authoritative above the seam.

**Tech Stack:** Node.js 20+, TypeScript, Node `child_process`, user-installed Docker CLI as an optional adapter; no Docker npm dependency expected.

**Spec:** `docs/superpowers/specs/2026-09-06-docker-execution-backend-design.md`

## Global Constraints
- `host` remains the default execution backend and must preserve 0.32.3 behavior.
- Docker is opt-in, local-image-only, and never installed/pulled/authenticated by CodexPro.
- Existing safe/full Bash, workspace policy, PathGuard, operation receipts, output limits, timeouts, and process ownership remain authoritative before backend dispatch.
- Docker mounts only the selected workspace; no home/credentials/Docker socket/arbitrary parent mount.
- Docker runs with network disabled, no privileged/host PID/IPC, and bounded memory/CPU/PIDs.
- Goal Docker support is a second-stage capability gate, not assumed from ordinary Docker availability.
- Windows and Linux live behavior must be proven before support is advertised.
- Do not commit, push, publish, deploy, install Docker/images, or mutate external services unless later explicitly authorized.

**Plan dependencies:** 03, 05, 11, 13.

---
## File Structure
- Create: `src/execution/types.ts` — backend-neutral request/result/handle types.
- Create: `src/execution/hostBackend.ts` — adapter over current host command/process behavior.
- Create: `src/execution/dockerBackend.ts` — Docker CLI argument generation/lifecycle.
- Create: `src/execution/index.ts` — backend selection/status seam.
- Create: `scripts/execution-backend-smoke.mjs` — pure/host compatibility contracts.
- Create: `scripts/docker-backend-live-smoke.mjs` — explicit live Docker validation.
- Modify: `src/config.ts`, `src/bashOps.ts`, `src/processOps.ts`, `src/runtimeState.ts`.
- Modify Stage B only after gate: `src/goals/runner.ts` and Goal smoke coverage.
- Modify product surfaces after verification: `src/server.ts`, `src/http.ts`, docs/config/changelog.

## Planned Interfaces
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

export function resolveExecutionBackend(
  config: CodexProConfig,
  workspace: Workspace
): ExecutionBackend;
```
### Task 1: Establish host-parity and Docker-safety RED contracts

**Files:**
- Create: `scripts/execution-backend-smoke.mjs`
- Read: `src/bashOps.ts`, `src/processOps.ts`, `src/goals/runner.ts`, `src/config.ts`

**Produces:** regression coverage that prevents the backend seam from changing current host behavior and defines Docker argument/security requirements.

- [ ] **Step 1: Recover execution-time state, Docker availability, target OS, and current command/process behavior before editing.**
- [ ] **Step 2: Add a host-parity fixture that executes the same bounded command through current host execution and the planned host adapter; assert exit code, stdout/stderr, timeout, cwd, and redaction behavior match.**
- [ ] **Step 3: Add pure Docker command-construction tests without requiring Docker.**

```js
assert.ok(args.includes("--network") && args.includes("none"));
assert.ok(args.includes("--pids-limit"));
assert.ok(args.some((v) => v.includes("dst=/workspace")));
assert.ok(!args.includes("--privileged"));
assert.ok(!args.some((v) => /docker\.sock|\.ssh|USERPROFILE|HOME/.test(v)));
```

- [ ] **Step 4: Test canonical Windows and Unix workspace/cwd translation plus rejection of cwd escapes before any container command is generated.**
- [ ] **Step 5: Run `npm run build && node scripts/execution-backend-smoke.mjs`; expected RED is absence of the backend seam/Docker adapter while baseline host behavior passes.**
- [ ] **Step 6: Commit only if later authorized. Suggested message: `test: define execution backend contracts`.**
### Task 2: Introduce the backend seam with a behavior-preserving host adapter

**Files:**
- Create: `src/execution/types.ts`
- Create: `src/execution/hostBackend.ts`
- Create: `src/execution/index.ts`
- Modify: `src/bashOps.ts`
- Modify: `src/processOps.ts`
- Test: `scripts/execution-backend-smoke.mjs`

**Produces:** one real seam with a `host` adapter; no Docker runtime behavior yet.

- [ ] **Step 1: Move only execution mechanics behind `ExecutionBackend`; leave command authorization, Bash session checks, cwd PathGuard validation, operation receipts, and output shaping in their current owning modules.**
- [ ] **Step 2: Implement `hostBackend.run/start/stop` by reusing current spawn/termination primitives, not by duplicating shell-policy logic.**
- [ ] **Step 3: Make `resolveExecutionBackend()` return host unconditionally until Task 3 adds validated configuration.**
- [ ] **Step 4: Route `runBash` and `WorkspaceProcessManager` through the host adapter and prove the full existing focused tests remain byte/semantics compatible where public output is stable.**
- [ ] **Step 5: Run `npm run build`, `node scripts/execution-backend-smoke.mjs`, and `node scripts/process-smoke.mjs`; expected all host-parity cases PASS.**
- [ ] **Step 6: Commit if authorized. Suggested message: `refactor: add execution backend seam`.**

### Task 3: Implement Docker adapter and explicit configuration

**Files:**
- Create: `src/execution/dockerBackend.ts`
- Modify: `src/execution/index.ts`
- Modify: `src/config.ts`
- Modify: `src/server.ts`, `src/http.ts` only for sanitized status/config surfaces
- Test: `scripts/execution-backend-smoke.mjs`

**Produces:** opt-in Stage A Docker backend for Bash/process execution.
- [ ] **Step 1: Add bounded config fields with host-preserving defaults.**

```ts
executionBackend: "host" | "docker";   // default "host"
dockerExecutable?: string;              // explicit/validated command path/name
dockerImage?: string;                   // required when backend=docker
dockerMemoryMb: number;                 // bounded positive integer
dockerCpus: number;                     // bounded positive number
dockerPidsLimit: number;                // bounded positive integer
```

- [ ] **Step 2: On Docker selection, probe only `docker version`/`docker image inspect <configured-image>` through argument arrays; fail closed if daemon/image is unavailable. Do not run `docker pull`, `docker build`, login, or installer commands.**
- [ ] **Step 3: Build `docker run` arguments with `--rm --init --network none`, bounded resource flags, one canonical workspace bind mount, translated `/workspace/<cwd>`, deterministic CodexPro labels, and the configured pre-existing image.**
- [ ] **Step 4: Pass the command as the container shell argument after existing host-side command authorization; never compose host paths into an intermediate shell string.**
- [ ] **Step 5: Ensure container environment is independently constructed and contains no CodexPro auth token, host credential variables, or inherited home/cloud/SSH state.**
- [ ] **Step 6: Add sanitized backend availability/status to existing diagnostics/admin output without exposing local absolute paths or image registry credentials.**
- [ ] **Step 7: Run pure focused tests and build. A real Docker daemon/image is not required for this task’s deterministic argument/unit coverage.**

### Task 4: Integrate long-running container lifecycle with `WorkspaceProcessManager`

**Files:**
- Modify: `src/processOps.ts`
- Modify: `src/runtimeState.ts`
- Modify: `src/execution/dockerBackend.ts`
- Test: `scripts/process-smoke.mjs`
- Test: `scripts/execution-backend-smoke.mjs`

- [ ] **Step 1: Give each managed Docker process a bounded CodexPro-owned container identity/label and retain it only inside the existing process entry.**
- [ ] **Step 2: Map stdout/stderr chunks through the same observed/retained byte accounting and cursor semantics as host processes.**
- [ ] **Step 3: Implement stop/shutdown by terminating then removing only the owned container; unknown/non-owned container identifiers are rejected.**
- [ ] **Step 4: Exercise timeout, spawn failure, normal exit, explicit stop, CodexPro shutdown, output flooding, and cleanup-failure reporting without changing operation-receipt semantics.**
- [ ] **Step 5: Run focused process tests, `npm run build`, and `npm run stress` because process/resource lifecycle behavior changed.**
### Task 5: Gate Goal execution behind a real worktree compatibility probe

**Files:**
- Create/modify: `scripts/docker-backend-live-smoke.mjs`
- Modify only after gate passes: `src/goals/runner.ts`
- Modify: `src/execution/index.ts`
- Test: `scripts/goals-smoke.mjs`, `scripts/goals-windows-smoke.mjs`

**Produces:** explicit `goalDockerAvailable` capability; Goal backend remains host-only if the probe cannot preserve the spec boundary.

- [ ] **Step 1: Require an explicit live-test image via environment/CLI for the probe; if absent, report `not tested` rather than downloading one.**
- [ ] **Step 2: In an OS-temp disposable Git repo, create a detached worktree using the same Goal isolation path pattern as production.**
- [ ] **Step 3: Attempt the minimum safe mount mapping needed for containerized project commands and `git status`. Do not mount the source checkout, host home, credentials, or broad Git metadata writable merely to make the probe pass.**
- [ ] **Step 4: Mutate one disposable worktree file in the container and verify the source checkout remains byte-identical; then force a failure and verify container/worktree cleanup.**
- [ ] **Step 5: If safe Git/worktree semantics cannot be achieved on the platform, set Goal Docker capability unavailable and stop Stage B implementation. This is an acceptable planned outcome, not a reason to weaken mounts.**
- [ ] **Step 6: Only after the probe passes, route Goal task command/check execution through the same backend selection used by Bash/checks and add Windows/Linux regression coverage. Projection remains host-side and unchanged.**
- [ ] **Step 7: Run Goal focused suites plus `npm run stress`; record platform-specific evidence before advertising Goal Docker support.**

### Task 6: Live Docker validation, documentation, and final review

**Files:**
- Modify after verified behavior: `FEATURES.md`, `SECURITY.md`, `config.example.env`, `CHANGELOG.md`, `docs/agentic/PLAN_INDEX.md`, `docs/agentic/PROJECT_MEMORY.md`

- [ ] **Step 1: On each supported platform, use a pre-existing explicitly supplied test image and run `scripts/docker-backend-live-smoke.mjs` through real one-shot, long-running, timeout, output-limit, cwd, and cleanup paths.**
- [ ] **Step 2: Prove `host` mode still passes the complete normal smoke suite with no Docker dependency or daemon requirement.**
- [ ] **Step 3: Run `npm run build`, `npm run smoke`, `npm run stress`, and `git diff --check`; run dependency audit/release-pack checks if package metadata changes.**
- [ ] **Step 4: Document Docker as an optional adapter, list exact no-network/no-extra-mount/no-auto-pull boundaries, and state whether Goals are supported or host-only on each verified platform.**
- [ ] **Step 5: Perform spec-compliance review followed by defect-first security/portability review, with special attention to mount escapes, credential leakage, container ownership, and cleanup.**
- [ ] **Step 6: Update durable status only from live evidence. Commit/push/release only if separately authorized.**
## Non-goals for this plan
- Kubernetes or container orchestration
- Podman/general runtime abstraction
- remote Docker daemon support
- automatic image pull/build/login
- arbitrary user-defined bind mounts
- host/home/credential/Docker-socket mounts
- network-enabled containers
- privileged execution
- replacing CodexPro policy/PathGuard with Docker
- claiming hardened VM-grade sandboxing

## Self-review checklist before implementation handoff
- [ ] Host mode remains the default and behavior-preserving.
- [ ] Docker is an adapter under existing execution/process/Goal ownership, not a second scheduler.
- [ ] No normal runtime path installs Docker or obtains an image.
- [ ] Every mount is derived from the selected workspace and explicitly bounded.
- [ ] Safe/full Bash policy is enforced before backend dispatch.
- [ ] Goal Docker support can remain disabled without compromising Stage A.
- [ ] Windows and Linux live validation requirements are explicit.
- [ ] No task requires weakening credentials, network, mounts, or Git isolation merely to make Docker work.
