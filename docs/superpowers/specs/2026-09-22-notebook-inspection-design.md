# Plan 41 — Structured Notebook Inspection Design

Created: 2026-09-22
Status: Verified
Priority: P1

## Problem

CodexPro can read guarded text files and documents, but Jupyter notebooks (`.ipynb`) are currently treated as raw JSON. Raw notebook JSON is noisy for an AI: cell source, metadata, execution counts, outputs, MIME bundles, and errors are interleaved with implementation details.

Notebook inspection can be added safely without creating a kernel or data-science execution platform because `.ipynb` is a JSON document.

## Goals

- Add one read-only `read_notebook` MCP tool.
- Return bounded structured notebook metadata and selected cells.
- Make code/Markdown/raw cells easy for the host model to understand.
- Summarize text outputs and output MIME types without executing anything.
- Preserve PathGuard, size limits, redaction, and symlink protections.

## Non-goals

- No Jupyter kernel.
- No `run_notebook` or `execute_cell`.
- No notebook cell editor.
- No dataframe engine.
- No Python dependency.
- No automatic output clearing/rewrite.
- No image rendering/conversion beyond metadata in the first version.
- No notebook dependency graph or execution-order repair automation.

## Public tool

```text
read_notebook
```

Suggested schema:

```ts
{
  workspace_id?: string;
  path: string;
  cell_indices?: number[];
  start_cell?: number;
  end_cell?: number;
  include_outputs?: boolean;
  max_output_bytes?: number;
}
```

Rules:

- `cell_indices` is mutually exclusive with `start_cell/end_cell`.
- all indices are zero-based in structured data and clearly labeled in text output;
- maximum selected cells is bounded (recommended 100);
- no selection means a bounded notebook overview plus the first bounded cells, not an unbounded whole notebook dump.

## Internal module

Create `src/notebookOps.ts`.

Core types:

```ts
export interface NotebookCellSummary {
  index: number;
  cellType: "code" | "markdown" | "raw" | "unknown";
  source: string;
  executionCount: number | null;
  outputs?: NotebookOutputSummary[];
}

export interface NotebookReadResult {
  path: string;
  nbformat: number | null;
  nbformatMinor: number | null;
  kernelName: string | null;
  language: string | null;
  cellCount: number;
  codeCells: number;
  markdownCells: number;
  rawCells: number;
  selectedCells: NotebookCellSummary[];
  truncated: boolean;
}
```

### Output handling

Recognize common output kinds without executing:

- `stream`: bounded text
- `error`: exception name/value plus bounded traceback text
- `display_data` / `execute_result`:
  - include bounded `text/plain` and `text/markdown` when present;
  - include MIME type names for image/html/json payloads;
  - do not dump large base64 image payloads into text/structured content.

All text passes through `redactSensitiveText`.

### File handling

- Require `.ipynb`.
- Resolve through `PathGuard`.
- `lstat` regular file only; reject symlink.
- Bound file bytes using an existing document/read limit rather than adding a new global setting unless current limits are insufficient.
- Parse JSON with clear malformed-notebook errors.
- Treat missing optional notebook fields as valid where possible.
- Reject pathological cell/output arrays above conservative bounds before producing huge structured objects.

## Tool mode

Expose `read_notebook` in Standard and Full modes. Do not add it to Minimal unless evidence shows frequent need there.

No write capability is required.

## Acceptance criteria

- Reads a normal nbformat 4 notebook and reports metadata/cell counts.
- Selects exact cells by index/range.
- Correctly extracts Markdown/code source arrays and string sources.
- Reports execution count.
- Summarizes stream/error/text output.
- Reports non-text MIME types without embedding huge payloads.
- Enforces aggregate output bytes and cell-count bounds.
- Rejects unsupported extension, symlink, malformed JSON, and blocked path.
- Output passes redaction.
- Tool is absent from Minimal and present in Standard/Full.
- No new dependency or kernel process.

## Verification

- Add focused `scripts/notebook-smoke.mjs`.
- Update tool-surface expectations.
- `npm run build`.
- `npm run smoke`.
- `git diff --check`.
- No stress/audit required unless a dependency/config limit is added.
