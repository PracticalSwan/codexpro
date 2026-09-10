# Fresh ChatGPT Session Continuation Acceptance

Run this only after the intended CodexPro Full build is installed and available to a **new ChatGPT conversation**. The fresh session validates the installed runtime; it does not modify CodexPro source/Git unless a separate fix is explicitly authorized.

Use disposable continuation state. Do not include credentials, numeric Telegram IDs, cookies, browser storage, account identity, full private ChatGPT conversation URLs, prompts, assistant output, or secret-bearing command lines in the report.

## Environment

- [ ] Record CodexPro Full package/version.
- [ ] Record source commit when the installed runtime exposes it safely.
- [ ] Record OS and configured managed browser only at product-level detail.
- [ ] Verify the session can call CodexPro and retrieve sanitized server/runtime status.

## Configuration

- [ ] Tool-time awareness is present independently of continuation and normally defaults to bounded 20 minutes unless this operator saved another next-run value.
- [ ] Record current deadline mode/value and saved-next-run mode/value; confirm the current runtime is authoritative.
- [ ] Confirm package defaults keep browser continuation disabled and Telegram disabled.
- [ ] If this operator intentionally enabled continuation/Telegram, record only enabled/paired/configured booleans and coarse state.
- [ ] Never infer current runtime settings from saved profile data alone.

## Core scenarios

- [ ] Arm, checkpoint, request, and recover one disposable continuation task.
- [ ] Bind the intended disposable managed-browser chat and complete one browser-authorized fixed continuation dispatch.
- [ ] Complete one Telegram default **Continue** authorization when Telegram is configured.
- [ ] Complete one bounded focused Telegram intent when Telegram is configured.
- [ ] Change the saved next-run deadline without restarting and confirm the running deadline does not silently change.
- [ ] Complete the task, then verify old browser/Telegram actions are rejected as stale/expired.
- [ ] Exercise cancel/disarm and verify continuation authorization is invalidated without stopping unrelated runtime/process/job/Goal work.
- [ ] When Telegram is unavailable/disabled, verify browser authorization remains available with no automatic fallback send.
- [ ] Submit one ordinary manual prompt/Stop action and verify stale authorization is invalidated before semantic reconciliation as `resume`, `redirect`, `supersede`, or `cancel`.
- [ ] Unlimited/observe host-window measurement may be skipped if this operator already established it with the harmless `tool_time_probe` in a disposable session.

Do not deliberately stop a production/user-owned tunnel or runtime, induce safety/capacity errors, or generate Telegram flood conditions merely for this acceptance run.

## Copyable report template

```markdown
# CodexPro Fresh-Session Acceptance Report

## Environment
- Package/version:
- Source commit (if safely available):
- OS / managed browser:

## Configuration
- Current deadline mode/value:
- Saved-next-run deadline mode/value:
- Continuation enabled / browser paired / auth state:
- Telegram enabled / configured / paired / worker state:

## Scenario Results
| Scenario | PASS / PARTIAL / FAIL / SKIPPED | Sanitized evidence |
| --- | --- | --- |
| Continuation lifecycle recovery | | |
| Browser user-authorized dispatch | | |
| Telegram default continuation | | |
| Telegram focused intent | | |
| Current-vs-saved deadline isolation | | |
| Completion stale-action rejection | | |
| Cancel/disarm behavior | | |
| Telegram unavailable -> browser remains available | | |
| Manual-turn reconciliation | | |

## Evidence
- Sanitized test/runtime evidence only:

## Skipped/Not Exercised
- Scenario and reason:

## Defects
- Reproducible defect(s), without secrets/private content:

## Residual Risks
- Unverified platform/host/browser conditions:

## Final
PASS | PARTIAL | FAIL
```

A `PASS` requires every mandatory scenario applicable to the configured environment to pass with sanitized evidence. `PARTIAL` is appropriate when an external/human/platform gate remains unexercised. A report is test evidence, not proof that source defects are fixed; reproduce material failures before changing source when practical.
