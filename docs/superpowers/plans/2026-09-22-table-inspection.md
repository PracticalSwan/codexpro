# Plan 44 — Structured Dataset / Table Inspection Implementation Plan

> **For agentic workers:** keep v1 read-only and streaming/bounded. Do not turn this into a dataframe or analytics platform.

**Goal:** Let ChatGPT understand common tabular project data without raw-file dumping or external runtimes.

**Architecture:** Add one focused guarded streaming parser module and one read-only MCP tool in Standard/Full modes. Reuse existing PathGuard/redaction/result conventions.

**Tech Stack:** TypeScript/Node. Prefer standard library; add a CSV parser dependency only if a focused proof shows a correct bounded parser would otherwise duplicate substantial mature parsing logic, and then run dependency/audit/package gates.

**Spec:** `docs/superpowers/specs/2026-09-22-table-inspection-design.md`

## Global constraints

- Read-only only.
- No Python/pandas/SQL/charting/model calls.
- Streaming/bounded for large files.
- Correct quoting is more important than feature breadth.
- All strings redacted before public output.
- Standard + Full only; Minimal unchanged.
- No persistent dataset cache/store in v1.

---

## Task 1: Define parser/result contracts

**Files:**
- Create: `src/tableOps.ts`
- Test: create `scripts/table-inspection-smoke.mjs`

- [ ] Define bounded input options: path, max rows/bytes, sample count, optional selected columns.
- [ ] Define stable column/result types and truncation semantics.
## Task 2: Implement CSV/TSV streaming inspection

**Files:**
- Modify: `src/tableOps.ts`
- Test: `scripts/table-inspection-smoke.mjs`

- [ ] Handle quoted delimiters, escaped quotes, CRLF/LF, BOM, and quoted multiline fields correctly.
- [ ] Use extension-fixed delimiter; no heuristic dialect detector in v1.
- [ ] Detect malformed column counts/records and continue only when safe.
- [ ] Enforce record/field/column/scan limits before memory growth.

## Task 3: Implement JSONL/NDJSON inspection

**Files:**
- Modify: `src/tableOps.ts`

- [ ] Parse one non-empty line at a time.
- [ ] Treat object rows as schema-bearing; count/warn for malformed or non-object values.
- [ ] Bound nested/object rendering; primitive inference stays shallow in v1.

## Task 4: Add schema/quality/statistics aggregation

**Files:**
- Modify: `src/tableOps.ts`

- [ ] Infer null/boolean/integer/number/string/mixed conservatively.
- [ ] Track observed/null counts and bounded distinct values.
- [ ] Compute numeric min/max/mean with numerically safe incremental aggregation.
- [ ] Produce deterministic representative samples and bounded warnings.
- [ ] Redact output strings before return.
## Task 5: Add file/path safety

**Files:**
- Modify: `src/tableOps.ts`
- Test: path/symlink/oversize fixtures

- [ ] Resolve through PathGuard and reject symlinks/non-regular files.
- [ ] Reject unsupported extensions.
- [ ] Cap pathological single records/lines and excessive columns.
- [ ] Verify large scans remain bounded in memory/time.

## Task 6: Register `inspect_table`

**Files:**
- Modify: `src/server.ts`
- Modify: tool-mode expectations/tests

- [ ] Add read-only annotations and bounded schema options.
- [ ] Register in Standard and Full only.
- [ ] Return concise text plus structured data.
- [ ] Update self-test/tool-surface expected sets without brittle total-count assumptions where possible.

## Task 7: Documentation and gate

**Files:**
- Modify: `FEATURES.md`
- Modify: `GETTING_STARTED.md` only if one small example is useful
- Modify: `docs/agentic/PROJECT_MEMORY.md`
- Modify: `docs/agentic/PLAN_INDEX.md`

- [ ] Run focused table smoke.
- [ ] Run `npm run build` and `npm run smoke`.
- [ ] If a dependency was added, also run `npm audit --audit-level=high` and release-package checks.
- [ ] Run `git diff --check` and final diff review.
