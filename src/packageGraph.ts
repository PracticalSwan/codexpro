import fsp from "node:fs/promises";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { PathGuard } from "./guard.js";
import { listFiles } from "./fsOps.js";

export interface PackageNode { name: string; path: string; ecosystem: "npm"|"python"|"cargo"|"go"; dependencies: string[]; }
export interface PackageEdge { from: string; to: string; kind: "dependency"; }
export interface PackageGraph { packages: PackageNode[]; edges: PackageEdge[]; truncated: boolean; }

function quoted(text:string,key:string):string|undefined { const m=text.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*["']([^"']+)["']`)); return m?.[1]; }
function tomlDeps(text:string):string[] { const block=text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1]??""; return [...block.matchAll(/["']([^"'<>=~!\s;,]+)[^"']*["']/g)].map(m=>m[1]); }
function cargoDeps(text:string):string[] { const block=text.match(/\[dependencies\]([\s\S]*?)(?:\n\[|$)/)?.[1]??""; return block.split(/\r?\n/).map(l=>l.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1]).filter((x):x is string=>Boolean(x)); }

export async function buildPackageGraph(config:CodexProConfig, guard:PathGuard, workspace:Workspace):Promise<PackageGraph>{
 const files=await listFiles(guard,workspace,{root:".",includeHidden:false,maxFiles:Math.min(10000,config.analysisLimits.maxInventoryFiles)});
 const manifests=files.filter(f=>/(^|\/)(package\.json|pyproject\.toml|Cargo\.toml|go\.mod)$/.test(f)).slice(0,2000);
 const packages:PackageNode[]=[];
 for(const rel of manifests){
  const resolved=guard.resolve(workspace,rel); let text:string; try{text=await fsp.readFile(resolved.absPath,"utf8");}catch{continue;}
  if(Buffer.byteLength(text)>Math.min(config.maxReadBytes,512000)) continue;
  const dir=path.posix.dirname(rel)==="."?".":path.posix.dirname(rel);
  try{
   if(rel.endsWith("package.json")){const j=JSON.parse(text); const name=typeof j.name==="string"?j.name:(dir==="."?path.basename(workspace.root):dir); const deps=[...Object.keys(j.dependencies??{}),...Object.keys(j.devDependencies??{}),...Object.keys(j.peerDependencies??{})]; packages.push({name,path:dir,ecosystem:"npm",dependencies:[...new Set(deps)]});}
   else if(rel.endsWith("pyproject.toml")){const name=quoted(text,"name")??dir; packages.push({name,path:dir,ecosystem:"python",dependencies:tomlDeps(text)});}
   else if(rel.endsWith("Cargo.toml")){const name=quoted(text,"name")??dir; packages.push({name,path:dir,ecosystem:"cargo",dependencies:cargoDeps(text)});}
   else {const name=text.match(/^module\s+([^\s]+)$/m)?.[1]??dir; const deps=[...text.matchAll(/^\s*([^\s]+)\s+v\d/mg)].map(m=>m[1]); packages.push({name,path:dir,ecosystem:"go",dependencies:deps});}
  }catch{continue;}
 }
 const names=new Set(packages.map(p=>p.name)); const edges:PackageEdge[]=[];
 for(const p of packages) for(const dep of p.dependencies) if(names.has(dep)) edges.push({from:p.name,to:dep,kind:"dependency"});
 return {packages,edges,truncated:files.length>=Math.min(10000,config.analysisLimits.maxInventoryFiles)||manifests.length>=2000};
}

export function packagesForChangedPaths(graph:PackageGraph, changedPaths:string[]){
 const affected=graph.packages.filter(p=>changedPaths.some(c=>p.path==="."||c===p.path||c.startsWith(`${p.path}/`))).map(p=>p.name);
 const set=new Set(affected); let changed=true; while(changed){changed=false; for(const e of graph.edges) if(set.has(e.to)&&!set.has(e.from)){set.add(e.from);changed=true;}}
 return {affectedPackages:affected,dependentPackages:[...set].filter(x=>!affected.includes(x))};
}
