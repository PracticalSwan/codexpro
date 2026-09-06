# CodexPro Architecture Decisions

## D-001 — Preserve the local trust boundary
**Decision:** New features remain inside explicitly allowed local workspaces and existing mode gates. CodexPro does not become a model proxy, quota/approval bypass, cloud code store, or unrestricted remote shell.
**Why:** This is the product's core safety and positioning contract.
**Revisit only if:** the product itself is intentionally re-scoped by maintainers with a new security model.

## D-002 — Operation journal before broader autonomy
**Decision:** Durable operation receipts, idempotency, budgets, and shared concurrency precede process management, guarded Git writes, and Goal orchestration.
**Why:** Response loss and duplicate mutation are foundational correctness risks.

## D-003 — One mutation/concurrency core
**Decision:** File, Git, process, and Goal mutations use one operation/lease subsystem rather than independent locks and journals.
**Why:** Cross-tool races cannot be solved reliably by per-tool locks.

## D-004 — External intelligence stays optional
**Decision:** CodeGraph, fff/ffgrep, and language servers are user-installed adapters with safe built-in fallbacks. CodexPro does not silently install them.
**Why:** Keep installation predictable and avoid mandatory native/daemon dependencies.

## D-005 — Dedicated tools before generic Bash
**Decision:** Common Git history, verification, process, and repository-intelligence operations get structured dedicated tools; Bash remains available according to configured mode for cases that genuinely require shell behavior.
**Why:** Structured tools are easier to bound, diagnose, test, and reason about.

## D-006 — Windows is first-class
**Decision:** New process, path, Git, journal, and Goal behavior must have explicit Windows semantics and tests before Windows capability is advertised.
**Why:** Existing maintenance history shows platform mismatches create real correctness/security failures.

## D-007 — Durable memory contains facts, not hidden reasoning
**Decision:** Project/task memory may store goals, decisions, evidence, hashes, files, status, and remaining work, but never model chain-of-thought, raw secrets, or unrestricted transcript/source dumps.
**Why:** Continuity should improve without creating a new sensitive-data sink.

## D-008 — CodexPro remains a harness, not a model router
**Decision:** Research-driven improvements deepen local policy, context, verification, recovery, evidence, and protocol interoperability. CodexPro does not add model-provider routing, account pooling, or its own autonomous LLM loop.
**Why:** The host model already owns semantic reasoning; duplicating that role would expand scope and weaken the product boundary.

## D-009 — MCP modernization is staged behind one compatibility seam
**Decision:** Move the current MCP dependency to the maintained v1 line first and preserve behavior. MCP v2/2026 interaction features are a separate capability-gated plan with live ChatGPT validation.
**Why:** Protocol/package upgrades and behavior changes should not be coupled into one high-risk migration.

## D-010 — Fine-grained project policy remains tightening-only
**Decision:** Per-action/resource rules may deny or narrow calls but cannot re-enable capabilities disabled by the profile/global configuration. Interactive `ask` is deferred until a verified MCP approval interaction exists.
**Why:** Repository-owned configuration must never self-escalate authority.

## D-011 — Executable hooks require external project trust
**Decision:** Lifecycle hooks use a minimal event set and cannot run solely because hook configuration exists in a repository. Trust/fingerprints live outside the repository; changed executable hook configuration invalidates prior trust.
**Why:** Opening or pulling an untrusted repository must not grant repository-controlled code execution.

## D-012 — Durable rollback snapshots only CodexPro-touched files
**Decision:** Checkpoints persist bounded preimages for allowed files CodexPro intends to mutate, guarded by before/after hashes. Do not shadow-copy entire repositories by default.
**Why:** Full-repository snapshots increase secret/privacy/storage risk and can overwrite unrelated user work.

## D-013 — Improve context selection inside the existing analysis seam
**Decision:** Context v2 extends `gather_context`/analysis ranking with explicit strategies, budgets, reasons, and incremental caching rather than adding a new mandatory repository-index subsystem.
**Why:** The repository already has dependency ranking and optional CodeGraph/LSP seams; deeper selection gives more value with less architecture.

## D-014 — Evidence aggregation and repair guidance stay non-semantic
**Decision:** The activity ledger and verification repair contract aggregate deterministic bounded evidence only. They do not store hidden reasoning, generate patches, or autonomously retry repairs.
**Why:** Users need auditability and actionable feedback without creating another model/state machine inside the harness.

## D-015 — New MCP interaction/task features are client-capability gated
**Decision:** Multi-round approvals and MCP Tasks are advertised only when the official stable interface and connected ChatGPT client demonstrate support. Existing `proc_*`, `goal_*`, and approval fingerprints remain canonical fallbacks/internal state.
**Why:** CodexPro must not break older clients or duplicate existing durable schedulers to chase evolving protocol features.

## D-016 — Docker is an optional execution adapter, never the default
**Decision:** Host execution remains the default. Docker, if implemented, uses a pre-existing local image, no network/privileged/extra mounts, no automatic install/pull, and may remain unavailable for Goals when safe worktree semantics cannot be proven.
**Why:** Container isolation can improve reproducibility, but only if it does not create a larger credential/mount/orchestration surface than the problem it solves.

## D-017 — Batch roadmap execution preserves subsystem gates
**Decision:** When the user explicitly authorizes multiple roadmap plans in one run, use one isolated cumulative integration worktree/branch but keep each subsystem's spec, RED/GREEN work, review, verification, status evidence, and milestone commit distinct. Merge/push/global reinstall only after the final cumulative gate.
**Why:** A continuous run should reduce coordination overhead without sacrificing auditability, rollback points, dependency clarity, or the ability to identify the exact milestone that introduced a regression.

## D-018 — CodexPro runtime lifecycle is user-controlled
**Decision:** Agents may not stop a running CodexPro runtime without explicit user approval for that stop and may never start or restart CodexPro. If stopping is approved, stop only the required CodexPro-owned process tree and leave it stopped. If global reinstall requires an unapproved stop, defer the reinstall instead of disrupting the live runtime.
**Why:** A running CodexPro instance is an active user-owned control channel. Automatically terminating or recreating it can sever the session, alter tunnel state, and create side effects outside the source-code change being implemented.
