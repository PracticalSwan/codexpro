import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";
import { extractZipEntry, parseZipBuffer } from "./archiveOps.js";
import { redactSensitiveText } from "./redact.js";

export type DocumentFormat = "pdf" | "docx" | "pptx" | "xlsx";
export interface DocumentReadResult {
  path: string;
  format: DocumentFormat;
  bytes: number;
  sections: number;
  text: string;
  truncated: boolean;
}

function xmlDecode(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function boundedText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const cleaned = redactSensitiveText(text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim());
  if (Buffer.byteLength(cleaned, "utf8") <= maxBytes) return { text: cleaned, truncated: false };
  let out = ""; let used = 0;
  for (const ch of cleaned) {
    const size = Buffer.byteLength(ch, "utf8");
    if (used + size > maxBytes) break;
    out += ch; used += size;
  }
  return { text: `${out}\n...[document output truncated]`, truncated: true };
}

function pdfLiteralStrings(buffer: Buffer): string[] {
  const source = buffer.toString("latin1");
  const out: string[] = [];
  let current = ""; let depth = 0; let escaped = false;
  for (let i = 0; i < source.length && out.length < 4096; i += 1) {
    const ch = source[i];
    if (!depth) { if (ch === "(") { depth = 1; current = ""; } continue; }
    if (escaped) {
      const mapped: Record<string,string> = { n:"\n", r:"\r", t:"\t", b:"\b", f:"\f", "(":"(", ")":")", "\\":"\\" };
      current += mapped[ch] ?? ch; escaped = false; continue;
    }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === "(") { depth += 1; current += ch; continue; }
    if (ch === ")") {
      depth -= 1;
      if (!depth) { if (/[A-Za-z0-9]/.test(current)) out.push(current); }
      else current += ch;
      continue;
    }
    if (depth <= 16) current += ch;
  }
  return out;
}

function xmlText(xml: string, tags: string[]): string {
  const pattern = new RegExp(`<(${tags.join("|")})(?:\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, "gi");
  const values: string[] = [];
  for (const match of xml.matchAll(pattern)) values.push(xmlDecode(match[2].replace(/<[^>]+>/g, "")));
  return values.join("\n");
}

function naturalOrder(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function ooxmlText(config: CodexProConfig, buffer: Buffer, format: Exclude<DocumentFormat,"pdf">): { text: string; sections: number } {
  const entries = parseZipBuffer(config, buffer);
  const files = entries.filter((entry) => !entry.directory);
  const byName = new Map(files.map((entry) => [entry.name, entry]));
  const readXml = (name: string) => {
    const entry = byName.get(name); if (!entry) return "";
    if (entry.expandedBytes > config.maxDocumentBytes) throw new CodexProError(`Document section is too large: ${name}`);
    return extractZipEntry(buffer, entry, config).toString("utf8");
  };
  if (format === "docx") {
    const xml = readXml("word/document.xml");
    if (!xml) throw new CodexProError("DOCX is missing word/document.xml.");
    return { text: xmlText(xml, ["w:t"]), sections: 1 };
  }
  if (format === "pptx") {
    const slides = files.map((entry) => entry.name).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).sort(naturalOrder).slice(0, 512);
    if (!slides.length) throw new CodexProError("PPTX contains no readable slides.");
    return { text: slides.map((name, i) => `# Slide ${i + 1}\n${xmlText(readXml(name), ["a:t"])}`).join("\n\n"), sections: slides.length };
  }
  const sharedXml = readXml("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)].map((m) => xmlText(m[1], ["t"])) : [];
  const sheets = files.map((entry) => entry.name).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort(naturalOrder).slice(0, 512);
  if (!sheets.length) throw new CodexProError("XLSX contains no readable worksheets.");
  const text = sheets.map((name, i) => {
    const xml = readXml(name);
    const cells: string[] = [];
    for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = match[1]; const body = match[2]; const ref = /\br="([^"]+)"/i.exec(attrs)?.[1] ?? "?";
      const type = /\bt="([^"]+)"/i.exec(attrs)?.[1] ?? "";
      let value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? "";
      if (type === "s" && /^\d+$/.test(value)) value = shared[Number(value)] ?? "";
      if (type === "inlineStr") value = xmlText(body, ["t"]);
      value = xmlDecode(value).trim(); if (value) cells.push(`${ref}: ${value}`);
      if (cells.length >= 10000) break;
    }
    return `# Sheet ${i + 1}\n${cells.join("\n")}`;
  }).join("\n\n");
  return { text, sections: sheets.length };
}

export async function readDocument(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { path: string; maxOutputBytes?: number }): Promise<DocumentReadResult> {
  const resolved = guard.resolve(workspace, options.path);
  const stat = await fsp.lstat(resolved.absPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CodexProError("Document must be a regular file.");
  if (stat.size > config.maxDocumentBytes) throw new CodexProError(`Document exceeds size limit (${config.maxDocumentBytes} bytes).`);
  const ext = path.extname(resolved.relPath).toLowerCase();
  if (![".pdf", ".docx", ".pptx", ".xlsx"].includes(ext)) throw new CodexProError(`Unsupported document format: ${ext || "no extension"}.`);
  const format = ext.slice(1) as DocumentFormat; const buffer = await fsp.readFile(resolved.absPath);
  let raw = ""; let sections = 1;
  if (format === "pdf") { if (!buffer.subarray(0,5).equals(Buffer.from("%PDF-"))) throw new CodexProError("Invalid PDF header."); raw = pdfLiteralStrings(buffer).join("\n"); }
  else { const parsed = ooxmlText(config, buffer, format); raw = parsed.text; sections = parsed.sections; }
  const limit = Math.max(1000, Math.min(options.maxOutputBytes ?? config.maxDocumentOutputBytes, config.maxDocumentOutputBytes));
  const bounded = boundedText(raw || "No readable text found.", limit);
  return { path: resolved.relPath, format, bytes: stat.size, sections, text: bounded.text, truncated: bounded.truncated };
}
