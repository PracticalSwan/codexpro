# CodexPro Further-Development Architecture Roadmap

Created: 2026-09-05

## Target architecture
```text
ChatGPT / MCP
      |
      v
Tool registration + mode gates (`server.ts`)
      |
      +--> Context / repository intelligence
      +--> Verification / workspace processes
      +--> File / Git / artifact operations
      +--> Diagnostics / local admin
      +--> Goal orchestration
                  |
                  v
         Operation + Policy Core
          /        |        \
     PathGuard   Leases    Journal/Budgets
```

## Dependency order
1. Reconcile/release the current maintenance baseline.
2. Add workspace policy and the operation/concurrency core.
3. Add diagnostics/observability.
4. Build process verification and context continuity on those foundations.
5. Expand Git/repository intelligence and Codex-session navigation.
6. Add optional code-intelligence providers and artifact I/O.
7. Build durable Goal orchestration only after operation/process/Git foundations are proven.

## Feature mapping
| # | Feature | Priority | Plan | Depends on plan(s) |
|---:|---|---|---|---|
| 5 | 0.31 Maintenance Release | P0 | 01 — 0.31 Maintenance Baseline | baseline |
| 6 | Per-workspace policy file | P0 | 02 — Workspace Policy | 01 |
| 1 | Operation Receipts | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 2 | operation_status | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 26 | Transactional change sets | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 27 | Revert operation | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 35 | Resource budgeting | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 36 | Workspace concurrency coordinator | P0 | 03 — Operation Journal and Concurrency Core | 01, 02 |
| 3 | Connection Diagnostics | P0 | 04 — Observability and Diagnostics | 01, 03 |
| 4 | Tool-Surface Diagnostics | P0 | 04 — Observability and Diagnostics | 01, 03 |
| 20 | Local telemetry | P0 | 04 — Observability and Diagnostics | 01, 03 |
| 21 | Admin diagnostics dashboard | P0 | 04 — Observability and Diagnostics | 01, 03 |
| 7 | Workspace Process Manager | P1 | 05 — Workspace Processes and Verification | 03, 04 |
| 8 | run_checks | P1 | 05 — Workspace Processes and Verification | 03, 04 |
| 9 | verify_changes | P1 | 05 — Workspace Processes and Verification | 03, 04 |
| 10 | Structured Test Results | P1 | 05 — Workspace Processes and Verification | 03, 04 |
| 11 | read_many | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 12 | search_many | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 13 | gather_context | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 14 | instructions_for_path | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 22 | Workspace event cursor | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 23 | Durable task checkpoint | P1 | 06 — Context, Instructions, Events, and Task Continuity | 02, 04 |
| 17 | Read-only Git history tools | P1 | 07 — Git and Repository Intelligence | 03, 05, 06 |
| 18 | Monorepo / package graph | P1 | 07 — Git and Repository Intelligence | 03, 05, 06 |
| 19 | Change Impact Tool | P1 | 07 — Git and Repository Intelligence | 03, 05, 06 |
| 24 | Guarded Git write tools | P1 | 07 — Git and Repository Intelligence | 03, 05, 06 |
| 25 | Pre-commit safety scan | P1 | 07 — Git and Repository Intelligence | 03, 05, 06 |
| 15 | Codex Session Search | P1 | 08 — Codex Session Navigation | 01 |
| 16 | read_codex_session_around | P1 | 08 — Codex Session Navigation | 01 |
| 28 | Optional CodeGraph integration | P2 | 09 — Optional Code Intelligence Backends | 06, 07 |
| 29 | find_files / fuzzy file search | P2 | 09 — Optional Code Intelligence Backends | 06, 07 |
| 30 | LSP intelligence adapter | P2 | 09 — Optional Code Intelligence Backends | 06, 07 |
| 31 | Dependency-aware context selection | P2 | 09 — Optional Code Intelligence Backends | 06, 07 |
| 32 | Safe archive import | P2 | 10 — Archive, Document, and Artifact I/O | 03, 06 |
| 33 | Document inspection | P2 | 10 — Archive, Document, and Artifact I/O | 03, 06 |
| 34 | File export back to ChatGPT | P2 | 10 — Archive, Document, and Artifact I/O | 03, 06 |
| 37 | Durable Goal orchestration | P3 | 11 — Durable Goal Orchestration | 03, 04, 05, 07 |
| 38 | Windows Goal execution | P3 | 11 — Durable Goal Orchestration | 03, 04, 05, 07 |
| 39 | Isolated execution environments | P3 | 11 — Durable Goal Orchestration | 03, 04, 05, 07 |
| 40 | Task dependency scheduler | P3 | 11 — Durable Goal Orchestration | 03, 04, 05, 07 |

## Cross-cutting acceptance criteria
- Preserve CodexPro as a local MCP bridge for explicitly allowed workspaces; do not add model proxying, quota bypass, or hosted source-code storage.
- All filesystem paths pass through PathGuard and existing blocked-path/redaction rules before use or disclosure.
- New external binaries are optional adapters; CodexPro shall not silently install them unless an existing explicit installer flow already owns that dependency.
- Windows, macOS, and Linux behavior must be explicit; Windows is a first-class target rather than a best-effort fallback.
- Prefer deep modules with small interfaces; keep src/server.ts as registration/orchestration glue rather than adding subsystem business logic there.
- Use existing dependencies first. Any dependency addition requires a documented reason, lockfile review, npm audit, and package-size review.
- Every state-changing feature must preserve unrelated dirty, staged, and untracked user work.
- Tests must prove failure before the fix/feature where practical, then cover the real MCP or CLI path and important platform edge cases.
- Commit and push steps in plans are conditional on explicit execution authorization; planning alone never commits or publishes.

