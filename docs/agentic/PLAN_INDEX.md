# CodexPro Plan Index

Plans 01–11 baseline: 2026-09-05; execution was authorized and those plans are Verified. Roadmap extension: 2026-09-06; **Plans 12–21 are planning-only and are not execution-authorized.** Their detailed subsystem specs/plans and the unified one-go execution controller are prepared. Status values: Planned → Approved → In Progress → Verified → Released. Update status only from evidence.

| ID | Priority | Subsystem | Features covered | Design | Implementation plan | Status |
|---|---|---|---|---|---|---|
| 01 | P0 | 0.31 Maintenance Baseline | #5 0.31 Maintenance Release | [spec](../superpowers/specs/2026-09-05-maintenance-baseline-design.md) | [plan](../superpowers/plans/2026-09-05-maintenance-baseline.md) | Verified |
| 02 | P0 | Workspace Policy | #6 Per-workspace policy file | [spec](../superpowers/specs/2026-09-05-workspace-policy-design.md) | [plan](../superpowers/plans/2026-09-05-workspace-policy.md) | Verified |
| 03 | P0 | Operation Journal and Concurrency Core | #1 Receipts/status, #26–27 transactions/revert, #35–36 budgets/concurrency | [spec](../superpowers/specs/2026-09-05-operation-core-design.md) | [plan](../superpowers/plans/2026-09-05-operation-core.md) | Verified |
| 04 | P0 | Observability and Diagnostics | #3–4 diagnostics, #20 telemetry, #21 admin diagnostics | [spec](../superpowers/specs/2026-09-05-observability-diagnostics-design.md) | [plan](../superpowers/plans/2026-09-05-observability-diagnostics.md) | Verified |
| 05 | P1 | Workspace Processes and Verification | #7–10 process manager/checks/verification/results | [spec](../superpowers/specs/2026-09-05-process-verification-design.md) | [plan](../superpowers/plans/2026-09-05-process-verification.md) | Verified |
| 06 | P1 | Context, Instructions, Events, Task Continuity | #11–14 reads/search/context/instructions, #22–23 events/checkpoints | [spec](../superpowers/specs/2026-09-05-context-continuity-design.md) | [plan](../superpowers/plans/2026-09-05-context-continuity.md) | Verified |
| 07 | P1 | Git and Repository Intelligence | #17–19 Git/package/change impact, #24–25 guarded writes/preflight | [spec](../superpowers/specs/2026-09-05-git-repository-intelligence-design.md) | [plan](../superpowers/plans/2026-09-05-git-repository-intelligence.md) | Verified |
| 08 | P1 | Codex Session Navigation | #15–16 session search/read-around | [spec](../superpowers/specs/2026-09-05-codex-session-navigation-design.md) | [plan](../superpowers/plans/2026-09-05-codex-session-navigation.md) | Verified |
| 09 | P2 | Optional Code Intelligence Backends | #28–31 CodeGraph/find/LSP/dependency context | [spec](../superpowers/specs/2026-09-05-code-intelligence-design.md) | [plan](../superpowers/plans/2026-09-05-code-intelligence.md) | Verified |
| 10 | P2 | Archive, Document, Artifact I/O | #32–34 archive/document/export | [spec](../superpowers/specs/2026-09-05-artifact-io-design.md) | [plan](../superpowers/plans/2026-09-05-artifact-io.md) | Verified |
| 11 | P3 | Durable Goal Orchestration | #37–40 Goals/Windows/isolation/DAG scheduler | [spec](../superpowers/specs/2026-09-05-goal-orchestration-design.md) | [plan](../superpowers/plans/2026-09-05-goal-orchestration.md) | Verified |
| 12 | P0 | MCP SDK Maintenance and Compatibility | #41 maintained v1 + compatibility seam | [spec](../superpowers/specs/2026-09-06-mcp-sdk-maintenance-design.md) | [plan](../superpowers/plans/2026-09-06-mcp-sdk-maintenance.md) |Verified |
| 13 | P0 | Granular Tool and Resource Policy | #42 action/resource allow-deny rules | [spec](../superpowers/specs/2026-09-06-granular-policy-rules-design.md) | [plan](../superpowers/plans/2026-09-06-granular-policy-rules.md) | Planned |
| 14 | P0 | Trusted Lifecycle Hooks and Project Trust | #43 lifecycle hooks, #44 trust fingerprints | [spec](../superpowers/specs/2026-09-06-trusted-lifecycle-hooks-design.md) | [plan](../superpowers/plans/2026-09-06-trusted-lifecycle-hooks.md) | Planned |
| 15 | P1 | Durable Touched-File Checkpoints | #45 guarded rollback checkpoints | [spec](../superpowers/specs/2026-09-06-durable-checkpoints-design.md) | [plan](../superpowers/plans/2026-09-06-durable-checkpoints.md) | Planned |
| 16 | P1 | Budgeted Context Selection v2 | #46 context v2, #47 subtask context bundle | [spec](../superpowers/specs/2026-09-06-context-v2-design.md) | [plan](../superpowers/plans/2026-09-06-context-v2.md) | Planned |
| 17 | P1 | Unified Activity and Evidence Ledger | #48 bounded activity/evidence ledger | [spec](../superpowers/specs/2026-09-06-activity-ledger-design.md) | [plan](../superpowers/plans/2026-09-06-activity-ledger.md) | Planned |
| 18 | P2 | MCP v2 Compatibility and Multi-Round Approvals | #49 v2 compatibility + one-shot interactive approvals | [spec](../superpowers/specs/2026-09-06-mcp-v2-approvals-design.md) | [plan](../superpowers/plans/2026-09-06-mcp-v2-approvals.md) | Planned |
| 19 | P3 | MCP Tasks Extension Bridge | #50 optional Tasks bridge over existing proc/Goal state | [spec](../superpowers/specs/2026-09-06-mcp-tasks-bridge-design.md) | [plan](../superpowers/plans/2026-09-06-mcp-tasks-bridge.md) | Planned |
| 20 | P1 | Structured Verification Repair Metadata | #51 bounded repair evidence from `verify_changes` | [spec](../superpowers/specs/2026-09-06-verification-repair-metadata-design.md) | [plan](../superpowers/plans/2026-09-06-verification-repair-metadata.md) | Planned |
| 21 | P3 | Optional Docker Execution Backend | #52 host/Docker execution adapter; Goal support gated | [spec](../superpowers/specs/2026-09-06-docker-execution-backend-design.md) | [plan](../superpowers/plans/2026-09-06-docker-execution-backend.md) | Planned |

