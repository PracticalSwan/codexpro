import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  const isolation=await createIsolatedExecution(store,workspace,"goal_platform",before);
  assert.equal(await fs.readFile(path.join(root,"tracked.txt"),"utf8"),"user dirty\n");
  assert.equal(await fs.readFile(path.join(root,"untracked.txt"),"utf8"),"user untracked\n");
  assert.notEqual(path.resolve(isolation.root).toLowerCase(),path.resolve(root).toLowerCase());
  assert.equal((await fs.readFile(path.join(isolation.root,"tracked.txt"),"utf8")).replaceAll("\r\n","\n"),"base\n");
  await removeIsolatedExecution(workspace,isolation);
  assert.equal(await fs.readFile(path.join(root,"tracked.txt"),"utf8"),"user dirty\n");
  console.log(`goals platform smoke passed (${process.platform})`);
} finally { await fs.rm(root,{recursive:true,force:true}); await fs.rm(goalBase,{recursive:true,force:true}); }
