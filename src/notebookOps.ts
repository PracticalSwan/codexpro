import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import { CodexProError, PathGuard, type Workspace } from "./guard.js";
import { redactSensitiveText } from "./redact.js";

export interface NotebookOutputSummary {
  outputType: string;
  text?: string;
  errorName?: string;
  errorValue?: string;
  traceback?: string[];
  mimeTypes?: string[];
}

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

function bounded(value: unknown, maxBytes: number): { value: string; truncated: boolean } {
  const raw = redactSensitiveText(typeof value === "string" ? value : value == null ? "" : String(value));
  if (Buffer.byteLength(raw, "utf8") <= maxBytes) return { value: raw, truncated: false };
  let out = "";
  let used = 0;
  for (const character of raw) {
    const bytes = Buffer.byteLength(character, "utf8");
    if (used + bytes > maxBytes) break;
    used += bytes;
    out += character;
  }
  return { value: `${out}\n...[notebook output truncated]`, truncated: true };
}

function sourceText(source: unknown): string {
  if (Array.isArray(source)) return source.filter((item) => typeof item === "string").join("");
  return typeof source === "string" ? source : "";
}

function outputSummary(output: any, maxBytes: number): { summary: NotebookOutputSummary; truncated: boolean } {
  const outputType = typeof output?.output_type === "string" ? output.output_type : "unknown";
  let truncated = false;
  const summary: NotebookOutputSummary = { outputType };
  if (outputType === "stream") {
    const text = bounded(sourceText(output.text), maxBytes);
    summary.text = text.value;
    truncated ||= text.truncated;
  } else if (outputType === "error") {
    summary.errorName = bounded(output.ename, 160).value;
    summary.errorValue = bounded(output.evalue, Math.min(1000, maxBytes)).value;
    const trace = Array.isArray(output.traceback) ? output.traceback : [];
    summary.traceback = [];
    let remaining = maxBytes;
    for (const line of trace.slice(0, 64)) {
      const item = bounded(line, Math.min(remaining, 2000));
      summary.traceback.push(item.value);
      remaining -= Buffer.byteLength(item.value, "utf8");
      truncated ||= item.truncated || remaining <= 0;
      if (remaining <= 0) break;
    }
  } else if (outputType === "display_data" || outputType === "execute_result") {
    const data = output?.data && typeof output.data === "object" ? output.data : {};
    const mimeTypes = Object.keys(data).filter((key) => key.length <= 160).slice(0, 32);
    summary.mimeTypes = mimeTypes;
    const textParts = [data["text/plain"], data["text/markdown"]].filter((value) => typeof value === "string");
    if (textParts.length) {
      const text = bounded(textParts.join("\n"), maxBytes);
      summary.text = text.value;
      truncated ||= text.truncated;
    }
  }
  return { summary, truncated };
}

