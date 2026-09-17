import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createIsolatedExecution, removeIsolatedExecution, sourceGitState } from "../dist/goals/isolation.js";
import { GoalStore } from "../dist/goals/store.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-goal-platform-"));
const goalBase = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-goal-store-"));
function git(args) { const r=spawnSync("git",args,{cwd:root,encoding:"utf8"}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return r.stdout.trim(); }
async function holdExclusive(filePath, milliseconds) {
  const escaped=filePath.replaceAll("'", "''");
  const script=`$f=[System.IO.File]::Open('${escaped}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None); [Console]::Out.WriteLine('LOCKED'); Start-Sleep -Milliseconds ${milliseconds}; $f.Dispose()`;
  const child=spawn("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{stdio:["ignore","pipe","pipe"],windowsHide:true});
  await new Promise((resolve,reject)=>{
    let out="",err="";
    const timeoutMs=20_000;
    const timer=setTimeout(()=>{child.kill();reject(new Error(`lock process readiness timeout after ${timeoutMs} ms: ${err}`));},timeoutMs);
    child.once("error",(error)=>{clearTimeout(timer);reject(error);});
    child.stdout.on("data",(c)=>{out+=String(c);if(out.includes("LOCKED")){clearTimeout(timer);resolve();}});
    child.stderr.on("data",(c)=>{err+=String(c)});
    child.on("exit",(code)=>{if(!out.includes("LOCKED")){clearTimeout(timer);reject(new Error(`lock process exited ${code}: ${err}`));}});
  });
  return child;
}
try {
  git(["init"]); await fs.writeFile(path.join(root,"tracked.txt"),"base\n"); git(["add","tracked.txt"]);
  git(["-c","user.email=goal@example.com","-c","user.name=Goal Smoke","commit","-m","base"]);
  await fs.writeFile(path.join(root,"tracked.txt"),"user dirty\n"); await fs.writeFile(path.join(root,"untracked.txt"),"user untracked\n");
  const workspace={id:"ws_platform",root:await fs.realpath(root),openedAt:new Date().toISOString()};
  const before=await sourceGitState(workspace); assert(before.dirtyPaths.includes("tracked.txt")); assert(before.dirtyPaths.includes("untracked.txt"));
  const store=new GoalStore({baseDir:goalBase,maxGoals:8});
  if(process.platform==="win32"){
    const now=new Date().toISOString();
    const retryGoal={schemaVersion:1,id:"goal_retry-atomic",workspaceId:workspace.id,workspaceRoot:workspace.root,title:"atomic retry",state:"proposed",control:"run",fingerprint:"a".repeat(64),maxWorkers:1,tasks:[],createdAt:now,updatedAt:now};
    await store.save(retryGoal);
    const target=path.join(goalBase,"records",`${retryGoal.id}.json`);
    const locker=await holdExclusive(target,350);
    const retryStarted=Date.now();
    await store.save({...retryGoal,title:"atomic retry updated",updatedAt:new Date().toISOString()});
    assert(Date.now()-retryStarted>=200,"goal atomic replacement did not exercise the Windows retry path");
    if(locker.exitCode===null) await new Promise((resolve)=>locker.once("exit",resolve));
    assert.equal((await store.require(retryGoal.id)).title,"atomic retry updated");
  }
  const isolation=await createIsolatedExecution(store,workspace,"goal_platform",before);
  assert.equal(await fs.readFile(path.join(root,"tracked.txt"),"utf8"),"user dirty\n");
  assert.equal(await fs.readFile(path.join(root,"untracked.txt"),"utf8"),"user untracked\n");
  assert.notEqual(path.resolve(isolation.root).toLowerCase(),path.resolve(root).toLowerCase());
  assert.equal((await fs.readFile(path.join(isolation.root,"tracked.txt"),"utf8")).replaceAll("\r\n","\n"),"base\n");
  await removeIsolatedExecution(workspace,isolation);
  assert.equal(await fs.readFile(path.join(root,"tracked.txt"),"utf8"),"user dirty\n");
  console.log(`goals platform smoke passed (${process.platform})`);
} finally { await fs.rm(root,{recursive:true,force:true}); await fs.rm(goalBase,{recursive:true,force:true}); }