## Execution rule
Plans 12–21 remain **Planned** until the user explicitly authorizes implementation. For single-plan authorization, refresh execution-time state and execute that subsystem independently. For explicit all-plans authorization, use the [Plans 12–21 unified execution plan](../superpowers/plans/2026-09-06-roadmap-12-21-execution.md) on one isolated cumulative integration worktree/branch. Each subsystem still requires its own spec read, focused contracts, review, verification, status evidence, and milestone commit; batch authorization does not merge their acceptance criteria into one generic gate.

A running CodexPro runtime must remain untouched unless the user separately approves stopping it for a required operation. Agents may never start or restart CodexPro; after an approved stop it must remain stopped. The unified plan defines how to defer global reinstall when this runtime boundary prevents it.

## Recommended next implementation sequence
`12 → 13 → 14 → 15 → 16 → 17 → 20 → 18 → 19 → 21`

Plans 15–17 are largely independent once their existing 0.32 foundations are refreshed, but the sequence above prioritizes protocol/policy safety first. Plan 20 should follow context v2 so repair evidence can reuse better impact/context ranking. Plan 18 must follow 12 and 13. Plan 19 is capability-gated on Plan 18 plus current MCP/ChatGPT support. Plan 21 is deliberately last/deferred and must never weaken Goal/worktree isolation merely to make Docker work.
