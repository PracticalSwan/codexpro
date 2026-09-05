import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { CodexProConfig } from "./config.js";
import type { PathGuard, Workspace } from "./guard.js";
import { listFiles } from "./fsOps.js";

export function resolveCommand(command: string | undefined): string | null {
  const value = command?.trim();
  if (!value) return null;
  if (path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    try { return fs.statSync(value).isFile() ? fs.realpathSync.native(value) : null; } catch { return null; }
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) return null;
  const lookup = process.platform === "win32"
    ? spawnSync("where.exe", [value], { encoding: "utf8", windowsHide: true })
    : spawnSync("/bin/sh", ["-lc", `command -v ${value}`], { encoding: "utf8" });
  if (lookup.error || lookup.status !== 0) return null;
  return String(lookup.stdout ?? "").split(/\r?\n/).map((line)=>line.trim()).find(Boolean) ?? null;
}

function fuzzyScore(candidate: string, query: string): number {
  const c=candidate.toLowerCase(), q=query.toLowerCase();
  if (!q) return 0;
  const base=path.posix.basename(c);
  let score=0;
  if (base===q) score+=1000;
  else if (base.startsWith(q)) score+=700;
  else if (base.includes(q)) score+=500;
  else if (c.includes(q)) score+=300;
  let cursor=0, gaps=0;
  for (const ch of q) { const at=c.indexOf(ch,cursor); if(at<0) return -1; gaps+=at-cursor; cursor=at+1; }
  score += Math.max(1,200-gaps-c.length/10);
  return score;
}

export async function findFiles(config:CodexProConfig,guard:PathGuard,workspace:Workspace,options:{query:string;root?:string;maxResults?:number}) {
  const query=String(options.query??"").trim(); if(!query) throw new Error("query is required.");
  const limit=Math.max(1,Math.min(options.maxResults??50,config.maxSearchResults));
  const files=await listFiles(guard,workspace,{root:options.root??".",includeHidden:false,maxFiles:Math.min(20000,config.analysisLimits.maxInventoryFiles)});
  const matches=files.map((p)=>({path:p,score:fuzzyScore(p,query)})).filter((m)=>m.score>=0).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,limit);
  return {query,matches,backend:"node" as const,truncated:files.length>=Math.min(20000,config.analysisLimits.maxInventoryFiles),optional:{fff:Boolean(resolveCommand("fff")),ffgrep:Boolean(resolveCommand("ffgrep"))}};
}
