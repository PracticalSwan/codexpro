import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoalStore } from "../dist/goals/store.js";

class Client {
  constructor(env,root){
    this.child=spawn(process.execPath,["dist/stdio.js","--root",root,"--allow-root",root,"--bash","full","--tool-mode","full","--write","workspace"],{cwd:path.resolve("."),env,stdio:["pipe","pipe","pipe"]});
    this.buffer="";this.nextId=1;this.pending=new Map();
    this.child.stdout.on("data",(c)=>this.onData(String(c)));
    this.child.stderr.on("data",(c)=>process.stderr.write(c));
    this.child.on("exit",(code)=>{for(const p of this.pending.values())p.reject(new Error(`server exited ${code}`));});
  }
  onData(chunk){this.buffer+=chunk;while(true){const i=this.buffer.indexOf("\n");if(i<0)return;const line=this.buffer.slice(0,i).replace(/\r$/,"");this.buffer=this.buffer.slice(i+1);if(!line.trim())continue;const msg=JSON.parse(line);if(msg.id&&this.pending.has(msg.id)){const p=this.pending.get(msg.id);clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);}}}
  request(method,params={}){const id=this.nextId++;this.child.stdin.write(`${JSON.stringify({jsonrpc:"2.0",id,method,params})}\n`);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`timeout ${method}`)),15000);timer.unref();this.pending.set(id,{resolve,reject,timer});});}
  notify(method,params={}){this.child.stdin.write(`${JSON.stringify({jsonrpc:"2.0",method,params})}\n`);}
  async init(){await this.request("initialize",{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"goal-mcp-smoke",version:"0.1"}});this.notify("notifications/initialized");}
  close(){this.child.kill("SIGTERM");}
}

const root=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-goal-mcp-root-"));
const goalBase=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-goal-mcp-store-"));
const operationDir=path.join(goalBase,"operations");
const git=(args)=>{const r=spawnSync("git",args,{cwd:root,encoding:"utf8"});if(r.status!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim();};
const baseEnv={...process.env,CODEXPRO_ROOT:root,CODEXPRO_ALLOWED_ROOTS:root,CODEXPRO_GOAL_DIR:goalBase,CODEXPRO_OPERATION_DIR:operationDir,CODEXPRO_GOALS:"1",CODEXPRO_TOOL_CARDS:"0"};
try {
  git(["init"]);await fs.writeFile(path.join(root,"base.txt"),"base\n");git(["add","base.txt"]);git(["-c","user.email=goal@example.com","-c","user.name=Goal MCP","commit","-m","base"]);
  const disabled=new Client({...baseEnv,CODEXPRO_GOALS:"0"},root);await disabled.init();
  const disabledTools=(await disabled.request("tools/list")).tools.map((t)=>t.name);
  assert(!disabledTools.some((name)=>name.includes("goal")));disabled.close();

  const first=new Client(baseEnv,root);await first.init();
  const tools=(await first.request("tools/list")).tools.map((t)=>t.name);
  for(const name of ["goal_status","list_goals","propose_goal","approve_goal","start_goal","pause_goal","resume_goal","cancel_goal","review_goal","project_goal"]) assert(tools.includes(name),`missing ${name}`);
  const cfg=await first.request("tools/call",{name:"server_config",arguments:{}});assert.equal(cfg.structuredContent.goalsEnabled,true);assert.equal(cfg.structuredContent.goalPlatform.available,true);
  const proposed=await first.request("tools/call",{name:"propose_goal",arguments:{title:"MCP durable goal",max_workers:1,tasks:[{id:"write",title:"write file",kind:"command",command:'node -e "require(\'node:fs\').writeFileSync(\'mcp-goal.txt\',\'mcp goal\')"'}]}});
  assert(!proposed.isError);const id=proposed.structuredContent.id;const fingerprint=proposed.structuredContent.fingerprint;
  const approved=await first.request("tools/call",{name:"approve_goal",arguments:{goal_id:id,fingerprint}});assert.equal(approved.structuredContent.state,"approved");
  const started=await first.request("tools/call",{name:"start_goal",arguments:{goal_id:id}});assert.equal(started.structuredContent.state,"running");
  first.close();
  const workspaceId=proposed.structuredContent.workspace_id;
  const store=new GoalStore({baseDir:path.join(goalBase,workspaceId),maxGoals:16});
  let durable;
  for(let i=0;i<120;i++){durable=await store.require(id);if(["awaiting_review","failed","canceled"].includes(durable.state))break;await new Promise((resolve)=>setTimeout(resolve,50));}
  assert.equal(durable.state,"awaiting_review",durable.error??"detached worker did not survive MCP disconnect");
  await assert.rejects(()=>fs.readFile(path.join(root,"mcp-goal.txt")),/ENOENT/);

  const second=new Client(baseEnv,root);await second.init();
  const status=await second.request("tools/call",{name:"goal_status",arguments:{goal_id:id}});assert.equal(status.structuredContent.state,"awaiting_review");assert.equal(status.structuredContent.isolation_active,true);assert(!JSON.stringify(status).includes(path.join(goalBase,workspaceId)));
  const review=await second.request("tools/call",{name:"review_goal",arguments:{goal_id:id}});assert.equal(review.structuredContent.state,"awaiting_projection");
  const projected=await second.request("tools/call",{name:"project_goal",arguments:{goal_id:id,expected_source_head:review.structuredContent.source_head,expected_source_fingerprint:review.structuredContent.source_fingerprint,review_fingerprint:review.structuredContent.review_fingerprint,authorize:true}});
  assert.equal(projected.structuredContent.state,"projected");second.close();
  assert.equal(await fs.readFile(path.join(root,"mcp-goal.txt"),"utf8"),"mcp goal");
  assert.equal(git(["log","-1","--pretty=%s"]),"base");
  console.log("goals MCP durability smoke passed");
} finally {
  spawnSync("git",["worktree","prune"],{cwd:root,encoding:"utf8"});
  await fs.rm(root,{recursive:true,force:true});
  await fs.rm(goalBase,{recursive:true,force:true});
}
