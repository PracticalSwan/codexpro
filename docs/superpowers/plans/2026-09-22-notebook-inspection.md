# Plan 41 — Structured Notebook Inspection Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Keep version 1 strictly read-only and JSON-structural; do not add a kernel.

**Status:** Verified

**Goal:** Add a bounded `read_notebook` tool that presents `.ipynb` structure and outputs cleanly without executing or rewriting notebooks.

**Architecture:** Parse notebook JSON in a focused guarded module, normalize cells/outputs to small typed summaries, and register one read-only MCP tool in Standard/Full mode.

**Tech Stack:** TypeScript/Node standard library, existing PathGuard/redaction/result conventions; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-22-notebook-inspection-design.md`

## Global constraints

- Read-only only.
- No Python/Jupyter dependency.
- No kernel/process spawning.
- No raw base64 image dump.
- All paths through PathGuard; reject symlinks.
- Bound file size, selected cells, output entries, and aggregate output bytes.
- Standard + Full tool modes only.
- Preserve existing tool-surface diagnostics consistency.

---

## Task 1: Build notebook parser/normalizer

**Files:**
- Create: `src/notebookOps.ts`
- Test: create `scripts/notebook-smoke.mjs`

**Interfaces:**

```ts
export interface ReadNotebookOptions {
  path: string;
  cellIndices?: number[];
  startCell?: number;
  endCell?: number;
  includeOutputs?: boolean;
  maxOutputBytes?: number;
}

export async function readNotebook(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: ReadNotebookOptions
): Promise<NotebookReadResult>;
```

- [ ] Create temporary nbformat 4 fixtures with Markdown, code, raw, stream, error, execute_result, and image MIME output.
- [ ] Write failing assertions for counts, kernel/language metadata, exact selected cells, execution count, and MIME summary.
- [ ] Implement source normalization for string or string-array `source`.
- [ ] Normalize unknown/missing cell types without crashing.
- [ ] Implement text-output bounding and redaction.
- [ ] Return MIME type names for binary/rich payloads instead of payload bodies.
- [ ] Run `node scripts/notebook-smoke.mjs`.

## Task 2: Add file safety and malformed-input coverage

**Files:**
- Modify: `src/notebookOps.ts`
- Test: `scripts/notebook-smoke.mjs`

- [ ] Add blocked/out-of-workspace path fixture.
- [ ] Add symlink fixture on platforms where symlink creation is available; otherwise use existing platform-safe fixture strategy.
- [ ] Add wrong extension and malformed JSON fixtures.
- [ ] Add oversized notebook and excessive-cell fixtures using existing configured limits.
- [ ] Reject conflicting `cellIndices` with range selection.
- [ ] Deduplicate/sort explicit indices for deterministic output.
- [ ] Ensure no failure contains unredacted sensitive text.

## Task 3: Register `read_notebook`

**Files:**
- Modify: `src/server.ts`
- Test: `scripts/smoke.mjs`
- Test: `scripts/notebook-smoke.mjs`

**Tool schema:**

```ts
{
  workspace_id: z.string().optional(),
  path: z.string(),
  cell_indices: z.array(z.number().int().min(0)).max(100).optional(),
  start_cell: z.number().int().min(0).optional(),
  end_cell: z.number().int().min(0).optional(),
  include_outputs: z.boolean().optional(),
  max_output_bytes: z.number().int().min(1000).optional()
}
```

- [ ] Add read-only annotations.
- [ ] Add to Standard and Full tool mode lists, not Minimal.
- [ ] Return concise Markdown text plus structured notebook data.
- [ ] Use existing output-size conventions.
- [ ] Add real MCP invocation smoke coverage.

## Task 4: Update tool-surface and self-test expectations

**Files:**
- Modify: tool-surface expected lists in `src/server.ts`
- Modify: relevant smoke fixtures that assert counts/names
- Test: `scripts/smoke.mjs`

- [ ] Assert Standard/Full expose `read_notebook`.
- [ ] Assert Minimal does not.
- [ ] Assert connection-test behavior remains read-only and compatible.
- [ ] Avoid hardcoded total-count assertions when name-set comparison is sufficient.

## Task 5: Documentation and final gate

**Files:**
- Modify: `FEATURES.md`
- Modify: `GETTING_STARTED.md` only if a short example materially helps
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Add one concise usage example.
- [ ] Explicitly state notebooks are inspected, not executed.
- [ ] Run `node scripts/notebook-smoke.mjs`.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke`.
- [ ] Run `git diff --check`.
- [ ] Review final diff for accidental notebook mutation/kernel/dependency scope creep.
