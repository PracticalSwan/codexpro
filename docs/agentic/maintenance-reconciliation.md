# Maintenance Reconciliation ? 2026-09-05

## Baseline

- Upstream `main`: `587f7fd3a4644a847bba13aeb49336056052e1f6`.
- Fork `origin/main`: same upstream baseline after a fresh fetch.
- Integration baseline before roadmap work: `01f01300820e0ed729744d44c77490ba2bff1bb5`.
- Upstream maintenance PRs checked on 2026-09-05 remain open; no equivalent fix was merged into `upstream/main`.
- Plan 01 adds the missing PR #117 behavior locally without publishing or changing any remote branch.

## Integration commit map

| Local commit | Upstream work | Status / rationale |
| --- | --- | --- |
| `cb041f42` | PR #94 | Open; keep local search limit fix. |
| `10e7f90` | PR #95 | Open; keep HTTP security hardening. |
| `936869b` | PR #96 | Open; keep shared HTTP workspace registry. |
| `d57b8e9` | PR #112 | Open; keep nested-workspace patch handling. |
| `cde791d` | PR #113 | Open; keep self-test probe isolation. |
| `f756607`, `01bfa76` | PR #114 | Open; keep authenticated profile-save fix and regression coverage. |
| `dc0bd63` | PR #115 | Open; keep Windows Bash runtime diagnostics. |
| `41135a4` | PR #116 | Open; keep path-scoped nested Git behavior. |
| `433bd7c` | local-only | Preserve HTTP source file mode; no duplicate upstream implementation found. |
| `4b0e2f9` | PR #90 | Open; keep Windows Bash output decoding. |
| `c48c710` | PR #118 | Open; keep full-Bash semantic descriptors. |
| `857e056` | PR #119 | Open; keep retained-output/flood separation. |
| `634635b` | PR #120 | Open; keep self-test health/security-posture separation. |
| `681f456` | PR #121 | Open; keep bounded Node regex fallback. |
| `0d211ee` | PR #122 | Open; keep structured workspace snapshots. |
| `caa414b` | PR #123 | Open; keep bounded analysis prioritization. |
| `ecc03cf` | PR #124 | Open; keep Windows handoff adapter coverage. |
| `a4a3b67`, `85b3c5d` | PR #125 | Open; keep Windows npm release invocation and guard coverage. |
| `01f0130` | PR #128 | Open; keep Windows sensitive-path/ADS hardening. |

## Plan 01 additions

- PR #117 was still open and absent from the local integration branch. Its stats-only `git_diff` behavior is integrated while reusing the newer nested-repository Git context.
- `fast-uri` was refreshed from 3.1.5 to 3.1.7 and `qs` from 6.15.2 to 6.16.0 through the existing semver ranges; no direct dependency range was widened.
- Package version moved to `0.31.0` without creating a Git tag.
- Release-pack validation requires core runtime entry points and rejects agentic planning, `.ai-bridge`, environment, profile, and runtime metadata paths.

## Verification contract

Plan 01 is complete only when the oversized stats-only diff regression, build/smoke/stress, high-severity npm audit, dry-run package validation, `git diff --check`, and final diff review pass on the current branch.
