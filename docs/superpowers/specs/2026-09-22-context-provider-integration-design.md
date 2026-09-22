# Plan 40 — Context and Code-Intelligence Provider Integration Design

Created: 2026-09-22
Status: Verified
Priority: P1

## Problem

CodexPro already has two mature but partially separate paths:

1. `gather_context` performs bounded context ranking using built-in repository analysis, instructions, Git state, dependency candidates, reasons, fingerprints, caching, and resumable batches.
2. Structured `search` can augment built-in analysis with optional CodeGraph and LSP provider results.

Creating a new “Context Engine v3” would duplicate these systems. The missing value is narrower: when a caller explicitly asks `gather_context` for symbol-oriented context, optional structural provider evidence should improve candidate selection using the same existing provider seam.

## Goals

- Reuse optional CodeGraph/LSP search evidence inside `gather_context`.
- Improve symbol/reference candidate quality without changing the public tool name.
- Preserve built-in behavior when providers are disabled, unavailable, stale, or fail.
- Keep provider evidence bounded, guarded, explainable, and cache-safe.
- Avoid persistent LSP lifecycle or a new indexing subsystem.

## Non-goals

- No persistent LSP server manager.
- No document synchronization (`didOpen`/`didChange`) system.
- No rename, code actions, completion, hover, or debugger APIs.
- No mandatory CodeGraph/LSP install.
- No new `gather_context_v3` tool.
- No new context database.
- No autonomous semantic/model ranking.

## Existing seams

- `src/contextOps.ts` — `gatherContextV2()`
- `src/contextRanking.ts`
- `src/analysis/index.ts` — structured search
- `src/analysis/providers.ts` — optional provider routing and path normalization
- `src/analysis/codegraphProvider.ts`
- `src/analysis/lspProvider.ts`
- `src/contextCache.ts`
- `src/contextBatch.ts`
- `scripts/context-v2-smoke.mjs`
- `scripts/analysis-smoke.mjs`

## Design

### Provider evidence request

Only request provider evidence when it is useful and bounded:

- `strategy="symbol"` with non-empty `targetSymbol`;
- optionally `strategy="change"` when changed files have extracted symbols, but defer this until symbol mode is proven.

Add a helper to the existing analysis provider seam:

```ts
export interface ProviderContextEvidence {
  matches: StructuredSearchMatch[];
  warnings: string[];
  providers: string[];
}

export async function contextEvidenceFromProviders(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  query: string,
  maxResults: number
): Promise<ProviderContextEvidence>;
```

It may delegate to `searchOptionalAnalysisProviders()` with intent `references` or `symbol`; it must not create a parallel provider implementation.

### Candidate merge

Provider matches become additional context candidates only after PathGuard normalization. Deduplicate by normalized path and merge reasons into the existing candidate when the path is already selected.

Example reasons:

```text
explicit target for symbol validateSession
CodeGraph structural search
LSP workspace symbol
built-in dependency reference
```

Provider evidence should boost an existing candidate modestly but must not override:

1. applicable instructions;
2. explicit target file;
3. explicit changed paths;
4. direct built-in exact definition.

### Budget and fallback

- Provider search result cap: no more than the smaller of `maxSearchResults` and a small context-specific ceiling (recommended 32).
- Provider errors become warnings and never fail `gather_context`.
- Provider-returned paths still pass `PathGuard`.
- Provider evidence consumes the same aggregate byte/token budget as all other context.
- Do not embed provider raw JSON or stderr in context text.

### Cache semantics

The context cache fingerprint must reflect provider availability/freshness enough to avoid returning provider-enriched cached results after provider state materially changes. Prefer a small provider status/freshness fingerprint, not provider source dumps.

If a trustworthy cheap provider fingerprint is unavailable, cache only the built-in selection or mark provider-enriched entries with a short TTL/runtime generation rather than adding complex persistent invalidation.

### Resumable batch compatibility

`gather_context` resumability must continue to produce equivalent output for the same request/source/provider fingerprint. No provider operation may continue in the background between calls.

## Acceptance criteria

- Symbol-mode context includes optional provider-supported files/reasons when available.
- With all providers disabled, output remains equivalent to the current built-in path.
- A failing/stale provider produces a warning and built-in context still succeeds.
- Unsafe/out-of-workspace provider paths are rejected.
- Duplicate candidate paths merge reasons rather than duplicate file bodies.
- Explicit target/instructions remain higher priority than provider suggestions.
- Resumed and uninterrupted requests match for the same fingerprints.
- No new public tool and no new dependency.

## Verification

- Extend focused context-v2 and analysis provider smoke.
- `npm run build`.
- `npm run smoke` because shared context behavior changes.
- `git diff --check`.
- Stress is not required unless cache/resumable concurrency logic changes.
