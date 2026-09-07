import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { CodexProConfig } from "../config.js";
import { PathGuard, type Workspace } from "../guard.js";
import { runBash } from "../bashOps.js";
import { runChecks } from "../checksOps.js";
import { OperationStore } from "../operations/store.js";
import { OperationManager } from "../operations/manager.js";
import type { GoalStore } from "./store.js";
import { createIsolatedExecution, sourceGitState } from "./isolation.js";
import type { GoalProposalInput, GoalRecord, GoalTask } from "./types.js";
import { boundedGoalError, normalizeGoalTasks, proposalFingerprint } from "./types.js";
import type { GoalTaskExecutor } from "./scheduler.js";

function safeLine(value: unknown, label: string, max: number, optional=false): string | undefined {
  const text=String(value??"").replace(/[\r\n\0]+/g," ").trim();
  if(!text&&optional) return undefined;
  if(!text||text.length>max) throw new Error(`${label} must be 1-${max} characters.`);
  return text;
}

export async function proposeGoal(store:GoalStore,input:GoalProposalInput,limits:{maxTasks?:number;maxWorkers?:number}={}):Promise<GoalRecord>{
  const title=safeLine(input.title,"Goal title",160)!;
  const summary=safeLine(input.summary,"Goal summary",1000,true);
  const maxTasks=Math.max(1,Math.min(256,Math.floor(limits.maxTasks??64)));
  const workerLimit=Math.max(1,Math.min(8,Math.floor(limits.maxWorkers??8)));
  const tasks=normalizeGoalTasks(input.tasks,maxTasks);
  const maxWorkers=Math.max(1,Math.min(workerLimit,Math.floor(input.maxWorkers??Math.min(2,workerLimit))));
  const fingerprint=proposalFingerprint({workspaceId:input.workspace.id,title,summary,maxWorkers,tasks});
  const now=new Date().toISOString();
  const record:GoalRecord={schemaVersion:1,id:`goal_${randomUUID()}`,workspaceId:input.workspace.id,workspaceRoot:path.resolve(input.workspace.root),title,...(summary?{summary}:{}),state:"proposed",control:"pause",fingerprint,maxWorkers,tasks,createdAt:now,updatedAt:now};
  return store.save(record);
}

export async function approveGoal(store:GoalStore,id:string,fingerprint:string):Promise<GoalRecord>{
  return store.update(id,(record)=>{
    if(record.state!=="proposed") throw new Error(`Goal cannot be approved from state ${record.state}.`);
    if(record.fingerprint!==String(fingerprint??"").toLowerCase()) throw new Error("Goal approval fingerprint does not match the current proposal.");
    record.state="approved"; record.control="pause"; return record;
  });
}

function runtimeForGoal(config:CodexProConfig,isolationRoot:string):CodexProConfig{
  return {
    ...config,
    defaultRoot:isolationRoot,
    allowedRoots:[isolationRoot],
    authToken:undefined,
    requireHttpToken:false,
    bashSessionId:undefined,
    requireBashSession:false,
    writeMode:"workspace",
    toolMode:"full",
    connectionTest:false,
    toolCards:false,
    allowGitPush:false,
    codeGraphEnabled:false,
    lspEnabled:false,
    artifactExportEnabled:false,
    codexSessions:"off",
    executionBackend:"host"
  };
}

function workerEnv():NodeJS.ProcessEnv{
  const allow=new Set(["PATH","Path","SystemRoot","WINDIR","ComSpec","PATHEXT","TEMP","TMP","HOME","USERPROFILE","LOCALAPPDATA","APPDATA","ProgramFiles","ProgramFiles(x86)","ProgramW6432"]);
  const env:NodeJS.ProcessEnv={NO_COLOR:"1"};
  for(const [key,value] of Object.entries(process.env)) if(value!==undefined&&allow.has(key)) env[key]=value;
  return env;
}

function launchWorker(store:GoalStore,id:string):void{
  const worker=fileURLToPath(new URL("./worker.js",import.meta.url));
  const child=spawn(process.execPath,[worker,"--goal-dir",store.baseDir,"--goal-id",id],{
    detached:true,stdio:"ignore",windowsHide:true,env:workerEnv()
  });
  child.unref();
}

