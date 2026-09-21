# CodexPro Full — Consolidation-First Architecture Roadmap

Last reconciled: 2026-09-22

## Current direction

CodexPro Full already has the core capabilities needed for serious local development: guarded workspace/file mutation, Git intelligence, processes/checks/jobs, resumable analysis, Durable Goals, policy/trust controls, CodeGraph/LSP adapters, artifact I/O, diagnostics, and optional task continuation.

The current engineering risk is no longer missing breadth. It is **feature density**: every additional scheduler, browser state machine, protocol bridge, UI, or execution subsystem multiplies cross-platform tests and maintenance cost.

The roadmap therefore changes from expansion-first to **consolidation-first**:

1. finish the one remaining continuation acceptance gate;
2. improve operator lifecycle and provenance;
3. improve the existing admin/diagnostics UX;
4. deepen existing context/provider integration;
5. add one narrowly scoped missing read-only notebook capability;
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
      +--> Optional human-gated continuation
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
- **Task continuity:** snapshots plus optional continuation lifecycle.
- **Execution isolation:** host default plus verified optional Windows Docker Stage A.

New designs should reuse these seams before proposing another public abstraction.

## Active roadmap

### Plan 36 — Close continuation acceptance, then freeze

Plan 36 remains the only unfinished work from the browser/Telegram continuation program. Perform the documented installed-runtime fresh-session acceptance exactly once when intentionally authorized.

After it passes, continuation is feature-frozen except for evidence-backed defects. Do not expand it into generic browser automation, UI testing, automatic login/Retry/model switching, extra messaging transports, or remote desktop control.

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

Problem solved: the existing admin/profile/diagnostic state is powerful but too raw for simple operational questions.

Design direction:

- improve the existing authenticated admin page instead of creating a second dashboard;
- show a compact current-runtime overview;
- separate current runtime from saved-next-launch settings;
- explain why major capabilities are unavailable using deterministic reason codes;
- add read-only profile list/show CLI commands;
- never auto-enable permissions or bypass workspace policy.

### Plan 40 — Context and Code-Intelligence Provider Integration (P1)

Problem solved: optional CodeGraph/LSP evidence is already used by structured search but is not deeply reused by symbol-oriented `gather_context`.

Design direction:

- reuse the current provider seam;
- merge bounded guarded provider matches/reasons into existing context candidates;
- preserve built-in fallback and ranking priority;
- no persistent LSP manager, no editor protocol platform, no new context database, and no new public context tool.

### Plan 41 — Structured Notebook Inspection (P1)

Problem solved: `.ipynb` files are currently noisy raw JSON to CodexPro.

Design direction:

- add one read-only `read_notebook` tool;
- parse notebook JSON, selected cells, metadata, text/error outputs, and MIME names;
- never start a kernel or execute/edit notebooks in v1;
- no Python/Jupyter dependency or dataframe engine.

## Deliberately retired or frozen scope

### Interactive MCP approvals / Tasks bridge

The already delivered MCP SDK v2 compatibility seam remains. The unfinished interactive-approval bridge and MCP Tasks bridge are retired as active implementation plans because they are host-dependent and duplicate mature CodexPro primitives without a current concrete benefit.

Protocol evolution remains a research/watch item. Reopen only when the connected client exposes a stable capability that materially improves over existing `proc_*`, `job_*`, `batch_*`, Goals, and policy fingerprints.

### Docker expansion

Keep the verified optional Windows Stage A backend for one-shot Bash/workspace processes. Goals remain host-only. Linux-host validation and Goal Docker work are not active roadmap items. Reopen from an actual portability/isolation requirement, not completeness pressure.

### Browser automation

The managed browser exists only for optional human-gated continuation. It is not a general browser testing or remote-control foundation.

## Explicitly rejected scope

- model/provider routing, quota/account pooling, or model unlocking;
- autonomous recursive model/subagent loops inside CodexPro;
- another YAML/workflow scheduler beside Durable Goals;
- generic browser automation or remote desktop;
- debugger/profiler platform;
- full IDE/LSP lifecycle platform;
- notebook execution/kernel/dataframe platform;
- mandatory Docker, CodeGraph, LSP, browser, or external service;
- automatic push/merge/deploy/publish or approval bypass;
- default cloud storage of source, prompts, transcripts, or secrets.

## Design rules for future proposals

1. **Demonstrate the gap from real use.** A feature should solve a repeated observed limitation, not merely match another agent product.
2. **Deepen before adding.** Prefer an option/helper/provider integration inside an existing public tool over another top-level tool.
3. **One state machine per problem.** Do not create new task/job/work-session abstractions that mirror existing durable state.
4. **Keep semantic reasoning in the host model.** CodexPro supplies bounded evidence, execution, persistence, policy, and recovery.
5. **Fail closed at external capability boundaries.** Host/client/platform uncertainty is not permission to emulate unsupported protocol behavior.
6. **Keep Windows first-class without making Windows-only assumptions in shared interfaces.**
7. **No dependency for convenience.** New dependencies require a concrete capability gap, lockfile/audit/package review, and a simpler-standard-library rejection reason.
8. **Measure surface growth.** New public tools and new persistent stores need explicit justification because Full mode is already large.

## Recommended execution order

```text
Plan 36 acceptance closure
        ↓
Plan 38 runtime lifecycle/provenance
        ↓
Plan 39 operator UX/diagnostics
        ↓
Plan 40 context/provider integration
        ↓
Plan 41 notebook inspection
        ↓
real-project usage / defect evidence
```

Do not schedule another broad roadmap extension until these items are either completed or deliberately dropped and real-world usage identifies the next high-value gap.
