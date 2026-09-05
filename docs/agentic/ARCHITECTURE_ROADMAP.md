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
