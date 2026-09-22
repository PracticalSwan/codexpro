# Plan 40 — Context and Code-Intelligence Provider Integration Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Deepen existing `gather_context`; do not create a replacement context engine.

**Status:** Verified

**Goal:** Feed bounded optional CodeGraph/LSP structural evidence into symbol-oriented `gather_context` while preserving deterministic built-in fallback.

**Architecture:** Add a narrow provider-evidence helper to the existing analysis provider seam, merge guarded provider paths/reasons into existing context candidates, and extend the current cache/resumable fingerprint only as much as required.

**Tech Stack:** TypeScript, existing analysis/provider/context modules; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-22-context-provider-integration-design.md`

## Global constraints

- No new public MCP tool.
- No persistent LSP process manager.
- Providers remain optional.
- Provider failures never make built-in context fail.
- Every provider path passes `PathGuard`.
- Explicit target/instructions outrank provider evidence.
- Preserve existing byte/token budgets and resumable semantics.

---

## Task 1: Add a bounded provider-context evidence helper

**Files:**
- Modify: `src/analysis/providers.ts`
- Modify: `src/analysis/types.ts` only if a reusable evidence type is justified
- Test: `scripts/analysis-smoke.mjs`

**Interface:**

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

- [ ] Write provider fixtures returning one valid path, one duplicate, and one out-of-workspace path.
- [ ] Reuse `searchOptionalAnalysisProviders`; do not duplicate provider spawning/parsing.
- [ ] Return normalized guarded paths only.
- [ ] Cap evidence to at most `min(maxResults, 32)`.
- [ ] Convert provider failures to bounded warnings.
- [ ] Run focused analysis smoke.

## Task 2: Merge provider evidence into context ranking

**Files:**
- Modify: `src/contextOps.ts`
- Modify: `src/contextRanking.ts` only if the existing candidate type cannot represent provider reasons
- Test: `scripts/context-v2-smoke.mjs`

- [ ] Add a symbol-mode fixture where built-in analysis misses a reference but the provider fixture returns it.
- [ ] Call provider evidence only when `strategy==="symbol"` and `targetSymbol` is non-empty.
- [ ] Merge by normalized path.
- [ ] If a built-in candidate already exists, append unique provider reasons and apply a bounded score bonus instead of adding a duplicate.
- [ ] If provider-only, create a normal context candidate with a score below explicit target/direct exact definition.
- [ ] Provider evidence must consume the existing file-read budget; never insert raw provider payload into output.
- [ ] Assert instructions and explicit target remain first/highest priority.

## Task 3: Preserve fallback and warnings

**Files:**
- Modify: `src/contextOps.ts`
- Test: `scripts/context-v2-smoke.mjs`

- [ ] Add fixtures for disabled provider, stale CodeGraph, unavailable LSP executable, and provider exception.
- [ ] Built-in context must remain successful and useful in every case.
- [ ] Add bounded warnings to structured content, not repeated warning prose in every file section.
- [ ] Verify no absolute rejected provider path is leaked.

## Task 4: Make cache identity provider-aware without overengineering

**Files:**
- Modify: `src/contextOps.ts`
- Modify: `src/contextCache.ts` only if needed
- Reference: existing provider availability/freshness data
- Test: `scripts/context-v2-smoke.mjs`

- [ ] Write a fixture proving provider-enabled and provider-disabled requests cannot incorrectly share an enriched cache result.
- [ ] Prefer a deterministic small fingerprint based on provider IDs + availability/freshness detail already computed.
- [ ] Do not store provider source text or index data in cache keys.
- [ ] Keep runtime-only cache semantics; do not add a persistent context database.

## Task 5: Preserve resumable equivalence

**Files:**
- Modify: `src/contextBatch.ts` only if the request/source fingerprint needs the provider marker
- Test: existing resumable context smoke

- [ ] Force a yield on a provider-enriched symbol request.
- [ ] Resume with unchanged provider fingerprint and assert equivalent selected paths/reasons to uninterrupted execution.
- [ ] Change provider fingerprint and assert stale continuation rejection rather than mixing evidence.

## Task 6: Documentation and final gate

**Files:**
- Modify: `FEATURES.md`
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Document that provider enrichment is optional and only improves existing `gather_context`.
- [ ] Run focused analysis/context tests.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Run `git diff --check`.
- [ ] Inspect final diff for any mandatory provider dependency or duplicate context subsystem.