export async function startGoal(config:CodexProConfig,store:GoalStore,workspace:Workspace,id:string):Promise<GoalRecord>{
  let runtime!:CodexProConfig;
  const claimed=await store.update(id,async(record)=>{
    if(record.workspaceId!==workspace.id||path.resolve(record.workspaceRoot).toLowerCase()!==path.resolve(workspace.root).toLowerCase()) throw new Error("Goal does not belong to this workspace.");
    if(record.state!=="approved") throw new Error(`Goal cannot start from state ${record.state}.`);
    if(record.maxWorkers>config.maxGoalWorkers) throw new Error(`Goal worker count exceeds the current limit (${config.maxGoalWorkers}).`);
    if(record.tasks.length>config.maxGoalTasks) throw new Error(`Goal task count exceeds the current limit (${config.maxGoalTasks}).`);
    const source=await sourceGitState(workspace);
    const isolation=await createIsolatedExecution(store,workspace,record.id,source);
    runtime=runtimeForGoal(config,isolation.root);
    record.sourceHead=source.head; record.sourceFingerprint=source.fingerprint; record.sourceDirtyPaths=source.dirtyPaths;
    record.isolation=isolation; record.control="run"; record.state="running"; record.error=undefined;
    return record;
  });
  try { await store.saveRuntime(id,runtime); launchWorker(store,id); return claimed; }
  catch(error){
    await store.update(id,(record)=>{record.state="failed";record.error=boundedGoalError(error);return record;}).catch(()=>undefined);
    throw error;
  }
}

export async function pauseGoal(store:GoalStore,id:string):Promise<GoalRecord>{
  return store.update(id,(record)=>{
    if(record.state!=="running") throw new Error(`Goal cannot pause from state ${record.state}.`);
    record.control="pause"; record.state="paused"; return record;
  });
}

export async function resumeGoal(store:GoalStore,id:string):Promise<GoalRecord>{
  const record=await store.update(id,(current)=>{
    if(current.state!=="paused") throw new Error(`Goal cannot resume from state ${current.state}.`);
    current.control="run"; current.state="running"; return current;
  });
  if(!(await store.schedulerOwnerAlive(id))) launchWorker(store,id);
  return record;
}

export async function cancelGoal(store:GoalStore,id:string):Promise<GoalRecord>{
  const before=await store.require(id);
  if(before.state==="awaiting_projection" && await store.schedulerOwnerAlive(id)) throw new Error("Goal projection is already in progress and cannot be canceled concurrently.");
  return store.update(id,(record)=>{
    if(["projected","canceled","failed"].includes(record.state)) return record;
    if(["awaiting_review","awaiting_projection"].includes(record.state)) { record.control="cancel"; record.state="canceled"; return record; }
    record.control="cancel"; record.state="canceled";
    for(const task of record.tasks) if(task.state==="pending") task.state="canceled";
    return record;
  });
}

export function createGoalTaskExecutor(config:CodexProConfig,store:GoalStore,goal:GoalRecord):GoalTaskExecutor{
  if(!goal.isolation) throw new Error("Goal isolation is not initialized.");
  const workspace:Workspace={id:goal.id,root:goal.isolation.root,openedAt:goal.isolation.createdAt};
  const guard=new PathGuard(config);
  const operations=new OperationManager(new OperationStore({baseDir:config.operationDir,maxReceipts:config.maxOperationReceipts}),workspace.id);
  return async(_current:GoalRecord,task:GoalTask)=>{
    const started=Date.now();
    if(task.kind==="command"){
      const execution=await operations.execute(
        {kind:"goal_task_command",idempotencyKey:`${goal.id}:${task.id}`},
        ()=>runBash(config,guard,workspace,String(task.command??""),{timeoutMs:config.maxOperationDurationMs}),
        (result)=>({durationMs:result.durationMs,exitCode:result.exitCode})
      );
      const result=execution.result;
      if(!result) return {ok:execution.receipt.state==="completed",summary:`operation ${execution.receipt.state}`,operationId:execution.receipt.id};
      return {ok:result.exitCode===0&&result.terminationReason==="normal",summary:`exit ${result.exitCode}; ${result.terminationReason}`,operationId:execution.receipt.id,durationMs:result.durationMs,exitCode:result.exitCode};
    }
    const execution=await operations.execute(
      {kind:"goal_task_check",idempotencyKey:`${goal.id}:${task.id}`},
      ()=>runChecks({config,guard,workspace,checkIds:[String(task.checkId??"")],timeoutMs:config.maxOperationDurationMs}),
      (result)=>({items:result.results.length,durationMs:result.results.reduce((sum,item)=>sum+item.durationMs,0)})
    );
    const result=execution.result;
    if(!result) return {ok:execution.receipt.state==="completed",summary:`operation ${execution.receipt.state}`,operationId:execution.receipt.id};
    return {ok:result.ok,summary:result.ok?"check passed":"check failed",operationId:execution.receipt.id,durationMs:Date.now()-started,exitCode:result.results[0]?.exitCode??null};
  };
}
