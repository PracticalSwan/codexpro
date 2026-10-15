# Local Control Usability — Implementation Plan (2026-10-15)

Authorized scope: user-requested simplification of the existing CodexPro local setup/status page and compatible maintenance updates.

1. Recover real local Git/runtime/profile state; inspect `src/http.ts` onboarding renderer, `/admin/profile` handlers and `scripts/http-smoke.mjs`.
2. Protect the existing HTML/API/security contract with a focused UI smoke assertion, then update the template with progressive disclosure and accurate connection guidance. Preserve all setting field names and POST payload keys.
3. Add provider-specific visibility, Save/Discard dirty tracking, accessible status and error feedback, manual-next-start labeling, responsive section navigation, and compact status summary. Do not add browser-driven runtime start/stop.
4. Run TypeScript build, HTTP smoke, and browser DOM interaction checks with 1280px and 390px viewports. Verify keyboard-safe elements, no horizontal page overflow, and preserved backend guardrails.
5. Review compatible dependency updates; do not upgrade to unsupported TypeScript major. Run the full local release gate including stress/audit/isolated packed-artifact installation.
6. Reconcile docs/changelog/install examples, push verified release candidate to `origin/main`, confirm exact-commit Windows/Ubuntu CI and Pages, then tag/publish GitHub Release.
7. Verify release archive SHA-256 and disposable install. Stop only identity-verified owned CodexPro runtime if needed, globally install the exact public artifact, preserve all profiles/preferences, leave stopped.
8. Record verified release evidence in durable memory and report anything not proven. npm registry publication requires independently available authentication.