export async function readNotebook(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  options: { path: string; cellIndices?: number[]; startCell?: number; endCell?: number; includeOutputs?: boolean; maxOutputBytes?: number }
): Promise<NotebookReadResult> {
  const resolved = guard.resolve(workspace, options.path);
  if (path.extname(resolved.relPath).toLowerCase() !== ".ipynb") throw new CodexProError("Notebook path must use the .ipynb extension.");
  const stat = await fsp.lstat(resolved.absPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CodexProError("Notebook must be a regular file.");
  if (stat.size > config.maxDocumentBytes) throw new CodexProError(`Notebook exceeds size limit (${config.maxDocumentBytes} bytes).`);
  const raw = await fsp.readFile(resolved.absPath, "utf8");
  let notebook: any;
  try { notebook = JSON.parse(raw); } catch { throw new CodexProError("Notebook JSON is malformed."); }
  if (!notebook || typeof notebook !== "object" || Array.isArray(notebook)) throw new CodexProError("Notebook JSON must be an object.");
  const cells = Array.isArray(notebook.cells) ? notebook.cells : [];
  if (cells.length > 10_000) throw new CodexProError("Notebook contains too many cells.");
  if (options.cellIndices && (options.startCell !== undefined || options.endCell !== undefined)) throw new CodexProError("cell_indices cannot be combined with start_cell or end_cell.");
  const indices = options.cellIndices
    ? [...new Set(options.cellIndices)]
    : options.startCell !== undefined || options.endCell !== undefined
      ? Array.from({ length: Math.max(0, Math.min(cells.length, (options.endCell ?? cells.length - 1) - (options.startCell ?? 0) + 1)) }, (_, offset) => (options.startCell ?? 0) + offset)
      : Array.from({ length: Math.min(cells.length, 20) }, (_, index) => index);
  if (indices.length > 100) throw new CodexProError("At most 100 notebook cells may be selected.");
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= cells.length)) throw new CodexProError("Notebook cell index is out of range.");
  const outputLimit = Math.max(1000, Math.min(options.maxOutputBytes ?? config.maxDocumentOutputBytes, config.maxDocumentOutputBytes));
  let remaining = outputLimit;
  let truncated = false;
  const selectedCells: NotebookCellSummary[] = [];
  for (const index of indices) {
    const cell = cells[index] && typeof cells[index] === "object" ? cells[index] : {};
    const cellType = cell.cell_type === "code" || cell.cell_type === "markdown" || cell.cell_type === "raw" ? cell.cell_type : "unknown";
    const source = bounded(sourceText(cell.source), Math.min(remaining, 20_000));
    remaining -= Math.min(remaining, Buffer.byteLength(source.value, "utf8"));
    truncated ||= source.truncated;
    const summary: NotebookCellSummary = {
      index,
      cellType,
      source: source.value,
      executionCount: Number.isInteger(cell.execution_count) ? cell.execution_count : null
    };
    if (options.includeOutputs !== false && cellType === "code" && Array.isArray(cell.outputs)) {
      if (cell.outputs.length > 512) throw new CodexProError(`Notebook cell ${index} contains too many outputs.`);
      summary.outputs = [];
      for (const output of cell.outputs.slice(0, 128)) {
        if (remaining <= 0) { truncated = true; break; }
        const result = outputSummary(output, Math.min(remaining, 12_000));
        summary.outputs.push(result.summary);
        const bytes = Buffer.byteLength(JSON.stringify(result.summary), "utf8");
        remaining -= Math.min(remaining, bytes);
        truncated ||= result.truncated;
      }
    }
    selectedCells.push(summary);
    if (remaining <= 0) { truncated = true; break; }
  }
  const counts = cells.reduce((out: { code: number; markdown: number; raw: number }, cell: any) => {
    const type = cell?.cell_type;
    if (type === "code") out.code += 1;
    else if (type === "markdown") out.markdown += 1;
    else if (type === "raw") out.raw += 1;
    return out;
  }, { code: 0, markdown: 0, raw: 0 });
  const metadata = notebook.metadata && typeof notebook.metadata === "object" ? notebook.metadata : {};
  const language = typeof metadata.language_info?.name === "string" ? metadata.language_info.name : null;
  const kernelName = typeof metadata.kernelspec?.display_name === "string" ? metadata.kernelspec.display_name : typeof metadata.kernelspec?.name === "string" ? metadata.kernelspec.name : null;
  return {
    path: resolved.relPath,
    nbformat: Number.isInteger(notebook.nbformat) ? notebook.nbformat : null,
    nbformatMinor: Number.isInteger(notebook.nbformat_minor) ? notebook.nbformat_minor : null,
    kernelName: kernelName ? redactSensitiveText(kernelName).slice(0, 160) : null,
    language: language ? redactSensitiveText(language).slice(0, 160) : null,
    cellCount: cells.length,
    codeCells: counts.code,
    markdownCells: counts.markdown,
    rawCells: counts.raw,
    selectedCells,
    truncated
  };
}
