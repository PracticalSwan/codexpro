import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { withWindowsExclusiveLock } from "./windows-exclusive-lock.mjs";
import { createIsolatedExecution, removeIsolatedExecution, sourceGitState } from "../dist/goals/isolation.js";
import { GoalStore } from "../dist/goals/store.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-goal-platform-"));
const goalBase = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-goal-store-"));
function git(args) { const r=spawnSync("git",args,{cwd:root,encoding:"utf8"}); if(r.status!==0) throw new Error(r.stderr||r.stdout); return r.stdout.trim(); }
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
    // Exercise a lock longer than the previous ~1s Windows retry budget.
    console.log('[goals smoke] Windows exclusive-lock retry probe');
    const { elapsedMs }=await withWindowsExclusiveLock(target,1850,()=>
      store.save({...retryGoal,title:"atomic retry updated",updatedAt:new Date().toISOString()}));
    assert(elapsedMs>=1350,"goal atomic replacement did not outlive the old Windows retry window");
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
} finally { await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50}); await fs.rm(goalBase,{recursive:true,force:true,maxRetries:5,retryDelay:50}); }
