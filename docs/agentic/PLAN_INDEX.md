# CodexPro Plan Index

Last reconciled: 2026-09-22

This file is the authoritative roadmap/status router. Historical implementation detail stays in the linked subsystem documents and Git history; current development should start from the active items below rather than resurrecting completed umbrella batches.

Status values: `Planned` → `Approved` → `In Progress` → `Verified` → `Released`; `Retired` means unfinished speculative scope was deliberately removed; `Frozen` means the verified current scope is retained without active expansion.

## Foundation and delivered capability

| ID | Priority | Subsystem | Authoritative design / plan | Status |
|---|---|---|---|---|
| 01 | P0 | 0.31 Maintenance Baseline | [design](../superpowers/specs/2026-09-05-maintenance-baseline-design.md) · [plan](../superpowers/plans/2026-09-05-maintenance-baseline.md) | Verified |
| 02 | P0 | Workspace Policy | [design](../superpowers/specs/2026-09-05-workspace-policy-design.md) · [plan](../superpowers/plans/2026-09-05-workspace-policy.md) | Verified |
| 03 | P0 | Operation Journal and Concurrency Core | [design](../superpowers/specs/2026-09-05-operation-core-design.md) · [plan](../superpowers/plans/2026-09-05-operation-core.md) | Verified |
| 04 | P0 | Observability and Diagnostics | [design](../superpowers/specs/2026-09-05-observability-diagnostics-design.md) · [plan](../superpowers/plans/2026-09-05-observability-diagnostics.md) | Verified |
| 05 | P1 | Workspace Processes and Verification | [design](../superpowers/specs/2026-09-05-process-verification-design.md) · [plan](../superpowers/plans/2026-09-05-process-verification.md) | Verified |
| 06 | P1 | Context, Instructions, Events, Task Continuity | [design](../superpowers/specs/2026-09-05-context-continuity-design.md) · [plan](../superpowers/plans/2026-09-05-context-continuity.md) | Verified |
| 07 | P1 | Git and Repository Intelligence | [design](../superpowers/specs/2026-09-05-git-repository-intelligence-design.md) · [plan](../superpowers/plans/2026-09-05-git-repository-intelligence.md) | Verified |
| 08 | P1 | Codex Session Navigation | [design](../superpowers/specs/2026-09-05-codex-session-navigation-design.md) · [plan](../superpowers/plans/2026-09-05-codex-session-navigation.md) | Verified |
| 09 | P2 | Optional Code Intelligence Backends | [design](../superpowers/specs/2026-09-05-code-intelligence-design.md) · [plan](../superpowers/plans/2026-09-05-code-intelligence.md) | Verified |
| 10 | P2 | Archive, Document, Artifact I/O | [design](../superpowers/specs/2026-09-05-artifact-io-design.md) · [plan](../superpowers/plans/2026-09-05-artifact-io.md) | Verified |
| 11 | P3 | Durable Goal Orchestration | [design](../superpowers/specs/2026-09-05-goal-orchestration-design.md) · [plan](../superpowers/plans/2026-09-05-goal-orchestration.md) | Verified |
| 12 | P0 | MCP SDK Maintenance and Compatibility Seam | [design](../superpowers/specs/2026-09-06-mcp-sdk-maintenance-design.md) · [plan](../superpowers/plans/2026-09-06-mcp-sdk-maintenance.md) | Verified |
| 13 | P0 | Granular Tool and Resource Policy | [design](../superpowers/specs/2026-09-06-granular-policy-rules-design.md) · [plan](../superpowers/plans/2026-09-06-granular-policy-rules.md) | Verified |
| 14 | P0 | Trusted Lifecycle Hooks and Project Trust | [design](../superpowers/specs/2026-09-06-trusted-lifecycle-hooks-design.md) · [plan](../superpowers/plans/2026-09-06-trusted-lifecycle-hooks.md) | Verified |
| 15 | P1 | Durable Touched-File Checkpoints | [design](../superpowers/specs/2026-09-06-durable-checkpoints-design.md) · [plan](../superpowers/plans/2026-09-06-durable-checkpoints.md) | Verified |
| 16 | P1 | Budgeted Context Selection v2 | [design](../superpowers/specs/2026-09-06-context-v2-design.md) · [plan](../superpowers/plans/2026-09-06-context-v2.md) | Verified |
| 17 | P1 | Unified Activity and Evidence Ledger | [design](../superpowers/specs/2026-09-06-activity-ledger-design.md) · [plan](../superpowers/plans/2026-09-06-activity-ledger.md) | Verified |
| 18 | — | Interactive MCP approvals beyond the delivered compatibility seam | Historical partial implementation is recorded in Git/project memory; remaining host-dependent scope was removed on 2026-09-22. | Retired |
| 19 | — | MCP Tasks bridge | Speculative host-dependent bridge deliberately removed; existing `proc_*`, `job_*`, `batch_*`, and Goals remain canonical. | Retired |
| 20 | P1 | Structured Verification Repair Metadata | [design](../superpowers/specs/2026-09-06-verification-repair-metadata-design.md) · [plan](../superpowers/plans/2026-09-06-verification-repair-metadata.md) | Verified |
| 21 | P3 | Optional Docker Execution Backend | [design](../superpowers/specs/2026-09-06-docker-execution-backend-design.md) · [plan](../superpowers/plans/2026-09-06-docker-execution-backend.md) | Frozen |

Plan 21's retained product scope is the already verified Windows Stage A host/Docker adapter for one-shot Bash and workspace processes. Goals remain host-only and Linux-host live validation is not active roadmap work; revisit only from a concrete user need and fresh safety evidence.

