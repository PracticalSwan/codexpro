import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import { PathGuard, type Workspace } from "../guard.js";
import { withFileWriteLocks } from "../fsOps.js";
import { preflightChanges } from "../preflightOps.js";
import type { OperationManager } from "../operations/manager.js";
import type { GoalStore } from "./store.js";
import type { GoalRecord } from "./types.js";
import { removeIsolatedExecution, sourceGitState } from "./isolation.js";

function git(cwd:string,args:string[],max:number,input?:string):string{
  const result=spawnSync("git",args,{cwd,encoding:"utf8",maxBuffer:max,input,windowsHide:true,env:{...process.env,NO_COLOR:"1"}});
  if(result.error||result.status!==0) throw new Error(result.stderr?.trim()||result.stdout?.trim()||result.error?.message||`git ${args[0]} failed`);
  return String(result.stdout??"");
}
function sha(value:string):string{return createHash("sha256").update(value).digest("hex");}
function splitZero(value:string):string[]{return value.split("\0").filter(Boolean).map((item)=>item.replaceAll("\\","/"));}

interface IsolatedPatch { patch:string; patchSha256:string; paths:string[]; }
async function isolatedPatch(config:CodexProConfig,sourceGuard:PathGuard,workspace:Workspace,record:GoalRecord):Promise<IsolatedPatch>{
  if(!record.isolation||!record.sourceHead) throw new Error("Goal isolation is missing.");
  const root=record.isolation.root;
  const head=git(root,["rev-parse","HEAD"],64_000).trim();
  if(head!==record.sourceHead) throw new Error("Goal isolation HEAD changed; commits/history changes inside Goal isolation are not projectable.");
  const untracked=splitZero(git(root,["ls-files","--others","--exclude-standard","-z"],config.maxOutputBytes));
  for(const candidate of untracked) sourceGuard.resolve(workspace,candidate,{forWrite:true});
  if(untracked.length) git(root,["add","-N","--",...untracked],config.maxOutputBytes);
  const paths=splitZero(git(root,["diff","--name-only","--no-renames","-z","HEAD"],config.maxOutputBytes));
  if(paths.length>config.maxOperationFiles) throw new Error(`Goal changed too many files; limit is ${config.maxOperationFiles}.`);
  for(const candidate of paths) sourceGuard.resolve(workspace,candidate,{forWrite:true});
  const patch=git(root,["diff","--binary","--no-ext-diff","--no-textconv","--no-renames","HEAD"],config.maxOperationBytes+1);
  if(Buffer.byteLength(patch,"utf8")>config.maxOperationBytes) throw new Error(`Goal projection patch exceeds ${config.maxOperationBytes} bytes.`);
  return {patch,patchSha256:sha(patch),paths:[...new Set(paths)].sort()};
}

export interface GoalReviewResult {
  record: GoalRecord;
  paths: string[];
  patchSha256: string;
  reviewFingerprint: string;
  patch: string;
  preflight: Awaited<ReturnType<typeof preflightChanges>>;
}

export async function reviewGoal(config:CodexProConfig,guard:PathGuard,store:GoalStore,workspace:Workspace,id:string):Promise<GoalReviewResult>{
  const record=await store.require(id);
  if(record.workspaceId!==workspace.id) throw new Error("Goal does not belong to this workspace.");
  if(!["awaiting_review","awaiting_projection"].includes(record.state)) throw new Error(`Goal cannot be reviewed from state ${record.state}.`);
  const computed=await isolatedPatch(config,guard,workspace,record);
  const isolationWorkspace:Workspace={id:record.id,root:record.isolation!.root,openedAt:record.isolation!.createdAt};
  const isolationConfig:CodexProConfig={...config,defaultRoot:isolationWorkspace.root,allowedRoots:[isolationWorkspace.root],authToken:undefined,requireHttpToken:false};
  const isolationGuard=new PathGuard(isolationConfig);
  const existing=computed.paths.filter((candidate)=>fs.existsSync(isolationGuard.resolve(isolationWorkspace,candidate).absPath));
  const preflight=await preflightChanges(isolationConfig,isolationGuard,isolationWorkspace,{paths:existing,maxFileBytes:config.maxWriteBytes});
  if(!preflight.ok) throw new Error(`Goal review preflight failed: ${preflight.issues.slice(0,8).map((issue)=>`${issue.path}:${issue.kind}`).join(", ")}`);
  const reviewFingerprint=sha([record.fingerprint,record.sourceHead??"",record.sourceFingerprint??"",computed.patchSha256,...computed.paths].join("\0"));
  const saved=await store.update(id,(current)=>{
    if(!["awaiting_review","awaiting_projection"].includes(current.state)) throw new Error(`Goal review state changed to ${current.state}.`);
    current.reviewFingerprint=reviewFingerprint; current.reviewedPatchSha256=computed.patchSha256; current.reviewedPaths=computed.paths; current.state="awaiting_projection"; return current;
  });
  return {record:saved,paths:computed.paths,patchSha256:computed.patchSha256,reviewFingerprint,patch:computed.patch,preflight};
}

