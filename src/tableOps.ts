import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import { CodexProError, PathGuard, type Workspace } from "./guard.js";
import { redactSensitiveText } from "./redact.js";

export type TableFormat = "csv" | "tsv" | "jsonl";
export type ColumnType = "null" | "boolean" | "integer" | "number" | "string" | "mixed";
export interface ColumnSummary {
  name: string;
  type: ColumnType;
  observed: number;
  nulls: number;
  distinct: number;
  min?: number;
  max?: number;
  mean?: number;
}
export interface TableInspectionResult {
  path: string;
  format: TableFormat;
  rowsScanned: number;
  totalRows?: number;
  truncated: boolean;
  columns: ColumnSummary[];
  malformedRows: number;
  sampleRows: Array<Record<string, unknown>>;
  warnings: string[];
}

const MAX_COLUMNS = 128;
const MAX_SAMPLES = 24;
const MAX_DISTINCT = 256;

function boundedText(value: unknown, max = 240): string {
  const text = redactSensitiveText(typeof value === "string" ? value : value == null ? "" : String(value));
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function primitive(value: unknown): { type: ColumnType; value: unknown; number?: number } {
  if (value === null || value === undefined || value === "") return { type: "null", value: null };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isInteger(value) ? { type: "integer", value, number: value } : { type: "number", value, number: value };
  const text = String(value).trim();
  if (/^(true|false)$/i.test(text)) return { type: "boolean", value: text.toLowerCase() === "true" };
  if (/^-?\d+$/.test(text) && text.length < 32) return { type: "integer", value: Number(text), number: Number(text) };
  if (/^-?(?:\d+\.\d+|\d+e[+-]?\d+)$/i.test(text) && Number.isFinite(Number(text))) return { type: "number", value: Number(text), number: Number(text) };
  return { type: "string", value: boundedText(text) };
}

function safeJsonValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return boundedText(value, 480);
  if (depth >= 3) return "[nested value omitted]";
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => safeJsonValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 64).map(([key, child]) => [boundedText(key, 160), safeJsonValue(child, depth + 1)]));
  }
  return boundedText(value, 480);
}

function parseDelimited(text: string, delimiter: string, maxRows: number): { rows: string[][]; malformed: number; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let malformed = 0;
  let truncated = false;
  const finishRow = () => {
    if (rows.length >= maxRows) { truncated = true; return; }
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) { quoted = true; continue; }
    if (ch === delimiter) { row.push(field); field = ""; continue; }
    if (ch === "\n") { finishRow(); continue; }
    if (ch === "\r") { if (text[index + 1] === "\n") index += 1; finishRow(); continue; }
    field += ch;
  }
  if (quoted) malformed += 1;
  if (field.length || row.length) finishRow();
  const expected = rows[0]?.length ?? 0;
  for (const item of rows.slice(1)) if (item.length !== expected) malformed += 1;
  return { rows, malformed, truncated };
}

function columnSummaries(headers: string[], records: Array<Record<string, unknown>>): ColumnSummary[] {
  const names = headers.slice(0, MAX_COLUMNS).map((name, index) => boundedText(name || `column_${index + 1}`, 160));
  return names.map((name) => {
    const values = records.map((record) => record[name]);
    const stats = values.map(primitive);
    const types = new Set(stats.filter((item) => item.type !== "null").map((item) => item.type));
    const distinctValues = new Set(stats.filter((item) => item.type !== "null").map((item) => JSON.stringify(item.value))).size;
    const numbers = stats.map((item) => item.number).filter((value): value is number => typeof value === "number");
    const type: ColumnType = types.size === 0 ? "null" : types.size === 1 ? [...types][0] : types.size === 2 && types.has("integer") && types.has("number") ? "number" : "mixed";
    return {
      name, type, observed: values.length - stats.filter((item) => item.type === "null").length, nulls: stats.filter((item) => item.type === "null").length,
      distinct: Math.min(MAX_DISTINCT, distinctValues),
      ...(numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers), mean: numbers.reduce((sum, value) => sum + value, 0) / numbers.length } : {})
    };
  });
}

async function boundedRead(filePath: string, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;
  const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    const buffer = Buffer.from(String(chunk), "utf8");
    const remaining = maxBytes - bytes;
    if (remaining <= 0) { truncated = true; break; }
    if (buffer.byteLength > remaining) { chunks.push(buffer.subarray(0, remaining)); bytes += remaining; truncated = true; break; }
    chunks.push(buffer); bytes += buffer.byteLength;
  }
  stream.destroy();
  return { text: Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/, ""), truncated };
}

