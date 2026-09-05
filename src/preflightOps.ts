import fsp from "node:fs/promises";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { PathGuard } from "./guard.js";
import { hasSecretValue } from "./redact.js";
export type PreflightIssueKind="blocked_path"|"missing"|"oversized"|"unexpected_binary"|"conflict_marker"|"secret";
export interface PreflightIssue { path:string; kind:PreflightIssueKind; detail:string; }
export async function preflightChanges(config:CodexProConfig,guard:PathGuard,workspace:Workspace,options:{paths:string[];maxFileBytes?:number}){
 const unique=[...new Set(options.paths.map(String))].slice(0,config.maxOperationFiles); const max=Math.max(1024,Math.min(options.maxFileBytes??config.maxWriteBytes,config.maxWriteBytes)); const issues:PreflightIssue[]=[]; let scanned=0;
 for(const candidate of unique){let r;try{r=guard.resolve(workspace,candidate);}catch{issues.push({path:candidate,kind:"blocked_path",detail:"path is blocked or outside workspace"});continue;}
  let stat;try{stat=await fsp.lstat(r.absPath);}catch{issues.push({path:r.relPath,kind:"missing",detail:"file does not exist"});continue;}
  if(!stat.isFile()){issues.push({path:r.relPath,kind:"unexpected_binary",detail:"not a regular file"});continue;} if(stat.size>max){issues.push({path:r.relPath,kind:"oversized",detail:`file exceeds ${max} bytes`});continue;}
  const b=await fsp.readFile(r.absPath); scanned+=b.byteLength; if(b.includes(0)){issues.push({path:r.relPath,kind:"unexpected_binary",detail:"binary content detected"});continue;} const text=b.toString("utf8");
  if(/^(<{7}|={7}|>{7})(?:\s|$)/m.test(text)) issues.push({path:r.relPath,kind:"conflict_marker",detail:"merge conflict marker detected"}); if(hasSecretValue(text)) issues.push({path:r.relPath,kind:"secret",detail:"secret-like content detected"});
 }
 return {ok:issues.length===0,paths:unique,issues,scannedBytes:scanned};
}
