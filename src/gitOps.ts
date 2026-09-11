import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";
import { redactSensitiveText } from "./redact.js";

export interface GitRuntimeInfo {
  available: boolean;
  executable: string | null;
  version: string | null;
  error?: string;
}

export interface GitCommitSummary {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
}

function resolveGitExecutable(): string | null {
  const lookup = process.platform === "win32"
    ? spawnSync("where.exe", ["git"], { encoding: "utf8", windowsHide: true })
    : spawnSync("/bin/sh", ["-lc", "command -v git"], { encoding: "utf8" });
  if (lookup.error || lookup.status !== 0) return null;
  return String(lookup.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export function gitRuntimeInfo(): GitRuntimeInfo {
  const executable = resolveGitExecutable();
  const versionResult = executable
    ? spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true })
    : spawnSync("git", ["--version"], { encoding: "utf8", windowsHide: true });
  if (versionResult.error || versionResult.status !== 0) {
    return {
      available: false,
      executable,
      version: null,
      error: versionResult.error?.message || String(versionResult.stderr ?? "").trim() || `git exited with status ${versionResult.status}`
    };
  }
  return {
    available: true,
    executable,
    version: String(versionResult.stdout ?? "").trim() || null
  };
}

function runGit(cwd: string, args: string[], maxOutputBytes: number): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: maxOutputBytes,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.error) {
    return `git unavailable or failed: ${result.error.message}`;
  }
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "";
    const stdout = result.stdout?.trim() || "";
    return stderr || stdout || `git exited with status ${result.status}`;
  }
  return redactSensitiveText(result.stdout.trim() || "(no output)");
}

function isGitFailure(output: string): boolean {
  const trimmed = output.trim().toLowerCase();
  return (
    trimmed.startsWith("fatal:") ||
    trimmed.startsWith("error:") ||
    trimmed.startsWith("git unavailable or failed:") ||
    trimmed.startsWith("git exited with status") ||
    trimmed.startsWith("usage: git ") ||
    trimmed.includes("not a git repository")
  );
}

function outputLines(output: string): string[] {
  return output.trim() === "(no output)" ? [] : output.split("\n").map((line) => line.trim()).filter(Boolean);
}

function pathIsInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function pathScopedGitContext(workspace: Workspace, guard: PathGuard, filePath: string): { cwd: string; relPath: string } {
  const resolved = guard.resolve(workspace, filePath);
  let start = resolved.absPath;
  try {
    if (!fs.statSync(start).isDirectory()) start = path.dirname(start);
  } catch {
    start = path.dirname(start);
  }
  const topLevel = spawnSync("git", ["-C", start, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    maxBuffer: 64_000,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (!topLevel.error && topLevel.status === 0) {
    const rawRoot = String(topLevel.stdout ?? "").trim();
    if (rawRoot) {
      let repoRoot = path.resolve(rawRoot);
      try { repoRoot = fs.realpathSync.native(repoRoot); } catch {}
      if (pathIsInside(workspace.root, repoRoot)) {
        return { cwd: repoRoot, relPath: path.relative(repoRoot, resolved.absPath).split(path.sep).join("/") || "." };
      }
    }
  }
  return { cwd: workspace.root, relPath: resolved.relPath };
}

export function gitStatus(config: CodexProConfig, workspace: Workspace, guard?: PathGuard, filePath?: string, staged = false): string {
  const args = staged ? ["diff", "--cached", "--name-status"] : ["status", "--short", "--branch"];
  let cwd = workspace.root;
  if (filePath?.trim()) {
    if (!guard) return "path-scoped git status requires a path guard";
    const context = pathScopedGitContext(workspace, guard, filePath);
    cwd = context.cwd;
    args.push("--", context.relPath);
  }
  return runGit(cwd, args, config.maxOutputBytes);
}

export function gitDiff(config: CodexProConfig, guard: PathGuard, workspace: Workspace, filePath?: string, staged = false): string {
  const args = ["diff", "--no-color", "--no-ext-diff", "--no-textconv"];
  if (staged) args.push("--staged");
  let cwd = workspace.root;
  if (filePath?.trim()) {
    const context = pathScopedGitContext(workspace, guard, filePath);
    cwd = context.cwd;
    args.push("--", context.relPath);
  }
  return runGit(cwd, args, config.maxOutputBytes);
}

export function gitDiffStats(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  filePath?: string,
  staged = false
): { additions: number; deletions: number; changed: boolean; error?: string } {
  const args = ["diff", "--numstat", "--no-ext-diff", "--no-textconv"];
  if (staged) args.push("--staged");
  let cwd = workspace.root;
  if (filePath?.trim()) {
    const context = pathScopedGitContext(workspace, guard, filePath);
    cwd = context.cwd;
    args.push("--", context.relPath);
  }
  const output = runGit(cwd, args, config.maxOutputBytes);
  if (isGitFailure(output)) return { additions: 0, deletions: 0, changed: false, error: output };
  const lines = outputLines(output);
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    const [added, deleted] = line.split("\t", 2);
    if (/^\d+$/.test(added)) additions += Number(added);
    if (/^\d+$/.test(deleted)) deletions += Number(deleted);
  }
  return { additions, deletions, changed: lines.length > 0 };
}

export function gitDiffStatus(config: CodexProConfig, guard: PathGuard, workspace: Workspace, filePath?: string, staged = false): string {
  const args = ["diff", "--name-status"];
  if (staged) args.push("--staged");
  const untrackedArgs = ["status", "--short", "--untracked-files=normal", "--ignore-submodules=all"];
  let cwd = workspace.root;
  if (filePath?.trim()) {
    const context = pathScopedGitContext(workspace, guard, filePath);
    cwd = context.cwd;
    args.push("--", context.relPath);
    untrackedArgs.push("--", context.relPath);
  }
  const diffStatus = runGit(cwd, args, config.maxOutputBytes);
  if (staged || isGitFailure(diffStatus)) return diffStatus;
  const untracked = runGit(cwd, untrackedArgs, config.maxOutputBytes);
  if (isGitFailure(untracked)) return diffStatus;
  const untrackedLines = outputLines(untracked).filter((line) => line.startsWith("?? "));
  const lines = [...outputLines(diffStatus), ...untrackedLines];
  return lines.length ? lines.join("\n") : "(no output)";
}

export function gitLog(config: CodexProConfig, workspace: Workspace, maxCount = 8): string {
  const count = Math.max(1, Math.min(Math.floor(maxCount), 30));
  return runGit(workspace.root, ["log", `--max-count=${count}`, "--oneline", "--decorate"], config.maxOutputBytes);
}

export function gitRecentCommits(config: CodexProConfig, workspace: Workspace, maxCount = 8): GitCommitSummary[] {
  const count = Math.max(1, Math.min(Math.floor(maxCount), 30));
  const result = spawnSync("git", [
    "log",
    `--max-count=${count}`,
    "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"
  ], {
    cwd: workspace.root,
    encoding: "utf8",
    maxBuffer: config.maxOutputBytes,
    env: { ...process.env, NO_COLOR: "1" }
  });
  if (result.error || result.status !== 0) return [];
  return String(result.stdout ?? "")
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", shortSha = "", author = "", date = "", ...subjectParts] = record.split("\x1f");
      return {
        sha: redactSensitiveText(sha),
        shortSha: redactSensitiveText(shortSha),
        subject: redactSensitiveText(subjectParts.join("\x1f")),
        author: redactSensitiveText(author),
        date: redactSensitiveText(date)
      };
    })
    .filter((commit) => Boolean(commit.sha));
}

export function assertGitCleanEnoughForWrite(_workspace: Workspace): void {
  // Reserved for future policy hooks. The first version allows writes and returns diffs.
  return;
}


