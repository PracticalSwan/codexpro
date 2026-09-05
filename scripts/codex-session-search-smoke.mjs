import assert from "node:assert/strict";
import fs from "node:fs/promises"; import os from "node:os"; import path from "node:path";
import { loadConfig } from "../dist/config.js"; import { searchCodexSession, readCodexSessionAround } from "../dist/codexSessions.js";
const root=await fs.mkdtemp(path.join(os.tmpdir(),"codexpro-session-search-")); const codexDir=path.join(root,".codex"); const sessions=path.join(codexDir,"sessions","2026","09","05"); await fs.mkdir(sessions,{recursive:true});
const id="11111111-2222-4333-8444-555555555555"; const source=path.join(sessions,`rollout-${id}.jsonl`); const lines=[];
lines.push(JSON.stringify({timestamp:"2026-09-05T01:00:00Z",type:"session_meta",payload:{id,cwd:root}}));
for(let i=0;i<700;i++) lines.push(JSON.stringify({timestamp:"2026-09-05T01:00:01Z",type:"response_item",payload:{type:"message",role:"assistant",content:`filler ${i}`}}));
lines.push(JSON.stringify({timestamp:"2026-09-05T02:00:00Z",type:"response_item",payload:{type:"message",role:"user",content:"needle alpha beta"}}));
lines.push(JSON.stringify({timestamp:"2026-09-05T02:00:01Z",type:"response_item",payload:{type:"function_call",name:"bash"}}));
lines.push(JSON.stringify({timestamp:"2026-09-05T02:00:02Z",type:"response_item",payload:{type:"function_call_output",output:"secret-looking raw tool output should not be searched by default"}}));
await fs.writeFile(source,lines.join("\n")+"\n");
const base={...process.env,CODEXPRO_ROOT:root,CODEXPRO_ALLOWED_ROOTS:root,CODEXPRO_CODEX_DIR:codexDir,CODEXPRO_CODEX_SESSIONS:"read",CODEXPRO_ALLOW_NO_HTTP_TOKEN:"1"}; const saved=process.env; process.env=base; const config=loadConfig([]);
try { const found=await searchCodexSession(config,{sessionId:id,query:"needle",role:"user",maxResults:5,maxSnippetBytes:80}); assert.equal(found.matches.length,1); assert(found.matches[0].anchor>0); assert(Buffer.byteLength(found.matches[0].snippet,"utf8")<=80);
 const around=await readCodexSessionAround(config,{sessionId:id,anchor:found.matches[0].anchor,beforeMessages:2,afterMessages:3,maxTotalBytes:4000}); assert(around.messages.some(m=>m.content.includes("needle alpha beta")));
 const tool=await searchCodexSession(config,{sessionId:id,query:"bash",tool:"bash",maxResults:5}); assert.equal(tool.matches.length,1); assert.equal(tool.matches[0].tool,"bash");
 await assert.rejects(()=>searchCodexSession({...config,codexSessions:"metadata"},{sessionId:id,query:"needle"}),/read/i);
 const outside=path.join(root,"outside.jsonl"); await fs.writeFile(outside,lines[0]+"\n"); await assert.rejects(()=>searchCodexSession(config,{sourcePath:outside,query:"x"}),/outside configured/i);
 console.log("codex session search smoke passed"); } finally { process.env=saved; await fs.rm(root,{recursive:true,force:true}); }
