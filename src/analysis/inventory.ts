import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fsp from "node:fs/promises";
import type { CodexProConfig } from "../config.js";
import { listFiles, textScanByteLimit } from "../fsOps.js";
import type { PathGuard, Workspace } from "../guard.js";
import { classifyFileRole, classifyLanguage, isEntrypoint, isGeneratedFile } from "./classify.js";
import type { InventoryFile, InventoryResult } from "./types.js";

function gitVisibleFiles(workspace: Workspace, maxFiles: number): { tracked: string[]; visible: string[] } | null {
  const maxBuffer = Math.max(1_000_000, Math.min(64_000_000, (maxFiles + 1) * 512));
  const run = (args: string[]) => spawnSync("git", args, {
    cwd: workspace.root,
    encoding: "utf8",
    maxBuffer,
    env: { ...process.env, NO_COLOR: "1" }
  });
  const tracked = run(["ls-files", "--cached", "-z"]);
  if (tracked.error || tracked.status !== 0) return null;
  const visible = run(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  if (visible.error || visible.status !== 0) return null;
  const paths = (output: string) => output.split("\0").map((item) => item.trim()).filter(Boolean);
  return { tracked: paths(String(tracked.stdout ?? "")), visible: paths(String(visible.stdout ?? "")) };
}

function candidatePriority(filePath: string, tracked: boolean): number {
  const role = classifyFileRole(filePath);
  const generated = isGeneratedFile(filePath) || role === "generated";
  if (generated) return tracked ? 4 : 5;
  if (tracked && ["source", "config", "infrastructure"].includes(role)) return 0;
  if (!tracked && ["source", "config", "infrastructure"].includes(role)) return 1;
  return tracked ? 2 : 3;
}

export async function inventoryWorkspace(config: CodexProConfig, guard: PathGuard, workspace: Workspace): Promise<InventoryResult> {
  const maxFiles = config.analysisLimits.maxInventoryFiles;
  const gitFiles = gitVisibleFiles(workspace, maxFiles);
  const tracked = gitFiles?.tracked ?? [];
  const trackedSet = new Set(tracked);
  const discoveryLimit = Math.min(100_000, maxFiles + Math.min(tracked.length, maxFiles) + 1);
  // In Git workspaces, include tracked files and only non-ignored untracked files.
  // Falling back to the guarded walker keeps non-Git workspaces inspectable.
  const discovered = gitFiles?.visible ?? await listFiles(guard, workspace, { root: ".", includeHidden: true, maxFiles: discoveryLimit });
  const candidates = [...new Set([...tracked, ...discovered])].sort((a, b) => {
    const priority = candidatePriority(a, trackedSet.has(a)) - candidatePriority(b, trackedSet.has(b));
    return priority || a.localeCompare(b);
  });
  const candidateDiscoveryTruncated = gitFiles ? discovered.length > discoveryLimit : discovered.length >= discoveryLimit;
  const files: InventoryFile[] = [];
  let processedCandidates = 0;

  for (const candidate of candidates) {
    if (files.length >= maxFiles) break;
    processedCandidates += 1;
    try {
      const resolved = guard.resolve(workspace, candidate);
      const stat = await fsp.stat(resolved.absPath);
      if (!stat.isFile()) continue;
      await guard.assertTextFile(resolved.absPath, textScanByteLimit(config));
      const language = classifyLanguage(resolved.relPath);
      files.push({
        path: resolved.relPath,
        bytes: stat.size,
        modifiedMs: stat.mtimeMs,
        language,
        role: classifyFileRole(resolved.relPath, language),
        generated: isGeneratedFile(resolved.relPath),
        entrypoint: isEntrypoint(resolved.relPath)
      });
    } catch {
      // Blocked, escaping, unreadable, binary, and oversized files are absent by design.
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const truncated = candidateDiscoveryTruncated || processedCandidates < candidates.length;
  const fingerprint = createHash("sha256")
    .update(files.map((file) => `${file.path}:${file.bytes}:${file.modifiedMs}`).join("\n"))
    .digest("hex");
  const warnings = truncated
    ? [`Inventory bounded at ${maxFiles} files; tracked source/config/infrastructure candidates are prioritized ahead of untracked and generated artifacts.`]
    : [];
  return {
    files,
    fingerprint,
    coverage: {
      inventoryFiles: files.length,
      analyzedFiles: 0,
      scannedBytes: 0,
      symbolCount: 0,
      relationshipCount: 0,
      truncated,
      warnings
    }
  };
}
