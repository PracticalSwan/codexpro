# Durable Goals

Durable Goals are an opt-in CodexPro 0.32 feature for deterministic multi-step local execution. They are disabled by default and require full tool mode, workspace write mode, Bash access, Git, and a platform-capable Goal storage location.

Enable with:

```text
CODEXPRO_GOALS=1
```

Optional bounds:

```text
CODEXPRO_GOAL_DIR=~/.codexpro/goals
CODEXPRO_MAX_GOALS=128
CODEXPRO_MAX_GOAL_TASKS=64
CODEXPRO_MAX_GOAL_WORKERS=4
```

A workspace policy can disable Goals or lower these ceilings; it cannot enable or broaden them.
## Lifecycle

1. `propose_goal` persists a bounded DAG and returns its SHA-256 proposal fingerprint.
2. `approve_goal` requires that exact fingerprint but does not execute anything.
3. `start_goal` snapshots source HEAD/working-state evidence and creates a detached Git worktree.
4. A detached local worker runs only dependency-ready approved tasks with bounded concurrency. It may survive the initiating MCP connection.
5. Successful execution stops at `awaiting_review`.
6. `review_goal` validates the isolated patch, runs preflight checks, and pins a review fingerprint.
7. `project_goal` requires the original source HEAD/fingerprint, exact review fingerprint, and `authorize=true`.

Pause, resume, and cancel update durable scheduler control state. Recovery never repeats a task left indeterminately `running`; it fails closed instead.

## Safety boundaries

Goal execution never commits, pushes, merges, publishes, deploys, or uploads automatically. Projection applies only the reviewed patch to an unchanged source working state and refuses overlap with files that were already dirty when execution began.
The private Goal store records bounded task metadata, state, hashes, verification summaries, and operation IDs. It does not persist task stdout/stderr, prompts, authentication tokens, unrestricted source snapshots, or hidden model reasoning.

Detached worker runtime snapshots explicitly remove HTTP auth, Git push authority, artifact export, CodeGraph/LSP activation, and Codex session access. Goal task mutations still pass through the existing Bash/check policy, operation journal, resource budgets, and workspace guards.

The private worktree path is not returned through Goal MCP responses.

## Platform behavior

Goal tools are advertised only when CodexPro can resolve Git and find a writable existing ancestor for Goal storage. Windows is tested with detached Git worktrees and cross-process PID locks; unavailable platforms fail closed by hiding the Goal tools.

Goal execution currently requires the selected workspace root to be the Git repository root. Nested project roots inside a larger repository are rejected rather than silently executing against a wider source tree.
