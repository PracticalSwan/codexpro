# CodexPro Full 0.34.1 ? Reliability, Evidence and Public Documentation

Status: **Locally verified (build, full smoke, stress, audit and installed-package test); hosted release verification pending**. Target release **v0.34.1** per user instruction.

## Source and observed defects
TDS Macro v0.2.3?v0.2.4 usage feedback reported opaque secret-scanning false positives, image-delivery friction, expensive Codex transcript reconstruction, recovery ambiguity after reconnect, and unbound verification evidence. Source inspection shows whole-file scanning in `fsOps.ts` and `preflightOps.ts`; `view_image` already returns native MCP image content; transcript cursors, operation receipts and job state already exist. Do not create a new tool family/agent runner.

## Implementation contract
1. **Security:** Create one bounded, explainable introduced-secret detection function reused by guarded write/edit/change sets, safety preflight and patch additions. Report path/line/rule/baseline without echoing values. Preserve current blocked-path, scope, redaction and fail-closed behavior. A preexisting secret in an unchanged file must not veto unrelated safe edits; newly inserted, duplicated or new-file secrets remain blocked. Preflight may report baseline-only exposure as nonblocking warning. Improve staged-commit rule diagnostics.
2. **Image:** Keep native content, original dimensions and SHA-256. Add a documented explicit size override for screenshots above the old default only if within bounded transport limits. Verify MCP image delivery; don't add OCR, Sharp or desktop automation.
3. **Session observation:** Extend existing opt-in `read_codex_session` with bounded page-delta indicators and message-class counts, referencing existing cursor and page metadata. Raw transcript access remains restricted. Never equate transcript claims with independently verified work.
4. **Recovery:** Optional bounded `workspace_snapshot` recovery section aggregates existing operation receipts, structured jobs, and status without triggering commands or replaying mutations. Mark ambiguous operations explicitly.
5. **Evidence:** Attach Git HEAD and dirty-tree fingerprint before/after verification; mark stale/unknown rather than extrapolating test results from earlier sources. Reuse existing checks/Jobs; no new persistent DB, profiler, or manifest service.
6. **Public repository and docs:** Detect committed secret/privacy risks, redact private local machine details from active public docs, and shorten root README to a user-facing intro/quick start/link hub; preserve documentation in linked files. Modify true global AGENTS.md for public README and safe automatic commit/push conventions.
7. **Release:** Build, smoke, bounded stress when relevant, audit, packaged install, hosted cross-OS CI/Pages and exact-release provenance. Do not touch an active user-owned CodexPro runtime without specific owner stop approval; never automatically start/restart.

## Verification requirements
- Synthetic fixtures prove unchanged preexisting secret not blocked; newly inserted/duplicated values blocked; category and line without secret contents.
- Existing preflight, change-set and MCP security suites pass.
- Image MCP content and larger-than-default opt-in both verified.
- New session summary and recovered ambiguous-operation tests pass without changing source transcript/state.
- Verification source identity is included and marked stale across source mutation.
- README reasonably short, links valid, no current-tree private keys/credentials; any history findings disclosed, never history rewritten.
- Source and release remain separate evidence states; do not claim runtime installed when active runtime prevents it.
