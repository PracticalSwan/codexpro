import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { CodexProConfig } from "../config.js";
import type { AnalysisProvider, AnalysisSearchIntent, StructuredSearchMatch, StructuredSearchResult } from "./types.js";
import { resolveCommand } from "../searchBackends.js";
import { makeRestrictedBashEnv } from "../bashOps.js";
import { redactSensitiveText } from "../redact.js";

function resolveCodeGraphExecutable(config: CodexProConfig): string | null {
  const resolved = resolveCommand(config.codeGraphExecutable ?? "codegraph");
  if (!resolved || process.platform !== "win32") return resolved;
  if (/\.(?:exe|cmd|bat)$/i.test(resolved)) return resolved;
  for (const suffix of [".exe", ".cmd", ".bat"]) {
    const candidate = `${resolved}${suffix}`;
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch {}
  }
  return resolved;
}

function codeGraphInvocation(executable: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(executable)) return { command: executable, args };
  const npmShim = path.join(path.dirname(executable), "node_modules", "@colbymchenry", "codegraph", "npm-shim.js");
  try {
    if (fs.statSync(npmShim).isFile()) return { command: process.execPath, args: [npmShim, ...args] };
  } catch {}
  throw new Error("CodeGraph Windows npm shim could not be resolved safely.");
}

function run(config:CodexProConfig, root:string, args:string[]): {stdout:string;stderr:string} {
  const executable=resolveCodeGraphExecutable(config);
  if(!executable) throw new Error("CodeGraph executable is unavailable.");
  const invocation=codeGraphInvocation(executable,[...config.codeGraphArgs,...args]);
  const result=spawnSync(invocation.command,invocation.args,{cwd:root,encoding:"utf8",maxBuffer:Math.max(config.maxOutputBytes,1_000_000),windowsHide:true,env:makeRestrictedBashEnv(config)});
  if(result.error||result.status!==0) throw new Error(redactSensitiveText(result.error?.message||String(result.stderr??"").trim()||`CodeGraph exited with status ${result.status}`));
  return {stdout:String(result.stdout??""),stderr:redactSensitiveText(String(result.stderr??""))};
}

function parseJson(text:string):any { try{return JSON.parse(text);}catch{throw new Error("CodeGraph did not return valid JSON.");} }
function staleStatus(value:any,maxAgeMs:number): string | null {
  if(value?.stale===true||value?.current===false) return "CodeGraph index is stale.";
  const analysis=String(value?.analysis??value?.status??"").toLowerCase();
  if(/stale|out.?of.?date|drift|needs?.?sync|dirty/.test(analysis)) return `CodeGraph index is stale (${analysis}).`;
  const pending=value?.pendingChanges??value?.pending_changes??value?.drift?.files;
  const pendingCount = pending && typeof pending === "object" && !Array.isArray(pending)
    ? Object.values(pending as Record<string, unknown>).reduce<number>((total, item) => total + (Number(item) || 0), 0)
    : 0;
  if((Array.isArray(pending)&&pending.length>0)||(typeof pending==="number"&&pending>0)||pendingCount>0) return "CodeGraph index has pending changes and is stale.";
  const indexState=String(value?.index?.state??"").toLowerCase();
  if(value?.index?.reindexRecommended===true||indexState==="stale") return "CodeGraph index needs a rebuild.";
  const hasExplicitFreshness = pending !== undefined || indexState === "complete";
  const rawTime=value?.lastIndexed??value?.lastSyncAt??value?.last_sync_at??value?.lastSync??value?.manifest?.lastSyncAt;
  if(!hasExplicitFreshness&&rawTime){const at=typeof rawTime==="number"?rawTime:Date.parse(String(rawTime)); if(Number.isFinite(at)&&Date.now()-at>maxAgeMs)return "CodeGraph index is older than the configured freshness window.";}
  return null;
}

function extractMatches(value:any,limit:number):StructuredSearchMatch[]{
  const rows=Array.isArray(value)?value:Array.isArray(value?.results)?value.results:Array.isArray(value?.matches)?value.matches:Array.isArray(value?.items)?value.items:[];
  return rows.slice(0,limit).map((item:any)=>{
    const node=item?.node??item;
    const p=String(node?.path??node?.file??node?.filePath??node?.location?.path??"");
    if(!p) return null;
    const fallbackLine=node?.range?.start?.line !== undefined ? Number(node.range.start.line)+1 : 1;
    const line=Math.max(1,Number(node?.line??node?.startLine??node?.location?.line??fallbackLine)||1);
    const text=redactSensitiveText(String(node?.text??node?.signature??node?.name??node?.symbol??node?.preview??"CodeGraph match")).slice(0,400);
    return {path:p,line,text,group:"references" as const,score:175,reasons:["CodeGraph structural search"],confidence:"strong" as const,source:"codegraph"};
  }).filter((x:any):x is StructuredSearchMatch=>Boolean(x));
}

export class CodeGraphProvider implements AnalysisProvider {
  readonly id="codegraph";
  constructor(private readonly config:CodexProConfig){}
  async availability(workspace:{id:string;root:string}){
    if(!this.config.codeGraphEnabled) return {available:false,detail:"CodeGraph integration is disabled."};
    if(!resolveCodeGraphExecutable(this.config)) return {available:false,detail:"CodeGraph executable is unavailable; CodexPro will not install it automatically."};
    try { const status=parseJson(run(this.config,workspace.root,["status",workspace.root,"--json"]).stdout); const stale=staleStatus(status,this.config.codeGraphMaxStaleMs); return stale?{available:false,detail:stale}:{available:true,detail:"CodeGraph index is available and current."}; }
    catch(error){return {available:false,detail:redactSensitiveText(error instanceof Error?error.message:String(error))};}
  }
  async search(request:{workspaceId:string;root:string;query:string;intent:AnalysisSearchIntent}):Promise<Partial<StructuredSearchResult>>{
    const availability=await this.availability({id:request.workspaceId,root:request.root}); if(!availability.available) throw new Error(availability.detail??"CodeGraph unavailable.");
    const result=parseJson(run(this.config,request.root,["query",request.query,"--path",request.root,"--json","--limit",String(Math.min(this.config.maxSearchResults,100))]).stdout);
    const matches=extractMatches(result,Math.min(this.config.maxSearchResults,100));
    return {matches,warnings:[],groups:{definitions:[],references:matches,tests:[],configuration:[],documentation:[],other:[]}};
  }
}

export async function syncCodeGraph(config:CodexProConfig,workspace:{id:string;root:string}){
  if(!config.codeGraphEnabled) throw new Error("CodeGraph integration is disabled.");
  if(!resolveCodeGraphExecutable(config)) throw new Error("CodeGraph executable is unavailable; CodexPro will not install it automatically.");
  const result=run(config,workspace.root,["sync",workspace.root]);
  return {synced:true,output:redactSensitiveText(result.stdout).slice(0,config.maxOutputBytes)};
}