export interface GitHistoryCommit extends GitCommitSummary { parents: string[]; }
export interface GitHistoryResult { commits: GitHistoryCommit[]; path?: string; }
export interface GitShowResult { revision: string; path?: string; text: string; }
export interface GitBlameLine { line: number; commit: string; author: string; text: string; }
export interface GitBlameResult { path: string; lines: GitBlameLine[]; truncated: boolean; }

function safeRevision(revision: string | undefined): string {
  const value = (revision ?? "HEAD").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._~^\/-]{0,199}$/.test(value)) throw new CodexProError("Invalid Git revision.");
  return value;
}

export function gitHistory(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { maxCount?: number; path?: string } = {}): GitHistoryResult {
  const count = Math.max(1, Math.min(Math.floor(options.maxCount ?? 20), 100));
  const args = ["log", `--max-count=${count}`, "--format=%H%x1f%h%x1f%P%x1f%an%x1f%aI%x1f%s%x1e"];
  let relPath: string | undefined;
  if (options.path?.trim()) { relPath = guard.resolve(workspace, options.path).relPath; args.push("--", relPath); }
  const result = spawnSync("git", args, { cwd: workspace.root, encoding: "utf8", maxBuffer: config.maxOutputBytes, env: { ...process.env, NO_COLOR: "1" } });
  if (result.error || result.status !== 0) throw new CodexProError(redactSensitiveText(result.error?.message || result.stderr?.trim() || `git log exited ${result.status}`));
  const commits = String(result.stdout ?? "").split("\x1e").map(r=>r.trim()).filter(Boolean).map(record=>{
    const [sha="",shortSha="",parents="",author="",date="",...subject]=record.split("\x1f");
    return { sha, shortSha, parents: parents.split(/\s+/).filter(Boolean), author:redactSensitiveText(author), date, subject:redactSensitiveText(subject.join("\x1f")) };
  });
  return { commits, ...(relPath ? { path: relPath } : {}) };
}

export function gitShow(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { revision?: string; path?: string }): GitShowResult {
  const revision = safeRevision(options.revision); const args=["show","--no-color","--no-ext-diff","--no-textconv","--format=medium",revision]; let relPath:string|undefined;
  if(options.path?.trim()){relPath=guard.resolve(workspace,options.path).relPath; args.push("--",relPath);} const text=runGit(workspace.root,args,config.maxOutputBytes); if(isGitFailure(text)) throw new CodexProError(text);
  return {revision,...(relPath?{path:relPath}:{}),text};
}

export function gitBlame(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { path: string; revision?: string; maxLines?: number }): GitBlameResult {
  const relPath = guard.resolve(workspace, options.path).relPath;
  const revision = safeRevision(options.revision);
  const limit = Math.max(1, Math.min(Math.floor(options.maxLines ?? 500), 2000));
  const requestedLines = limit + 1;
  const result = spawnSync(
    "git",
    ["blame", "--line-porcelain", "-L", `1,+${requestedLines}`, revision, "--", relPath],
    { cwd: workspace.root, encoding: "utf8", maxBuffer: config.maxOutputBytes, env: { ...process.env, NO_COLOR: "1" } }
  );
  if (result.error || result.status !== 0) {
    throw new CodexProError(redactSensitiveText(result.error?.message || result.stderr?.trim() || `git blame exited ${result.status}`));
  }
  const parsed: GitBlameLine[] = [];
  let commit = "";
  let author = "";
  let lineNo = 0;
  for (const raw of String(result.stdout ?? "").split(/\r?\n/)) {
    const header = raw.match(/^([a-f0-9]{40,64})\s+\d+\s+(\d+)/i);
    if (header) { commit = header[1]; lineNo = Number(header[2]); continue; }
    if (raw.startsWith("author ")) { author = redactSensitiveText(raw.slice(7)); continue; }
    if (raw.startsWith("\t") && parsed.length < requestedLines) {
      parsed.push({ line: lineNo, commit, author, text: redactSensitiveText(raw.slice(1)) });
    }
  }
  return { path: relPath, lines: parsed.slice(0, limit), truncated: parsed.length > limit };
}