export async function projectGoal(request:{
  config:CodexProConfig; guard:PathGuard; store:GoalStore; workspace:Workspace; operationManager:OperationManager;
  id:string; expectedSourceHead:string; expectedSourceFingerprint:string; reviewFingerprint:string; authorize:boolean;
}):Promise<GoalRecord>{
  if(request.authorize!==true) throw new Error("Goal projection requires explicit authorize=true.");
  const release=await request.store.acquireScheduler(request.id);
  try {
  const record=await request.store.require(request.id);
  if(record.workspaceId!==request.workspace.id) throw new Error("Goal does not belong to this workspace.");
  if(record.state!=="awaiting_projection") throw new Error(`Goal cannot project from state ${record.state}.`);
  if(record.sourceHead!==request.expectedSourceHead) throw new Error("Expected source HEAD does not match the approved Goal source HEAD.");
  if(record.sourceFingerprint!==request.expectedSourceFingerprint) throw new Error("Expected source fingerprint does not match the approved Goal source state.");
  if(record.reviewFingerprint!==request.reviewFingerprint) throw new Error("Review fingerprint does not match the current Goal review.");
  const currentSource=await sourceGitState(request.workspace);
  if(currentSource.head!==record.sourceHead) throw new Error("Source HEAD changed since Goal start; projection is stale.");
  if(currentSource.fingerprint!==record.sourceFingerprint) throw new Error("Source working state changed since Goal start; projection is stale.");
  const computed=await isolatedPatch(request.config,request.guard,request.workspace,record);
  if(computed.patchSha256!==record.reviewedPatchSha256) throw new Error("Goal isolation changed after review; review again before projection.");
  const recomputedReview=sha([record.fingerprint,record.sourceHead??"",record.sourceFingerprint??"",computed.patchSha256,...computed.paths].join("\0"));
  if(recomputedReview!==record.reviewFingerprint) throw new Error("Goal review fingerprint is stale.");
  const initialDirty=new Set(record.sourceDirtyPaths??[]);
  const overlap=computed.paths.filter((candidate)=>initialDirty.has(candidate));
  if(overlap.length) throw new Error(`Goal projection overlaps pre-existing source changes: ${overlap.slice(0,8).join(", ")}`);
  const absPaths=computed.paths.map((candidate)=>request.guard.resolve(request.workspace,candidate,{forWrite:true}).absPath);
  const execution=await request.operationManager.execute(
    {kind:"goal_projection",idempotencyKey:`${record.id}:${record.reviewFingerprint}`},
    ()=>withFileWriteLocks(absPaths,async()=>{
      const latest=await sourceGitState(request.workspace);
      if(latest.head!==record.sourceHead||latest.fingerprint!==record.sourceFingerprint) throw new Error("Source changed while acquiring projection locks.");
      if(!computed.patch.trim()) return {paths:computed.paths,bytes:0};
      git(request.workspace.root,["apply","--check","--binary","--whitespace=nowarn"],request.config.maxOperationBytes,computed.patch);
      git(request.workspace.root,["apply","--binary","--whitespace=nowarn"],request.config.maxOperationBytes,computed.patch);
      return {paths:computed.paths,bytes:Buffer.byteLength(computed.patch,"utf8")};
    }),
    (value)=>({paths:value.paths,bytes:value.bytes,items:value.paths.length})
  );
  const projected=await request.store.update(request.id,(current)=>{
    if(current.state==="projected") return current;
    if(current.state!=="awaiting_projection"||current.reviewFingerprint!==record.reviewFingerprint) throw new Error("Goal state changed before projection finalization.");
    current.state="projected"; current.projectionOperationId=execution.receipt.id; return current;
  });
  if(projected.isolation) await removeIsolatedExecution(request.workspace,projected.isolation).catch(()=>undefined);
  return projected;
  } finally {
    await release();
  }
}
