import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Workspace } from "../guard.js";
import type { GoalIsolation } from "./types.js";
import type { GoalStore } from "./store.js";

function git(cwd: string, args: string[], max = 4_000_000): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: max, windowsHide: true, env: { ...process.env, NO_COLOR: "1" } });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || result.error?.message || `git ${args[0]} failed`);
  return String(result.stdout ?? "");
}
function canonical(value: string): string { try { return fs.realpathSync.native(value); } catch { return path.resolve(value); } }
function samePath(a: string,b: string): boolean { const left=canonical(a),right=canonical(b); return process.platform==="win32"?left.toLowerCase()===right.toLowerCase():left===right; }

export interface SourceGitState { head: string; fingerprint: string; dirtyPaths: string[]; }
function statusPaths(raw: string): string[] {
  const fields = raw.split("\0").filter(Boolean); const out: string[] = [];
  const add=(value:string)=>{const normalized=value.split(path.sep).join("/");if(normalized&&!out.includes(normalized))out.push(normalized);};
  for (let i=0;i<fields.length;i++) {
    const field=fields[i]; if (field.length<4) continue;
    const name=field.slice(3); const code=field.slice(0,2); add(name);
    if ((code.includes("R")||code.includes("C")) && fields[i+1]) add(fields[++i]);
  }
  return out.sort();
}

function dirtyEvidence(root:string,paths:string[]):string{
  const hash=createHash("sha256");
  for(const rel of paths){
    hash.update(rel).update("\0");
    const abs=path.resolve(root,...rel.split("/"));
    const back=path.relative(root,abs);
    if(back.startsWith("..")||path.isAbsolute(back)){hash.update("outside\0");continue;}
    try{
      const stat=fs.lstatSync(abs);hash.update(`${stat.size}:${Math.floor(stat.mtimeMs)}:${stat.mode}\0`);
      if(stat.isSymbolicLink()) hash.update(fs.readlinkSync(abs)).update("\0");
      else if(stat.isFile()) {const fd=fs.openSync(abs,"r");try{const size=Math.min(stat.size,65_536),buffer=Buffer.alloc(size);fs.readSync(fd,buffer,0,size,0);hash.update(buffer);}finally{fs.closeSync(fd);}}
    }catch(error){hash.update(`missing:${(error as NodeJS.ErrnoException).code??"error"}\0`);}
  }
  return hash.digest("hex");
}

export async function sourceGitState(workspace: Workspace): Promise<SourceGitState> {
  const top=git(workspace.root,["rev-parse","--show-toplevel"]).trim();
  if (!samePath(top,workspace.root)) throw new Error("Goal execution currently requires the workspace root to be the Git repository root.");
  const head=git(workspace.root,["rev-parse","HEAD"]).trim();
  const status=git(workspace.root,["status","--porcelain=v1","-z","--untracked-files=all"]);
  const dirtyPaths=statusPaths(status);
  const evidence=dirtyEvidence(workspace.root,dirtyPaths);
  return { head, fingerprint:createHash("sha256").update(head).update("\0").update(status).update("\0").update(evidence).digest("hex"), dirtyPaths };
}

export async function createIsolatedExecution(store: GoalStore, workspace: Workspace, goalId: string, source: SourceGitState): Promise<GoalIsolation> {
  const root=store.worktreeDir(goalId);
  if (fs.existsSync(root)) throw new Error(`Goal isolation already exists: ${goalId}`);
  await fsp.mkdir(path.dirname(root),{recursive:true,mode:0o700});
  git(workspace.root,["worktree","add","--detach",root,source.head]);
  const isolationHead=git(root,["rev-parse","HEAD"]).trim();
  if (isolationHead!==source.head) {
    try { git(workspace.root,["worktree","remove","--force",root]); } catch {}
    throw new Error("Goal isolation HEAD did not match the approved source HEAD.");
  }
  return { root:canonical(root), sourceHead:source.head, createdAt:new Date().toISOString() };
}

export async function removeIsolatedExecution(workspace: Workspace, isolation: GoalIsolation): Promise<void> {
  if (!fs.existsSync(isolation.root)) return;
  git(workspace.root,["worktree","remove","--force",isolation.root]);
}

export function goalPlatformStatus(goalDir: string): { available: boolean; detail: string } {
  const version=spawnSync("git",["--version"],{encoding:"utf8",windowsHide:true});
  if (version.error||version.status!==0) return {available:false,detail:"Git is unavailable; Goal worktrees require Git."};
  let probe=path.resolve(goalDir);
  while (!fs.existsSync(probe)) {
    const parent=path.dirname(probe);
    if (parent===probe) return {available:false,detail:"Goal storage has no existing writable ancestor."};
    probe=parent;
  }
  try {
    if (!fs.statSync(probe).isDirectory()) return {available:false,detail:"Goal storage ancestor is not a directory."};
    fs.accessSync(probe,fs.constants.W_OK);
  } catch { return {available:false,detail:"Goal storage ancestor is not writable."}; }
  return {available:true,detail:`${String(version.stdout??"").trim()}; detached worktree execution supported on ${process.platform}.`};
}
