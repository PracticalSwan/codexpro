import assert from "node:assert/strict";
import fs from "node:fs/promises"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process";
import { loadConfig } from "../dist/config.js"; import { PathGuard } from "../dist/guard.js"; import { OperationStore } from "../dist/operations/store.js"; import { OperationManager } from "../dist/operations/manager.js"; import { gitStage, gitCommit, gitPush } from "../dist/gitWriteOps.js";
const rootRaw=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-git-write-")); const root=await fs.realpath(rootRaw); const op=path.join(root,".ops"); const run=(a)=>spawnSync("git",a,{cwd:root,encoding:"utf8"});
run(["init"]); run(["config","user.email","t@example.com"]); run(["config","user.name","T"]); await fs.writeFile(path.join(root,"a.txt"),"a\n"); run(["add","a.txt"]); run(["commit","-m","initial"]);
const head=run(["rev-parse","HEAD"]).stdout.trim(); const branch=run(["branch","--show-current"]).stdout.trim(); const config={...loadConfig(["--root",root,"--allow-root",root]),allowGitPush:false}; const ws={id:"ws_git_write",root,openedAt:new Date().toISOString()}; const guard=new PathGuard(config); const ops=new OperationManager(new OperationStore({baseDir:op,maxReceipts:32}),ws.id);
try {
 await fs.writeFile(path.join(root,"a.txt"),"b\n"); await fs.writeFile(path.join(root,"other.txt"),"other\n");
 await assert.rejects(()=>gitStage(config,guard,ws,ops,{paths:[],expectedHead:head}),/explicit paths/i);
 const staged=await gitStage(config,guard,ws,ops,{paths:["a.txt"],expectedHead:head}); assert.deepEqual(staged.result?.stagedPaths,["a.txt"]);
 const bad=await gitStage(config,guard,ws,ops,{paths:["other.txt"],expectedHead:"0".repeat(40)}).catch(e=>e); assert.match(String(bad),/HEAD/i);
 const commit=await gitCommit(config,guard,ws,ops,{message:"change a",expectedHead:head,expectedBranch:branch,expectedStagedPaths:["a.txt"]}); assert(commit.result?.commit); assert.deepEqual(commit.result?.stagedPaths,["a.txt"]);
 await assert.rejects(()=>gitPush(config,guard,ws,ops,{remote:"origin",branch,expectedHead:commit.result.commit,expectedBranch:branch}),/disabled|opt-in/i);
 console.log("git write smoke passed");
} finally { await fs.rm(rootRaw,{recursive:true,force:true}); }
