import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import type { PathGuard, Workspace } from "./guard.js";
import { readTextFile } from "./fsOps.js";

export interface InstructionResolution {
  targetPath: string;
  sources: string[];
  text: string;
}

function candidateDirs(targetPath: string): string[] {
  const normalized = targetPath.replaceAll("\\", "/").replace(/^\.\//, "");
  const parts = normalized && normalized !== "." ? normalized.split("/").filter(Boolean) : [];
  const dirs = [""];
  const directoryParts = parts.length && parts.at(-1)?.includes(".") ? parts.slice(0, -1) : parts;
  for (let index = 0; index < directoryParts.length; index += 1) dirs.push(directoryParts.slice(0, index + 1).join("/"));
  return dirs;
}

async function agentsInDir(workspace: Workspace, dir: string): Promise<string[]> {
  const names = ["AGENTS.override.md", "AGENTS.md", "agents.md", ".agents.md"];
  let entries: fs.Dirent[];
  try { entries = await fsp.readdir(path.join(workspace.root, dir), { withFileTypes: true }); } catch { return []; }
  const files = entries.filter((entry) => entry.isFile());
  for (const name of names) {
    const entry = files.find((item) => item.name === name) ?? files.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (entry) return [dir ? `${dir}/${entry.name}` : entry.name];
  }
  return [];
}

export async function instructionsForPath(config: CodexProConfig, guard: PathGuard, workspace: Workspace, targetPath: string): Promise<InstructionResolution> {
  const resolvedTarget = guard.resolve(workspace, targetPath).relPath;
  const candidates = (await Promise.all(candidateDirs(resolvedTarget).map((dir) => agentsInDir(workspace, dir)))).flat();
  const sources: string[] = [];
  const chunks: string[] = [];
  const seen = new Set<string>();
  for (const rel of candidates) {
    const resolved = guard.resolve(workspace, rel);
    const real = fs.realpathSync.native(resolved.absPath).toLowerCase();
    if (seen.has(real)) continue;
    seen.add(real);
    const read = await readTextFile(config, guard, workspace, rel, { maxBytes: Math.min(config.maxReadBytes, 80_000) });
    sources.push(rel);
    chunks.push(`--- ${rel} ---\n${read.text}`);
  }
  return { targetPath: resolvedTarget, sources, text: chunks.join("\n\n") || "No applicable AGENTS-style instructions found." };
}