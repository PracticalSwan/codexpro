import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CodexProConfig } from "../config.js";
import type { AnalysisProvider, AnalysisSearchIntent, StructuredSearchMatch, StructuredSearchResult } from "./types.js";
import { resolveCommand } from "../searchBackends.js";
import { makeRestrictedBashEnv } from "../bashOps.js";
import { redactSensitiveText } from "../redact.js";

class LspRpc {
  private buffer=Buffer.alloc(0); private nextId=1;
  private pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout}>();
  private closed=false;
  constructor(private readonly child:ChildProcessWithoutNullStreams, private readonly timeoutMs:number){
    child.stdout.on("data",(chunk)=>{this.buffer=Buffer.concat([this.buffer,Buffer.from(chunk)]);this.parse();});
    const fail=(error:Error)=>{for(const [,p] of this.pending){clearTimeout(p.timer);p.reject(error);}this.pending.clear();};
    child.on("error",(error)=>fail(error)); child.on("close",()=>{this.closed=true;fail(new Error("LSP process closed."));});
  }
  private parse(){while(true){const headerEnd=this.buffer.indexOf("\r\n\r\n");if(headerEnd<0)return;const header=this.buffer.subarray(0,headerEnd).toString("ascii");const match=header.match(/Content-Length:\s*(\d+)/i);if(!match){this.buffer=this.buffer.subarray(headerEnd+4);continue;}const length=Number(match[1]);const end=headerEnd+4+length;if(this.buffer.length<end)return;const body=this.buffer.subarray(headerEnd+4,end).toString("utf8");this.buffer=this.buffer.subarray(end);let value:any;try{value=JSON.parse(body);}catch{continue;}if(typeof value?.id==="number"&&this.pending.has(value.id)){const p=this.pending.get(value.id)!;this.pending.delete(value.id);clearTimeout(p.timer);if(value.error)p.reject(new Error(redactSensitiveText(String(value.error?.message??"LSP request failed"))));else p.resolve(value.result);}}}
  private send(value:any){if(this.closed)throw new Error("LSP process is closed.");const body=Buffer.from(JSON.stringify(value),"utf8");this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);this.child.stdin.write(body);}
  request(method:string,params:any):Promise<any>{const id=this.nextId++;this.send({jsonrpc:"2.0",id,method,params});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`LSP request timed out: ${method}`));},this.timeoutMs);timer.unref?.();this.pending.set(id,{resolve,reject,timer});});}
  notify(method:string,params:any={}){this.send({jsonrpc:"2.0",method,params});}
  async close(){if(this.closed)return;try{await this.request("shutdown",null);}catch{}try{this.notify("exit",{});}catch{}this.child.stdin.end();await Promise.race([new Promise<void>(r=>this.child.once("close",()=>r())),new Promise<void>(r=>setTimeout(r,300))]);if(!this.closed){try{this.child.kill("SIGTERM");}catch{}await new Promise(r=>setTimeout(r,100));}if(!this.closed&&this.child.pid){if(process.platform==="win32")spawnSync("taskkill",["/PID",String(this.child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else{try{this.child.kill("SIGKILL");}catch{}}}}
}

function symbolPath(item:any):string|undefined { const uri=item?.location?.uri??item?.uri; if(typeof uri!=="string"||!uri.startsWith("file:"))return undefined;try{return fileURLToPath(uri);}catch{return undefined;} }

export class LspProvider implements AnalysisProvider {
  readonly id="lsp";
  constructor(private readonly config:CodexProConfig){}
  async availability(_workspace:{id:string;root:string}){
    if(!this.config.lspEnabled) return {available:false,detail:"LSP integration is disabled."};
    if(!this.config.lspExecutable) return {available:false,detail:"LSP integration requires CODEXPRO_LSP_EXECUTABLE."};
    const executable=resolveCommand(this.config.lspExecutable);return executable?{available:true,detail:`Configured LSP executable: ${path.basename(executable)}`}:{available:false,detail:"Configured LSP executable is unavailable."};
  }
  async search(request:{workspaceId:string;root:string;query:string;intent:AnalysisSearchIntent}):Promise<Partial<StructuredSearchResult>>{
    const availability=await this.availability({id:request.workspaceId,root:request.root});if(!availability.available)throw new Error(availability.detail??"LSP unavailable.");
    const executable=resolveCommand(this.config.lspExecutable)!;const child=spawn(executable,this.config.lspArgs,{cwd:request.root,stdio:["pipe","pipe","pipe"],windowsHide:true,env:makeRestrictedBashEnv(this.config)});let stderr="";child.stderr.on("data",c=>{if(stderr.length<4000)stderr+=String(c).slice(0,4000-stderr.length);});const rpc=new LspRpc(child,this.config.lspTimeoutMs);
    try {await rpc.request("initialize",{processId:null,rootUri:pathToFileURL(request.root).href,capabilities:{workspace:{symbol:{}}}});rpc.notify("initialized",{});const raw=await rpc.request("workspace/symbol",{query:request.query});const rows=Array.isArray(raw)?raw:Array.isArray(raw?.items)?raw.items:[];const matches:StructuredSearchMatch[]=rows.slice(0,Math.min(this.config.maxSearchResults,100)).map((item:any)=>{const p=symbolPath(item);if(!p)return null;const line=Math.max(1,Number(item?.location?.range?.start?.line??item?.range?.start?.line??0)+1);return {path:p,line,text:redactSensitiveText(String(item?.name??request.query)).slice(0,400),group:"definitions" as const,score:185,reasons:["LSP workspace symbol"],confidence:"strong" as const,source:"lsp"};}).filter((x:any):x is StructuredSearchMatch=>Boolean(x));return {matches,groups:{definitions:matches,references:[],tests:[],configuration:[],documentation:[],other:[]},warnings:stderr.trim()?[`LSP stderr: ${redactSensitiveText(stderr.trim()).slice(0,300)}`]:[]};}
    finally {await rpc.close();}
  }
}