## Non-goals
- No model-provider proxying, model unlocking, rate-limit/quota bypass, or account pooling.
- No automatic approval bypass or hidden external side effects.
- No generic full-machine remote desktop/process-control API.
- No default cloud persistence of workspace source, prompts, transcripts, or secrets.
- No mandatory CodeGraph/LSP/container dependency.
- No autonomous push/merge/deploy path without explicit policy and user authorization.

## 2026-09-06 research-driven roadmap extension

Plans 01–11 are the verified 0.31–0.32 foundation. The following extension was derived from comparison with current Codex, Claude Code, Gemini CLI, OpenCode, Cline, OpenHands, Aider, ZCode/Z-CODE, goose, and current MCP protocol/SDK direction. It deliberately prioritizes deterministic boundaries and interoperability over adding another agent/model orchestration layer.

### Extension architecture
```text
ChatGPT / MCP
      |
      v
MCP compatibility + capability negotiation (12, 18, 19)
      |
      v
Tool registration + granular policy + trusted hooks (13, 14)
      |
      +--> Context selection / subtask bundles (16)
      +--> Verification + repair evidence (20)
      +--> Activity/evidence ledger (17)
      +--> Safe file checkpoints (15)
      |
      v
Existing Operation / Process / Git / Goal cores
      |
      +--> host execution (default)
      +--> optional Docker adapter (21, deferred)
```

### Extension feature mapping
| # | Feature | Priority | Plan | Main dependency |
|---:|---|---|---|---|
| 41 | MCP SDK maintenance + compatibility seam | P0 | 12 | 01, 04 |
| 42 | Granular action/resource allow-deny policy | P0 | 13 | 02, 03, 12 |
| 43 | Minimal lifecycle hooks | P0 | 14 | 03, 04, 13 |
| 44 | Project trust + hook fingerprints | P0 | 14 | 03, 04, 13 |
| 45 | Durable touched-file checkpoints | P1 | 15 | 03, 06 |
| 46 | Budgeted `gather_context` v2 | P1 | 16 | 06, 09 |
| 47 | Bounded subtask context bundles | P1 | 16 | 06, 09 |
| 48 | Unified activity/evidence ledger | P1 | 17 | 03, 04, 05, 11 |
| 49 | MCP v2 compatibility + one-shot approvals | P2 | 18 | 12, 13 |
| 50 | Optional MCP Tasks bridge | P3 | 19 | 18 |
| 51 | Structured verification repair metadata | P1 | 20 | 05, 07, 16 |
| 52 | Optional Docker execution backend | P3 | 21 | 03, 05, 11, 13 |
### Recommended sequence
`12 → 13 → 14 → 15 → 16 → 17 → 20 → 18 → 19 → 21`

The sequence is conservative rather than dependency-minimal: stabilize MCP imports first, then policy/trust, then rollback/context/evidence quality, and only then experimental protocol/container capabilities.

### Extension design rules
- Deepen existing modules before inventing parallel subsystems: improve `gather_context`, `verify_changes`, operation/process/Goal state, and policy seams in place.
- Keep semantic reasoning in the host model; CodexPro supplies deterministic evidence, execution, policy, persistence, and bounded recovery primitives.
- Project configuration may tighten but never widen profile/global authority.
- Hooks cannot override denies and cannot execute until project/config fingerprints are trusted outside the repository.
- Checkpoints capture only CodexPro-touched allowed files; never snapshot an entire repository by default.
- Activity history stores bounded sanitized evidence, not prompts, source dumps, hidden reasoning, or raw secrets.
- MCP v2/input-required/Tasks behavior is capability-gated and must be live-validated against ChatGPT before release claims.
- Docker remains optional, host execution remains default, no image pull/install occurs automatically, and Goal Docker support may remain unavailable if safe worktree semantics cannot be proven.

### Explicitly rejected scope
- model/provider routing or quota/account pooling
- a second workflow YAML/recipe engine beside Durable Goals
- unrestricted recursive subagent orchestration inside CodexPro
- automatic edit/test/self-healing model loops
- plugin marketplace infrastructure
- mandatory Docker, CodeGraph, LSP, or other external runtime
- automatic deployment/publication/merge approval bypass

Authoritative specs/plans for this extension live under `docs/superpowers/specs/2026-09-06-*` and `docs/superpowers/plans/2026-09-06-*`; `docs/agentic/PLAN_INDEX.md` is the routing/status source of truth.

### Unified execution bundle
When the user explicitly authorizes implementing Plans 12–21 together, use `docs/superpowers/plans/2026-09-06-roadmap-12-21-execution.md` as the controller plan. It preserves the sequence above on one isolated cumulative integration worktree/branch while keeping every subsystem's spec, focused tests, review, verification, and milestone commit independent. Integration to `main`, push, and global reinstall occur only after final cumulative verification rather than after every milestone.

Runtime ownership remains outside the roadmap implementation itself: a running CodexPro session must not be stopped without explicit user approval, and agents may never start or restart CodexPro. If a required global reinstall is blocked by the running process and stop approval is absent, the reinstall remains pending while source integration/push may complete when otherwise authorized.
