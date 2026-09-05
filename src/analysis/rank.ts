import type { AnalysisSearchIntent, StructuredSearchMatch, WorkspaceAnalysis } from "./types.js";

const GROUPS = ["definitions", "references", "tests", "configuration", "documentation", "other"] as const;

export function emptySearchGroups(): Record<(typeof GROUPS)[number], StructuredSearchMatch[]> {
  return { definitions: [], references: [], tests: [], configuration: [], documentation: [], other: [] };
}

export function classifySearchIntent(query: string, requested: AnalysisSearchIntent = "auto", regex = false): Exclude<AnalysisSearchIntent, "auto"> {
  if (requested !== "auto") return requested;
  if (regex || /\s/.test(query) || /^['"].*['"]$/.test(query)) return "text";
  return /^[A-Za-z_$][\w$]*$/.test(query) ? "symbol" : "text";
}

export function sortStructuredMatches(matches: StructuredSearchMatch[]): StructuredSearchMatch[] {
  return matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);
}

export function groupForFile(analysis: WorkspaceAnalysis, filePath: string, isDefinition: boolean): StructuredSearchMatch["group"] {
  if (isDefinition) return "definitions";
  const role = analysis.files.find((file) => file.path === filePath)?.role;
  if (role === "test") return "tests";
  if (role === "config") return "configuration";
  if (role === "docs") return "documentation";
  return "references";
}


export function rankContextWithDependencies(
  targetPath: string,
  relationships: WorkspaceAnalysis["relationships"],
  maxResults = 6
): Array<{ path: string; score: number; reasons: string[] }> {
  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  const add = (candidate: string, score: number, reason: string) => {
    if (!candidate || candidate === targetPath) return;
    const current = scores.get(candidate) ?? { score: 0, reasons: new Set<string>() };
    current.score = Math.max(current.score, score);
    current.reasons.add(reason);
    scores.set(candidate, current);
  };
  for (const rel of relationships) {
    if (rel.from === targetPath) add(rel.to, rel.kind === "tests" ? 190 : 170, `${rel.kind} dependency of target`);
    if (rel.to === targetPath) add(rel.from, rel.kind === "tests" ? 200 : 180, `${rel.kind} dependent of target`);
  }
  const direct = new Set(scores.keys());
  for (const rel of relationships) {
    if (direct.has(rel.from)) add(rel.to, 120, `second-order ${rel.kind} dependency`);
    if (direct.has(rel.to)) add(rel.from, rel.kind === "tests" ? 150 : 130, `second-order ${rel.kind} dependent`);
  }
  return [...scores.entries()]
    .map(([filePath, value]) => ({ path: filePath, score: value.score, reasons: [...value.reasons] }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, maxResults));
}
