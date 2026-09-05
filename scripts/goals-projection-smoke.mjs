import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { OperationStore } from "../dist/operations/store.js";
import { OperationManager } from "../dist/operations/manager.js";
import { GoalStore } from "../dist/goals/store.js";
import { proposeGoal, approveGoal, startGoal, cancelGoal } from "../dist/goals/runner.js";
import { reviewGoal, projectGoal } from "../dist/goals/projection.js";
import { sourceGitState } from "../dist/goals/isolation.js";

const root=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-goal-project-"));
const goalBase=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-goal-store-"));
const operationDir=path.join(goalBase,"operations");
const git=(args)=>{const r=spawnSync("git",args,{cwd:root,encoding:"utf8"});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();};
try {
  git(["init"]);
  await fs.writeFile(path.join(root,"base.txt"),"base\n");
  await fs.writeFile(path.join(root,"unrelated.txt"),"committed\n");
  git(["add","base.txt","unrelated.txt"]);
  git(["-c","user.email=goal@example.com","-c","user.name=Goal Smoke","commit","-m","base"]);
  await fs.writeFile(path.join(root,"unrelated.txt"),"user dirty\n");
  const workspace={id:"ws_goal_project",root:await fs.realpath(root),openedAt:new Date().toISOString()};
  const dirtyBefore=await sourceGitState(workspace);
  await fs.writeFile(path.join(root,"unrelated.txt"),"user dirty changed\n");
  const dirtyAfter=await sourceGitState(workspace);
  assert.notEqual(dirtyBefore.fingerprint,dirtyAfter.fingerprint,"dirty content change did not invalidate source fingerprint");
  await fs.writeFile(path.join(root,"unrelated.txt"),"user dirty\n");
  const config={...loadConfig(["--root",root,"--allow-root",root,"--bash","full","--tool-mode","full","--write","workspace"]),operationDir,goalDir:goalBase,goalsEnabled:true,maxGoalWorkers:2,maxGoalTasks:8};
  const guard=new PathGuard(config);
  const store=new GoalStore({baseDir:goalBase,maxGoals:8});
  const operations=new OperationManager(new OperationStore({baseDir:operationDir,maxReceipts:32}),workspace.id);
  const proposed=await proposeGoal(store,{workspace,title:"Project change",maxWorkers:1,tasks:[{id:"write",title:"write",kind:"command",command:'node -e "require(\'node:fs\').writeFileSync(\'goal.txt\',\'goal\\n\')"',dependsOn:[]}]},{maxTasks:8,maxWorkers:2});
  await approveGoal(store,proposed.id,proposed.fingerprint);
  await startGoal(config,store,workspace,proposed.id);
  let record;
  for(let i=0;i<100;i++){
    record=await store.require(proposed.id);
    if(["awaiting_review","failed","canceled"].includes(record.state)) break;
    await new Promise((resolve)=>setTimeout(resolve,50));
  }
  assert.equal(record.state,"awaiting_review",record.error??"Goal did not reach review boundary");
  assert.equal(await fs.readFile(path.join(root,"unrelated.txt"),"utf8"),"user dirty\n");
  await assert.rejects(()=>fs.readFile(path.join(root,"goal.txt")),/ENOENT/);
  const review=await reviewGoal(config,guard,store,workspace,proposed.id);
  assert.equal(review.record.state,"awaiting_projection");
  assert(review.paths.includes("goal.txt"));
  const release=await store.acquireScheduler(proposed.id);
  await assert.rejects(()=>cancelGoal(store,proposed.id),/projection.*progress/i);
  await release();
  await assert.rejects(()=>projectGoal({config,guard,store,workspace,operationManager:operations,id:proposed.id,expectedSourceHead:record.sourceHead,expectedSourceFingerprint:record.sourceFingerprint,reviewFingerprint:review.reviewFingerprint,authorize:false}),/authorize/i);
  const projected=await projectGoal({config,guard,store,workspace,operationManager:operations,id:proposed.id,expectedSourceHead:record.sourceHead,expectedSourceFingerprint:record.sourceFingerprint,reviewFingerprint:review.reviewFingerprint,authorize:true});
  assert.equal(projected.state,"projected");
  assert.equal((await fs.readFile(path.join(root,"goal.txt"),"utf8")).replaceAll("\r\n","\n"),"goal\n");
  assert.equal(await fs.readFile(path.join(root,"unrelated.txt"),"utf8"),"user dirty\n");
  const status=git(["status","--short"]);
  assert(status.includes("unrelated.txt"));
  assert(status.includes("goal.txt"));
  assert.equal(git(["log","-1","--pretty=%s"]),"base");
  console.log("goals projection smoke passed");
} finally {
  spawnSync("git",["worktree","prune"],{cwd:root,encoding:"utf8"});
  await fs.rm(root,{recursive:true,force:true});
  await fs.rm(goalBase,{recursive:true,force:true});
}
