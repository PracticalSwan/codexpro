# CodexPro Plan Index

Planning baseline: 2026-09-05. Execution authorized: 2026-09-05. Status values: Planned → Approved → In Progress → Verified → Released. Update status only from evidence.

| ID | Priority | Subsystem | Features covered | Design | Implementation plan | Status |
|---|---|---|---|---|---|---|
| 01 | P0 | 0.31 Maintenance Baseline | #5 0.31 Maintenance Release | [spec](../superpowers/specs/2026-09-05-maintenance-baseline-design.md) | [plan](../superpowers/plans/2026-09-05-maintenance-baseline.md) | Verified |
| 02 | P0 | Workspace Policy | #6 Per-workspace policy file | [spec](../superpowers/specs/2026-09-05-workspace-policy-design.md) | [plan](../superpowers/plans/2026-09-05-workspace-policy.md) | Verified |
| 03 | P0 | Operation Journal and Concurrency Core | #1 Operation Receipts, #2 operation_status, #26 Transactional change sets, #27 Revert operation, #35 Resource budgeting, #36 Workspace concurrency coordinator | [spec](../superpowers/specs/2026-09-05-operation-core-design.md) | [plan](../superpowers/plans/2026-09-05-operation-core.md) | Verified |
| 04 | P0 | Observability and Diagnostics | #3 Connection Diagnostics, #4 Tool-Surface Diagnostics, #20 Local telemetry, #21 Admin diagnostics dashboard | [spec](../superpowers/specs/2026-09-05-observability-diagnostics-design.md) | [plan](../superpowers/plans/2026-09-05-observability-diagnostics.md) | Verified |
| 05 | P1 | Workspace Processes and Verification | #7 Workspace Process Manager, #8 run_checks, #9 verify_changes, #10 Structured Test Results | [spec](../superpowers/specs/2026-09-05-process-verification-design.md) | [plan](../superpowers/plans/2026-09-05-process-verification.md) | Verified |
| 06 | P1 | Context, Instructions, Events, and Task Continuity | #11 read_many, #12 search_many, #13 gather_context, #14 instructions_for_path, #22 Workspace event cursor, #23 Durable task checkpoint | [spec](../superpowers/specs/2026-09-05-context-continuity-design.md) | [plan](../superpowers/plans/2026-09-05-context-continuity.md) | Verified |
| 07 | P1 | Git and Repository Intelligence | #17 Read-only Git history tools, #18 Monorepo / package graph, #19 Change Impact Tool, #24 Guarded Git write tools, #25 Pre-commit safety scan | [spec](../superpowers/specs/2026-09-05-git-repository-intelligence-design.md) | [plan](../superpowers/plans/2026-09-05-git-repository-intelligence.md) | Verified |
| 08 | P1 | Codex Session Navigation | #15 Codex Session Search, #16 read_codex_session_around | [spec](../superpowers/specs/2026-09-05-codex-session-navigation-design.md) | [plan](../superpowers/plans/2026-09-05-codex-session-navigation.md) | Verified |
| 09 | P2 | Optional Code Intelligence Backends | #28 Optional CodeGraph integration, #29 find_files / fuzzy file search, #30 LSP intelligence adapter, #31 Dependency-aware context selection | [spec](../superpowers/specs/2026-09-05-code-intelligence-design.md) | [plan](../superpowers/plans/2026-09-05-code-intelligence.md) | Verified |
| 10 | P2 | Archive, Document, and Artifact I/O | #32 Safe archive import, #33 Document inspection, #34 File export back to ChatGPT | [spec](../superpowers/specs/2026-09-05-artifact-io-design.md) | [plan](../superpowers/plans/2026-09-05-artifact-io.md) | Verified |
| 11 | P3 | Durable Goal Orchestration | #37 Durable Goal orchestration, #38 Windows Goal execution, #39 Isolated execution environments, #40 Task dependency scheduler | [spec](../superpowers/specs/2026-09-05-goal-orchestration-design.md) | [plan](../superpowers/plans/2026-09-05-goal-orchestration.md) | Verified |

## Execution rule
Select one subsystem, refresh Git/upstream/PR state, read its design and plan, and execute it independently. If upstream merged related work after this planning baseline, reconcile that work before implementation rather than reapplying the plan mechanically.

## Recommended first execution sequence
`01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11`

Plans 08 and parts of 06 can be implemented earlier if they remain independent after state refresh, but Goal work (11) must wait for operation/process/Git foundations.
