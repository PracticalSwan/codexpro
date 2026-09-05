import type { CodexProConfig } from "./config.js";
import type { PathGuard, Workspace } from "./guard.js";
import { readTextFile } from "./fsOps.js";
import { searchWorkspace } from "./searchOps.js";
import { gitRecentCommits, gitStatus } from "./gitOps.js";
import { instructionsForPath } from "./instructionOps.js";
import { redactSensitiveText } from "./redact.js";
import { inspectWorkspace } from "./analysis/index.js";
import { rankContextWithDependencies } from "./analysis/rank.js";

function utf8Prefix(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0, end = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size; end += char.length;
  }
  return value.slice(0, end);
}

export async function readMany(request: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace;
  items: Array<{ path: string; startLine?: number; endLine?: number }>;
  maxTotalBytes?: number;
}) {
  const maxTotalBytes = Math.max(1, Math.min(request.maxTotalBytes ?? request.config.maxReadBytes, request.config.maxReadBytes * 4));
  let remaining = maxTotalBytes;
  const items: any[] = [];
  for (const item of request.items.slice(0, 64)) {
    if (remaining <= 0) { items.push({ ok: false, path: item.path, error: "aggregate byte budget exhausted" }); continue; }
    try {
      const read = await readTextFile(request.config, request.guard, request.workspace, item.path, { startLine: item.startLine, endLine: item.endLine, maxBytes: Math.min(remaining, request.config.maxReadBytes) });
      const text = utf8Prefix(read.text, remaining);
      remaining -= Buffer.byteLength(text, "utf8");
      items.push({ ok: true, ...read, text });
    } catch (error) {
      items.push({ ok: false, path: item.path, error: redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 480) });
    }
  }
  return { items, totalBytes: maxTotalBytes - remaining, truncated: remaining <= 0 };
}
export async function searchMany(request: {
  config: CodexProConfig; guard: PathGuard; workspace: Workspace;
  items: Array<{ query: string; root?: string; regex?: boolean; glob?: string }>;
  maxTotalResults?: number; maxTotalBytes?: number;
}) {
  const resultBudget = Math.max(1, Math.min(request.maxTotalResults ?? request.config.maxSearchResults, request.config.maxSearchResults * 4));
  const byteBudget = Math.max(1, Math.min(request.maxTotalBytes ?? request.config.maxOutputBytes, request.config.maxOutputBytes * 4));
  let resultsLeft = resultBudget, bytesLeft = byteBudget, totalResults = 0;
  const items: any[] = [];
  for (const item of request.items.slice(0, 32)) {
    if (resultsLeft <= 0 || bytesLeft <= 0) { items.push({ ok: false, query: item.query, error: "aggregate search budget exhausted" }); continue; }
    try {
      const result = await searchWorkspace(request.config, request.guard, request.workspace, {
        query: item.query, root: item.root, regex: item.regex, glob: item.glob,
        maxResults: Math.min(resultsLeft, request.config.maxSearchResults), includeHidden: false
      });
      const matches = result.matches.slice(0, resultsLeft);
      let text = utf8Prefix(result.text, bytesLeft);
      bytesLeft -= Buffer.byteLength(text, "utf8");
      resultsLeft -= matches.length;
      totalResults += matches.length;
      items.push({ ok: true, query: item.query, text, matches, truncated: result.truncated || text.length < result.text.length, used: result.used });
    } catch (error) {
      items.push({ ok: false, query: item.query, error: redactSensitiveText(error instanceof Error ? error.message : String(error)).slice(0, 480) });
    }
  }
  return { items, totalResults, totalBytes: byteBudget - bytesLeft, truncated: resultsLeft <= 0 || bytesLeft <= 0 };
}

export interface GatheredContextSection { kind: "instructions" | "target" | "related" | "git" | "commits"; source: string; text: string; }

export async function gatherContext(request: { config: CodexProConfig; guard: PathGuard; workspace: Workspace; targetPath?: string; maxBytes?: number }) {
  const maxBytes = Math.max(1000, Math.min(request.maxBytes ?? request.config.maxReadBytes, request.config.maxReadBytes * 4));
  let remaining = maxBytes;
  const sections: GatheredContextSection[] = [];
  const add = (kind: GatheredContextSection["kind"], source: string, text: string) => {
    if (remaining <= 0 || !text) return;
    const bounded = utf8Prefix(redactSensitiveText(text), remaining);
    remaining -= Buffer.byteLength(bounded, "utf8");
    sections.push({ kind, source, text: bounded });
  };
  const targetPath = request.targetPath ?? ".";
  const instructions = await instructionsForPath(request.config, request.guard, request.workspace, targetPath);
  add("instructions", instructions.sources.join(", ") || "none", instructions.text);
  try {
    const read = await readTextFile(request.config, request.guard, request.workspace, targetPath, { maxBytes: Math.min(remaining, request.config.maxReadBytes) });
    add("target", read.path, read.text);
    if (request.config.analysisEnabled && remaining > 0) {
      try {
        const analysis = await inspectWorkspace(request.config, request.guard, request.workspace);
        const related = rankContextWithDependencies(read.path, analysis.relationships, 4);
        for (const item of related) {
          if (remaining <= 0) break;
          try {
            const relatedRead = await readTextFile(request.config, request.guard, request.workspace, item.path, { maxBytes: Math.min(remaining, Math.max(1000, Math.floor(maxBytes / 5))) });
            add("related", `${item.path} (${item.reasons.join("; ")})`, relatedRead.text);
          } catch {}
        }
      } catch {}
    }
  } catch {}
  add("git", "git status", gitStatus(request.config, request.workspace));
  const commits = gitRecentCommits(request.config, request.workspace, 5);
  add("commits", "recent commits", commits.map((c) => `${c.shortSha} ${c.subject}`).join("\n"));
  return { targetPath, sections, text: sections.map((s) => `## ${s.kind}: ${s.source}\n${s.text}`).join("\n\n"), bytes: maxBytes - remaining, truncated: remaining <= 0 };
}