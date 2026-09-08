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

## D-019 — The configured synchronous deadline is a transport boundary, not a quality target
**Decision:** Tool-time awareness is enabled by default. Normal synchronous handling is bounded at `1,200,000` ms (20 minutes), configurable from 5–60 minutes; explicit Unlimited/observe mode exists only for temporary harmless host-window discovery and does not turn normal work into unbounded synchronous execution. No timing mode lowers scope, acceptance criteria, reasoning/review depth, required tests, or safety checks. Work that cannot finish correctly inside one call must yield to a truthful durable continuation.
**Why:** Host/tool closure windows may differ or change, so the operator needs a safety-margin setting; optimizing the model to finish before any chosen cutoff would still trade correctness for latency. CodexPro should preserve the complete goal across calls. The implemented runtime/profile contract carries `syncCallDeadlineMode` plus the finite `syncCallDeadlineMs` reference, and the authenticated admin editor distinguishes saved next-run values from the current runtime.
**Revisit only if:** the host platform exposes a reliable negotiated deadline/continuation primitive; even then, the quality-preservation invariant remains.

## D-020 — Long work uses distinct existing/durable execution roles
**Decision:** Long shell commands remain owned by `proc_*`; structured long operations may use a bounded persistent `job_*` substrate; expensive in-process scans may use `batch_*` cursors; multi-stage isolated engineering remains owned by Durable Goals. A future job substrate must not become another generic command runner or workflow DSL.
**Why:** Separating execution roles keeps ownership, cancellation, persistence, policy, and recovery understandable while solving the tool-window problem without duplicating proven process/Goal machinery.

## D-021 — Browser continuation is human-gated, not a restriction bypass
**Decision:** A future continuation companion may maintain task-aware readiness and bind/focus one ChatGPT conversation, but continuation is optional/default-off and version 1 may submit only after a contemporaneous explicit user authorization from the browser **Continue task** button or the exactly paired Telegram inline action. It may not scrape ChatGPT output, auto-submit, click approvals/login/safety controls, or attempt to bypass host tool/session restrictions.
**Why:** Conversation resumption must preserve user control and product/security boundaries rather than converting a transport limit into an autonomous browser loop.

## D-022 — ChatGPT authentication state belongs to a dedicated browser profile
**Decision:** Browser continuation uses a CodexPro-managed dedicated Chrome/Edge profile by default. Passwords, cookies, 2FA/passkeys, and provider authentication remain browser/user-controlled; CodexPro stores only coarse auth health and profile metadata. Implementation and live QA must STOP for user authentication and resume only after the user sends `continue`.
**Why:** Reusing/copying a personal browser profile or automating credentials would expose unrelated account data and create a much larger trust surface.

## D-023 — Browser pairing has separate least privilege
**Decision:** The continuation browser companion uses a loopback-only credential distinct from the main CodexPro MCP/admin token. Its authority is limited to continuation status/events and cannot invoke MCP tools, filesystem/Bash/Git/Goal operations, or arbitrary DOM scripts.
**Why:** A compromised webpage or extension must not become a path to local development authority.

## D-024 — Continuation timing follows current runtime generation and transport truth
**Decision:** Browser/watchdog readiness consumes the current running CodexPro `syncCallDeadlineMs`, a per-launch runtime generation, and local transport-ready state. Saved next-run settings and the 20-minute default are never substituted as current timing authority. Runtime/tunnel loss or generation/reconnect changes reset inferred-interruption timing and cannot auto-start/reconnect CodexPro.
**Why:** Otherwise deadline changes, restarts, deliberate tunnel shutdowns, sleep/wake gaps, or stale runtime-status files can create false continuation opportunities.

## D-025 — User interaction, terminal task state, and ambiguous ChatGPT UI fail closed
**Decision:** `completed`/`canceled` task revisions invalidate outstanding continuation authorization. Manual user message submission or Stop-generating pauses inferred continuation until semantic reconciliation. Streaming, generic platform-busy/error/retry/safety/unknown states suppress continuation; the companion never auto-retries, switches models, or dismisses blocking controls.
**Why:** Browser UI state cannot reliably determine semantic task intent or why ChatGPT is delayed, so terminal/user intent and uncertainty must take precedence over automation.

## D-026 — Telegram continuation buttons are remote user authorization, not autonomy
**Decision:** Optional Telegram continuation uses a dedicated private bot over outbound long polling. A validated inline-button callback from the exactly paired private user/chat may create one short-lived `ContinuationDispatchAuthorization` for the current task revision/nonce/intent; the managed browser must still re-check transport/auth/binding/page safety before one send. Bot token and paired identifiers stay in protected per-user state, not workspace profiles.
**Why:** This gives the user a practical remote approval surface without restoring an autonomous continuation loop or exposing another public inbound/admin channel.

## D-027 — Final continuation acceptance uses a fresh ChatGPT-session report handoff
**Decision:** After implementation and package installation, final operator acceptance includes a new ChatGPT conversation with CodexPro Full available. That session exercises the installed runtime using disposable continuation state and emits a sanitized Markdown report that the user copies back to the maintenance conversation. The test session does not modify CodexPro source unless separately authorized.
**Why:** A fresh session validates real connector/runtime behavior independently of the implementation conversation while keeping the evidence review human-controlled and reproducible.

## D-028 — Tool-time awareness is baseline; conversation continuation is opt-in
**Decision:** Deadline/tool-time awareness and durable long-work routing are baseline behavior enabled independently of continuation. Browser continuation defaults off; Telegram defaults off and is unavailable until continuation is enabled. Operators may opt into either later without changing the baseline execution model.
**Why:** Users benefit from avoiding host-window failures even if they do not want browser automation, persistent browser login, or Telegram setup.

## D-029 — Manual user turns outrank prepared continuation
**Decision:** An ordinary user message or Stop-generating action in the bound chat invalidates prepared browser/Telegram authorization without reading message text. The continuation task pauses until the host model reconciles the current user prompt as resume, redirect within the same task, supersede with a new task, or cancel; ambiguity remains paused.
**Why:** A user's new prompt can intentionally continue, redirect, or replace prior work. Treating it as either automatic cancellation or automatic continuation would violate user intent and can create duplicate turns.
