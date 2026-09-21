# CodexPro Full — Consolidation-First Architecture Roadmap

Last reconciled: 2026-09-22

## Current direction

CodexPro Full already has the core capabilities needed for serious local development: guarded workspace/file mutation, Git intelligence, processes/checks/jobs, resumable analysis, Durable Goals, policy/trust controls, CodeGraph/LSP adapters, artifact I/O, diagnostics, durable long-work primitives, and guarded local administration.

The engineering risk is no longer missing breadth. It is feature density: each additional scheduler, protocol bridge, UI, or execution subsystem multiplies cross-platform tests and maintenance cost.

The roadmap is therefore consolidation-first:

1. improve operator lifecycle and build provenance;
2. improve the existing admin/diagnostics UX;
3. deepen existing context/provider integration;
4. add narrow read-only notebook and table understanding;
5. improve first-turn workspace orientation and verification failure evidence;
6. then use real project evidence before adding more features.

`PLAN_INDEX.md` is the authoritative status router. This document records architecture direction, not implementation status.

## Current architecture

```text
ChatGPT / MCP
      |
      v
MCP compatibility + tool registration
      |
      +--> Policy / PathGuard / project trust
      +--> Files / Git / artifacts
      +--> Context / repository intelligence
      +--> Processes / checks / jobs / batches
      +--> Durable Goals
      +--> Diagnostics / local admin
      |
      v
Local explicitly allowed workspaces
```

## What is already sufficient

Do not create parallel replacements for these areas:

- **Context:** `gather_context`, dependency ranking, instructions, Git evidence, cache, resumable batches.
- **Long work:** `proc_*`, `job_*`, `batch_*`, Durable Goals.
- **Verification:** `run_checks`, `verify_changes`, repair metadata, change impact, preflight, activity evidence.
- **UI/operations:** authenticated local admin page + optional MCP tool cards.
- **Repository intelligence:** built-in analysis plus optional CodeGraph/LSP provider seam.
- **Task continuity:** explicit task snapshots plus Git/worktree/process/job/batch/Goal state.
- **Execution isolation:** host default plus verified optional Windows Docker Stage A.

New designs should reuse these seams before proposing another public abstraction.

## Active roadmap

### Plan 38 — Runtime Lifecycle and Build Provenance (P0)
Problem solved: operators currently lack supported runtime `status`/guarded `stop`, and source builds after a release are hard to distinguish from the tagged SemVer.

Design direction:

- reuse existing runtime records and process ownership evidence;
- add local CLI `status` and exact-owner `stop`;
- graceful termination first, exact Windows tree fallback only after ownership proof;
- never add agent restart/start authority;
- embed non-secret build revision/channel at package/build time;
- expose provenance through version, doctor, `server_config`, and local diagnostics.

### Plan 39 — Operator UX and Diagnostics Polish (P0)

Improve the existing authenticated admin/profile/diagnostic surfaces rather than creating a second dashboard. Show a compact runtime overview, current-vs-next-launch state, deterministic capability explanations, and read-only profile list/show commands. Never auto-enable permissions.

### Plan 40 — Context and Code-Intelligence Provider Integration (P1)

Merge bounded optional CodeGraph/LSP evidence into existing symbol-oriented `gather_context`. Preserve built-in fallback and ranking priority. No persistent LSP manager, editor protocol platform, new context database, or new public context tool.

### Plan 41 — Structured Notebook Inspection (P1)

Add one read-only `read_notebook` tool for bounded notebook structure, selected cells, metadata, text/error outputs, and MIME names. No kernel, execution, editing, Python/Jupyter dependency, or dataframe engine.

### Plan 42 — AI-Ready Workspace Briefing v2 (P0)

Deepen `workspace_snapshot` into one bounded first-turn project briefing using existing Git, instruction, inventory, check, durable-work, and capability evidence. Add deterministic `attention_required` items. No new tool, store, embeddings, or model call.
### Plan 43 — Verification Failure Context Pack (P0/P1)

Attach bounded parsed failure location, changed paths, related tests, focused context locations, and trusted reproduction guidance to existing synchronous and async verification results. ChatGPT remains responsible for diagnosis and repair; CodexPro does not auto-edit or recursively retry.

### Plan 44 — Structured Dataset / Table Inspection (P1)

Add one read-only bounded `inspect_table` tool for CSV, TSV, JSONL, and NDJSON with primitive type inference, null/quality counts, basic numeric summaries, and deterministic samples. No Python/pandas, SQL engine, charting, or persistent dataset store.

## Deliberately retired or frozen scope

### Interactive MCP approvals / Tasks bridge

The delivered MCP SDK v2 compatibility seam remains. The unfinished interactive-approval bridge and MCP Tasks bridge are retired because they are host-dependent and duplicate mature CodexPro primitives without a concrete current benefit.

### Docker expansion

Keep the verified optional Windows Stage A backend for one-shot Bash/workspace processes. Goals remain host-only. Linux-host validation and Goal Docker work are not active roadmap items.

## Explicitly rejected scope

- model/provider routing, quota/account pooling, or model unlocking;
- autonomous recursive model/subagent loops inside CodexPro;
- another YAML/workflow scheduler beside Durable Goals;
- generic browser automation, messaging-control channels, or remote desktop;
- debugger/profiler platform;
- full IDE/LSP lifecycle platform;
- notebook execution/kernel/dataframe platform;
- mandatory Docker, CodeGraph, LSP, browser, or external service;
- automatic push/merge/deploy/publish or approval bypass;
- default cloud storage of source, prompts, transcripts, or secrets.

## Design rules for future proposals

1. **Demonstrate the gap from real use.** Solve repeated observed limitations, not feature-parity pressure.
2. **Deepen before adding.** Prefer extending an existing tool/module over another top-level tool.
3. **One state machine per problem.** Do not create task/job/work-session abstractions that mirror existing durable state.
4. **Keep semantic reasoning in the host model.** CodexPro supplies bounded evidence, execution, persistence, policy, and recovery.
5. **Fail closed at external capability boundaries.** Client/platform uncertainty is not permission to emulate unsupported behavior.
6. **Keep Windows first-class without making Windows-only assumptions in shared interfaces.**
7. **No dependency for convenience.** New packages require a concrete capability gap and proportional audit/package review.
8. **Measure surface growth.** New public tools and persistent stores require explicit justification because Full mode is already large.

## Recommended execution order

```text
Plan 38 runtime lifecycle/provenance
        ↓
Plan 39 operator UX/diagnostics
        ↓
Plan 40 context/provider integration
        ↓
Plan 41 notebook inspection
        ↓
Plan 42 workspace briefing
        ↓
Plan 43 verification failure context
        ↓
Plan 44 table inspection
        ↓
real-project usage / defect evidence
```

Do not schedule another broad roadmap extension until these items are completed or deliberately dropped and real-world usage identifies the next high-value gap.
