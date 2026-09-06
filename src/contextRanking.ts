import type { WorkspaceAnalysis } from "./analysis/types.js";

export type ContextStrategy = "task" | "symbol" | "change";
export type ContextItemKind = "instructions" | "target" | "related" | "test" | "git";

export interface RankedContextCandidate {
  path: string;
  kind: Exclude<ContextItemKind, "instructions" | "git">;
  score: number;
  reasons: string[];
}

export interface ContextRankingRequest {
  analysis: WorkspaceAnalysis;
  strategy: ContextStrategy;
  targetPath?: string;
  targetSymbol?: string;
  changedPaths?: string[];
  includeTests?: boolean;
}

function roleFor(analysis: WorkspaceAnalysis, filePath: string): string | undefined {
  return analysis.files.find((file) => file.path === filePath)?.role;
}

function boundedScore(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

export function rankContextCandidates(request: ContextRankingRequest): RankedContextCandidate[] {
  const scores = new Map<string, { score: number; reasons: Set<string> }>();
  const add = (filePath: string, score: number, reason: string) => {
    if (!filePath || filePath === request.targetPath) return;
    if (request.includeTests === false && roleFor(request.analysis, filePath) === "test") return;
    const item = scores.get(filePath) ?? { score: 0, reasons: new Set<string>() };
    item.score = Math.max(item.score, boundedScore(score));
    item.reasons.add(reason.slice(0, 160));
    scores.set(filePath, item);
  };

  const changed = new Set((request.changedPaths ?? []).filter(Boolean));
  for (const filePath of changed) add(filePath, request.strategy === "change" ? 920 : 620, "explicit changed path");

  for (const rel of request.analysis.relationships) {
    const touchesTarget = Boolean(request.targetPath) && (rel.from === request.targetPath || rel.to === request.targetPath);
    const touchesChange = changed.has(rel.from) || changed.has(rel.to);
    if (!touchesTarget && !touchesChange) continue;
    const candidate = rel.from === request.targetPath || changed.has(rel.to) ? rel.to : rel.from;
    const test = roleFor(request.analysis, candidate) === "test" || rel.kind === "tests";
    const base = request.strategy === "change" ? 780 : 700;
    add(candidate, test ? base + 90 : base, `${rel.kind} ${rel.from === candidate ? "dependent" : "dependency"}`);
  }

  if (request.targetSymbol) {
    const symbol = request.targetSymbol.toLowerCase();
    for (const item of request.analysis.symbols) {
      if (item.name.toLowerCase() === symbol) add(item.path, request.strategy === "symbol" ? 900 : 650, `defines symbol ${request.targetSymbol}`);
    }
  }

  if (request.includeTests !== false) {
    for (const file of request.analysis.files) {
      if (file.role !== "test") continue;
      const relatedByStem = request.targetPath
        ? file.path.toLowerCase().includes(request.targetPath.split("/").pop()!.replace(/\.[^.]+$/, "").toLowerCase())
        : false;
      if (relatedByStem) add(file.path, request.strategy === "change" ? 820 : 640, "likely test for target");
    }
  }

  return [...scores.entries()]
    .map(([filePath, value]) => ({
      path: filePath,
      kind: roleFor(request.analysis, filePath) === "test" ? "test" as const : "related" as const,
      score: boundedScore(value.score),
      reasons: [...value.reasons].slice(0, 6)
    }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .slice(0, 48);
}
