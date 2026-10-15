# Local Control Setup/Status Usability — Design (2026-10-15)

## Problem
The existing authenticated local setup page places connection settings, low-level provider options, runtime policy, capability toggles, diagnostics, and CLI recipes at similar visual prominence. The instructions also assumed Server URL even for OpenAI Tunnel ID connections. Operators must scroll past redundant status information to change common settings.

## Scope and user workflow
- Use the existing authenticated `/` and `/setup` pages, `/admin/profile` save/read API, and `/admin/diagnostics` read API. No new service, policy, route, external library, or automatic launcher control.
- Keep primary tasks obvious: inspect current runtime, edit next-launch settings, connect ChatGPT, and inspect advanced diagnostics.
- Show common tunnel/port/mode/write/tool/bash/Codex-session settings first; collapse provider-specific paths, deadline/session tuning, implementation-provider arguments, and elevated/testing flags.
- Show provider-specific fields only when relevant; hidden fields remain submitted so existing profile preservation/normalization continues to own the contract.
- Provide visible Save/Discard actions, dirty-state feedback, pending state, safe navigation warning, accessible save/error announcements, and explicit next-manual-start semantics.
- Preserve complete setting names, values, options, capability explanations, CLI recipes, allowed roots, build identity, and connection endpoints.
- Distinguish OpenAI Tunnel ID configuration from HTTP Server URL directions. Keep copy-token behavior ephemeral; strip URL tokens from history and do not persist tokens in the browser.
- Keep layout responsive at mobile and desktop widths, with horizontally scrollable page-section navigation and no body-level horizontal overflow.

## Security and compatibility
Keep Bearer admin authorization, same-origin POST protections, redaction, protected profile persistence, policy gates, endpoint authentication, and runtime ownership unchanged. Browser saving never starts, stops, or mutates a running CodexPro process. Preserve the existing `POST /admin/profile` JSON field schema.

## Acceptance
- TypeScript build succeeds; authenticated HTTP smoke retains coverage for every existing profile setting, CSRF/origin guard, redaction, and safe token handling.
- UI contract tests verify advanced groups, provider filtering, Save/Discard and dirty-state hooks, no credential leakage, and correct OpenAI-vs-HTTP connection guidance.
- Browser interaction tests demonstrate provider switching, dirty/reset/save behavior and no horizontal overflow at 1280px and 390px.
- Full release smoke, stress, audit, public package-install smoke, hosted Windows/Ubuntu CI and Pages succeed before publication/install.
