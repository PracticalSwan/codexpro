import fsp from "node:fs/promises";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { PathGuard } from "./guard.js";
import { introducedSecretFindings } from "./redact.js";
import { spawnSync } from "node:child_process";
import path from "node:path";
function headBaseline(root: string, relPath: string, maxBytes: number): string | null {
  if (relPath.includes(":") || relPath.includes("\\") || relPath.startsWith("-")) return null;
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 4_096
  });
  if (top.status !== 0 || top.error || !top.stdout.trim()) return null;
  const repoRoot = path.resolve(top.stdout.trim());
  const repoRelative = path.relative(repoRoot, path.resolve(root, relPath)).split(path.sep).join("/");
  if (!repoRelative || repoRelative === ".." || repoRelative.startsWith("../") || path.isAbsolute(repoRelative)) return null;
  const result = spawnSync("git", ["show", `HEAD:${repoRelative}`], {
    cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 5_000,
    maxBuffer: maxBytes + 1024
  });
  return result.status === 0 && !result.error ? result.stdout : null;
}
export type PreflightIssueKind="blocked_path"|"missing"|"oversized"|"unexpected_binary"|"conflict_marker"|"secret";
export interface PreflightIssue { path:string; kind:PreflightIssueKind; detail:string; line?:number; category?:string; baseline?:"HEAD"|"unavailable"; }
export async function preflightChanges(config:CodexProConfig,guard:PathGuard,workspace:Workspace,options:{paths:string[];maxFileBytes?:number}){
 const unique=[...new Set(options.paths.map(String))].slice(0,config.maxOperationFiles); const max=Math.max(1024,Math.min(options.maxFileBytes??config.maxWriteBytes,config.maxWriteBytes)); const issues:PreflightIssue[]=[]; const notices:PreflightIssue[]=[]; let scanned=0;
 for(const candidate of unique){let r;try{r=guard.resolve(workspace,candidate);}catch{issues.push({path:candidate,kind:"blocked_path",detail:"path is blocked or outside workspace"});continue;}
  let stat;try{stat=await fsp.lstat(r.absPath);}catch{issues.push({path:r.relPath,kind:"missing",detail:"file does not exist"});continue;}
  if(!stat.isFile()){issues.push({path:r.relPath,kind:"unexpected_binary",detail:"not a regular file"});continue;} if(stat.size>max){issues.push({path:r.relPath,kind:"oversized",detail:`file exceeds ${max} bytes`});continue;}
  const b=await fsp.readFile(r.absPath); scanned+=b.byteLength; if(b.includes(0)){issues.push({path:r.relPath,kind:"unexpected_binary",detail:"binary content detected"});continue;} const text=b.toString("utf8");
  if(/^(<{7}|={7}|>{7})(?:\s|$)/m.test(text)) issues.push({path:r.relPath,kind:"conflict_marker",detail:"merge conflict marker detected"}); const baseline = headBaseline(workspace.root, r.relPath.replace(/\\/g, "/"), max);
  const newSecrets = introducedSecretFindings(baseline ?? "", text);
  for(const finding of newSecrets.slice(0,16)) issues.push({path:r.relPath,kind:"secret",detail:"new secret-like content detected; value withheld",line:finding.line,category:finding.category,baseline:baseline===null?"unavailable":"HEAD"});
  if(baseline!==null && !newSecrets.length && introducedSecretFindings("",text).length) notices.push({path:r.relPath,kind:"secret",detail:"unchanged secret-like content present in HEAD; review separately",baseline:"HEAD"});

 }
 return {ok:issues.length===0,paths:unique,issues,notices,scannedBytes:scanned};
}
