# CodexPro Context Map

## Likely extension seams
| File / area | Current responsibility | Roadmap use |
|---|---|---|
| `src/server.ts` | MCP registration, schemas, mode gating, result shaping | Register new tools only; avoid placing subsystem logic here |
| `src/config.ts` | Runtime modes, limits, environment/CLI parsing | New opt-in flags, bounded defaults, capability gates |
| `src/guard.ts` | Allowed roots and path safety | Reuse for every path-bearing feature; do not bypass |
| `src/fsOps.ts` | File I/O and per-file locking | Integrate operation journal/concurrency, batch reads, change sets |
| `src/bashOps.ts` | Shell execution and runtime/toolchain selection | Process/check integration; preserve safe/full semantics |
| `src/gitOps.ts` | Read-only Git queries | Extend history; keep mutating Git in a separate module |
| `src/searchOps.ts` | Lexical search and analysis bridge | Backend routing, fuzzy find, batch search |
| `src/analysis/*` | Built-in structural repository analysis | Package graph, provider adapters, dependency-aware ranking, impact |
| `src/codexSessions.ts` | Bounded Codex transcript discovery/read | Transcript search and read-around |
| `src/http.ts` | HTTP MCP transport and local admin | Correlation telemetry, diagnostics dashboard, process/goal status |
| `src/toolCardWidget.ts` | Optional compact UI cards | Add only high-signal diagnostics/process/goal projections |
| `src/importOps.ts` | ChatGPT attachment imports | Archive ingestion integration |
| `src/imageOps.ts` | Native workspace image content | Pattern for bounded binary result handling |
| `src/capabilitiesOps.ts` | Skill/MCP inventory | Instruction/context discovery integration only if needed |
| `scripts/*-smoke.mjs` | End-to-end feature verification | One focused smoke per new subsystem, then shared smoke inclusion |
| `scripts/stress.mjs` | Resource/concurrency edge cases | Operation locks, processes, budgets, goals |

## High-risk neighbors
- Authentication/tunnel behavior in `src/http.ts` and launcher scripts.
- Workspace/path security and redaction in `guard.ts`, `redact.ts`, `importOps.ts`.
- Cross-platform process execution in `bashOps.ts`, release scripts, and future process/goal modules.
- Any persistent journal/task/goal storage: permissions, bounded growth, crash consistency, and secret avoidance.
- Git mutation/projection: unrelated dirty/staged/untracked work and expected-HEAD checks.
- Tool descriptors/mode lists: ChatGPT may cache schemas, so compatibility and stable naming matter.

## Existing verification patterns to reuse
- `scripts/smoke.mjs`: real MCP tool registration/calls and safety regressions.
- `scripts/http-smoke.mjs`: transport/auth/admin behavior.
- `scripts/analysis-smoke.mjs`: repository-analysis contracts.
- `scripts/execute-handoff-smoke.mjs`: owned process/handoff lifecycle patterns.
- `scripts/settings-smoke.mjs`: CLI/profile/config precedence.
- `scripts/stress.mjs`: concurrency, output, large/dirty workspace bounds.

## Design pressure
`src/server.ts` is already large. New roadmap subsystems should expose small typed functions/classes and let `server.ts` perform schema validation, mode gating, invocation, and result formatting only. Shared mutation lifecycle belongs in the operation core rather than being reimplemented in write, Git, process, and Goal tools.