## Deadline resilience and durable long work

| ID | Priority | Subsystem | Authoritative design / plan | Status |
|---|---|---|---|---|
| 22 | P0 | Configurable Synchronous Deadline + Quality Contract | [design](../superpowers/specs/2026-09-08-tool-deadline-resilience-design.md) · [plan](../superpowers/plans/2026-09-08-synchronous-deadline-quality-contract.md) | Verified |
| 23 | P0 | Composite Verification Deadline Propagation | [plan](../superpowers/plans/2026-09-08-composite-verification-deadlines.md) | Verified |
| 24 | P1 | Durable Structured Job Core | [plan](../superpowers/plans/2026-09-08-durable-job-core.md) | Verified |
| 25 | P1 | Asynchronous Verification Jobs | [plan](../superpowers/plans/2026-09-08-async-verification-jobs.md) | Verified |
| 26 | P0 | Deadline-Aware Execution Routing | [plan](../superpowers/plans/2026-09-08-execution-routing-quality-instructions.md) | Verified |
| 27 | P1 | Resumable Non-Process Batches | [plan](../superpowers/plans/2026-09-08-resumable-batch-operations.md) | Verified |
| 28 | P1 | Deadline Observability and Diagnostics | [plan](../superpowers/plans/2026-09-08-deadline-observability-diagnostics.md) | Verified |

These are baseline behavior, not pending roadmap work. New long-running features must reuse the existing `proc_*`, `job_*`, `batch_*`, and Goal roles instead of creating another scheduler.

## Optional task-aware continuation

| ID | Priority | Subsystem | Authoritative design / plan | Status |
|---|---|---|---|---|
| 29 | P0 | Durable Continuation Lifecycle | [design](../superpowers/specs/2026-09-08-task-aware-browser-continuation-design.md) · [plan](../superpowers/plans/2026-09-08-continuation-lifecycle-api.md) | Verified |
| 30 | P0 | Browser Companion and Pairing | [plan](../superpowers/plans/2026-09-08-browser-companion-pairing.md) | Verified |
| 31 | P0 | Managed Browser Auth and Durable State | [plan](../superpowers/plans/2026-09-08-managed-browser-auth-state.md) | Verified |
| 32 | P0 | Conversation Binding and User Dispatch | [plan](../superpowers/plans/2026-09-08-conversation-binding-user-continuation.md) | Verified |
| 33 | P0 | Continuation Watchdog and Recovery | [plan](../superpowers/plans/2026-09-08-continuation-watchdog-recovery.md) | Verified |
| 34 | P1 | Continuation Settings and Admin UX | [plan](../superpowers/plans/2026-09-08-continuation-settings-admin.md) | Verified |
| 35 | P0 | Continuation Runtime Integration | [plan](../superpowers/plans/2026-09-08-continuation-runtime-integration.md) | Verified |
| 36 | P0 | Continuation Security and Fresh-Session Acceptance | [plan](../superpowers/plans/2026-09-08-continuation-security-release-qa.md) | In Progress |
| 37 | P0 | Telegram Remote Continuation Authorization | [plan](../superpowers/plans/2026-09-08-telegram-continuation-authorization.md) | Verified |

Plan 36 is the only remaining continuation work: perform the already documented installed-runtime fresh-session acceptance once. Browser/Telegram continuation remains optional/default-off. After Plan 36 closes, freeze this subsystem except for evidence-backed defects; do not expand it into generic browser automation, automatic Retry/login/model switching, extra messaging transports, or remote desktop control.

## Active consolidation roadmap

| ID | Priority | Subsystem | Authoritative design / plan | Status |
|---|---|---|---|---|
| 38 | P0 | Runtime Lifecycle and Build Provenance | [design](../superpowers/specs/2026-09-22-runtime-lifecycle-build-provenance-design.md) · [plan](../superpowers/plans/2026-09-22-runtime-lifecycle-build-provenance.md) | Planned |
| 39 | P0 | Operator UX and Diagnostics Polish | [design](../superpowers/specs/2026-09-22-operator-ux-diagnostics-design.md) · [plan](../superpowers/plans/2026-09-22-operator-ux-diagnostics.md) | Planned |
| 40 | P1 | Context and Code-Intelligence Provider Integration | [design](../superpowers/specs/2026-09-22-context-provider-integration-design.md) · [plan](../superpowers/plans/2026-09-22-context-provider-integration.md) | Planned |
| 41 | P1 | Structured Notebook Inspection | [design](../superpowers/specs/2026-09-22-notebook-inspection-design.md) · [plan](../superpowers/plans/2026-09-22-notebook-inspection.md) | Planned |

## Recommended sequence

`36 closure → 38 → 39 → 40 → 41`

Plans 38 and 39 may be implemented together only if explicitly authorized, because both touch launcher/admin diagnostics; otherwise keep each plan independently verifiable. Plans 40 and 41 are independent P1 improvements and should not delay P0 operator reliability work.

## Roadmap guardrails

- Prefer deepening an existing tool/module over adding another top-level MCP tool.
- New top-level tools require a genuinely distinct operation; Full mode already has a large surface.
- Do not build another workflow engine, model router, browser automation platform, debugger platform, notebook execution service, or context database.
- MCP protocol/Tasks/interactive-approval evolution is research-only until stable client support creates a concrete benefit over current primitives.
- Existing Docker support stays optional and frozen at proven scope until a concrete need justifies reopening it.
- Plans describe intended future work; source + tests + current runtime evidence determine what actually exists.
