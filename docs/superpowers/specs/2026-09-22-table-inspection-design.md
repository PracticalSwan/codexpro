# Plan 44 — Structured Dataset / Table Inspection Design

Created: 2026-09-22
Status: Planned
Priority: P1

## Problem

CodexPro can inspect source, archives, documents, images, and (under Plan 41) notebooks, but CSV/TSV/JSONL datasets are still raw text. For many AI/ML, analytics, and application projects, understanding schema, missing values, malformed rows, and representative records should not require large raw-file reads or a Python/pandas runtime.

Version 1 should be a conservative read-only parser, not a dataframe platform.

## Goals

- Add one read-only `inspect_table` tool for `.csv`, `.tsv`, `.jsonl`, and `.ndjson`.
- Return bounded schema/type inference, row counts/estimates, quality summaries, basic numeric statistics, and representative samples.
- Work with Node/TypeScript only unless the standard library proves insufficient for correct CSV quoting.
- Preserve PathGuard, symlink, size, redaction, and output-budget rules.

## Non-goals

- No pandas/Python runtime.
- No SQL/query engine.
- No dataframe mutation/edit/write-back.
- No plotting/charting.
- No ML/statistical modeling.
- No unbounded full-file loading for large datasets.
## Supported formats

### CSV/TSV

- RFC4180-like quoted fields including delimiters/newlines inside quotes must be handled correctly.
- UTF-8 first; BOM is tolerated.
- Delimiter is fixed by extension in v1 (`.csv` comma, `.tsv` tab) rather than heuristic guessing.
- Malformed rows produce bounded warnings/counts rather than silent column shifting.

### JSONL/NDJSON

- One JSON value per non-empty line.
- Object rows are the primary table shape.
- Non-object rows may be counted/warned and sampled but must not force a fake schema.

## Result shape

```ts
interface TableInspectionResult {
  path: string;
  format: "csv" | "tsv" | "jsonl";
  rowsScanned: number;
  totalRows?: number;
  truncated: boolean;
  columns: ColumnSummary[];
  malformedRows: number;
  sampleRows: Array<Record<string, unknown>>;
  warnings: string[];
}
```
Column summaries may include inferred type (`null|boolean|integer|number|string|mixed`), observed/null counts, bounded approximate distinct count, and numeric min/max/mean when applicable.

## Streaming and budgets

- Do not require loading an entire large file in memory.
- Use streaming/chunked parsing with an explicit scan-row/byte ceiling.
- For small files within the configured ceiling, an exact total row count is acceptable.
- For truncated scans, report `rowsScanned` and omit/mark total rather than inventing an estimate unless a deterministic estimator is explicitly designed/tested.
- Cap columns, samples, distinct tracking, string lengths, warnings, and structured result bytes.

## Sampling

Use deterministic sampling for reproducibility. Version 1 may keep first N representative valid rows plus a bounded later reservoir if implemented simply; otherwise first/middle/last within the scanned region is acceptable. Do not use randomness that changes between identical calls.

## Security/privacy

- PathGuard and regular-file/no-symlink rules apply.
- Apply text redaction to returned string values and warnings.
- Do not infer sensitive semantic categories such as race/health/account identity; only structural primitive types.
- Do not expose values omitted by existing blocked-path rules.

## Tool mode

Expose `inspect_table` in Standard and Full modes. Keep Minimal unchanged.

## Acceptance criteria

- Correctly parses quoted CSV delimiters/newlines and TSV.
- Correctly parses JSONL object rows and reports malformed/non-object lines.
- Returns bounded columns, null counts, primitive type inference, numeric min/max/mean, approximate/exact distinct count under documented bounds, and deterministic samples.
- Large inputs truncate safely without unbounded memory growth.
- Rejects blocked paths, symlinks, unsupported extensions, and oversized pathological records safely.
- No mutation, Python/Jupyter runtime, SQL engine, charting, model call, or new persistent store.

## Verification

- Focused `scripts/table-inspection-smoke.mjs` including quoted/multiline CSV, malformed rows, JSONL, large/truncated input, symlink/path safety, and redaction.
- `npm run build`.
- `npm run smoke` because tool surface changes.
- `git diff --check`.
