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