function capStructuredResult(result: TableInspectionResult, requestedLimit: number | undefined, configuredLimit: number): TableInspectionResult {
  const limit = Math.max(4_096, Math.min(requestedLimit ?? configuredLimit, configuredLimit));
  let columns = result.columns.slice();
  let samples = result.sampleRows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? boundedText(value, 480) : value])));
  let warnings = result.warnings.slice();
  const materialize = (): TableInspectionResult => ({ ...result, columns, sampleRows: samples, warnings, truncated: result.truncated || columns.length < result.columns.length || samples.length < result.sampleRows.length || warnings.length < result.warnings.length });
  while (Buffer.byteLength(JSON.stringify(materialize()), "utf8") > limit) {
    if (samples.length > 1) { samples = samples.slice(0, samples.length - 1); continue; }
    if (columns.length > 8) {
      columns = columns.slice(0, Math.max(8, Math.floor(columns.length / 2)));
      const allowed = new Set(columns.map((column) => column.name));
      samples = samples.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => allowed.has(key))));
      continue;
    }
    if (warnings.length > 1) { warnings = warnings.slice(0, warnings.length - 1); continue; }
    const compacted = samples.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? boundedText(value, 80) : value])));
    if (JSON.stringify(compacted) !== JSON.stringify(samples)) { samples = compacted; continue; }
    break;
  }
  return materialize();
}

export async function inspectTable(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { path: string; maxRows?: number; maxOutputBytes?: number }): Promise<TableInspectionResult> {
  const resolved = guard.resolve(workspace, options.path);
  const ext = path.extname(resolved.relPath).toLowerCase();
  const format: TableFormat | undefined = ext === ".csv" ? "csv" : ext === ".tsv" ? "tsv" : ext === ".jsonl" || ext === ".ndjson" ? "jsonl" : undefined;
  if (!format) throw new CodexProError("inspect_table supports .csv, .tsv, .jsonl, and .ndjson files only.");
  const stat = await fsp.lstat(resolved.absPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CodexProError("Table must be a regular file.");
  if (stat.size > config.maxImportBytes) throw new CodexProError(`Table exceeds size limit (${config.maxImportBytes} bytes).`);
  const maxRows = Math.max(1, Math.min(options.maxRows ?? 20_000, 100_000));
  const scan = await boundedRead(resolved.absPath, Math.min(config.maxImportBytes, Math.max(config.maxReadBytes, 1_000_000)));
  const warnings: string[] = [];
  let rowsScanned = 0;
  let malformedRows = 0;
  let truncated = scan.truncated;
  let records: Array<Record<string, unknown>> = [];
  if (format === "jsonl") {
    const lines = scan.text.split(/\r?\n/);
    const columns = new Set<string>();
    for (const line of lines) {
      if (!line.trim()) continue;
      if (rowsScanned >= maxRows) { truncated = true; break; }
      rowsScanned += 1;
      try {
        const parsed = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) { malformedRows += 1; if (warnings.length < 8) warnings.push(`Non-object JSONL row ${rowsScanned} was counted but not added to the schema.`); continue; }
        const record: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(parsed).slice(0, MAX_COLUMNS)) { const safeKey = boundedText(key, 160); columns.add(safeKey); record[safeKey] = safeJsonValue(value); }
        records.push(record);
      } catch { malformedRows += 1; if (warnings.length < 8) warnings.push(`Malformed JSONL row ${rowsScanned} was skipped.`); }
    }
    const headers = [...columns].slice(0, MAX_COLUMNS);
    records = records.map((record) => Object.fromEntries(headers.map((header) => [header, record[header] ?? null])));
    const samples = records.slice(0, MAX_SAMPLES);
    return capStructuredResult({ path: resolved.relPath, format, rowsScanned, ...(truncated ? {} : { totalRows: rowsScanned }), truncated, columns: columnSummaries(headers, records), malformedRows, sampleRows: samples, warnings: warnings.map((warning) => redactSensitiveText(warning)) }, options.maxOutputBytes, config.maxOutputBytes);
  }
  const parsed = parseDelimited(scan.text, format === "csv" ? "," : "\t", maxRows + 1);
  malformedRows = parsed.malformed;
  truncated ||= parsed.truncated;
  const header = parsed.rows.shift() ?? [];
  const headers = header.slice(0, MAX_COLUMNS).map((name, index) => boundedText(name || `column_${index + 1}`, 160));
  records = parsed.rows.slice(0, maxRows).map((row) => Object.fromEntries(headers.map((name, index) => [name, row[index] === undefined ? null : boundedText(row[index], 2000)])));
  rowsScanned = records.length;
  if (header.length > MAX_COLUMNS) warnings.push(`Columns were capped at ${MAX_COLUMNS}.`);
  if (parsed.malformed) warnings.push(`${parsed.malformed} row${parsed.malformed === 1 ? "" : "s"} had a malformed or inconsistent field count.`);
  return capStructuredResult({ path: resolved.relPath, format, rowsScanned, ...(truncated ? {} : { totalRows: rowsScanned }), truncated, columns: columnSummaries(headers, records), malformedRows, sampleRows: records.slice(0, MAX_SAMPLES), warnings: warnings.map((warning) => redactSensitiveText(warning)) }, options.maxOutputBytes, config.maxOutputBytes);
}
