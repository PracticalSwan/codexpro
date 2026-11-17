import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard } from '../dist/guard.js';
import { viewWorkspaceImage } from '../dist/imageOps.js';
const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'codexpro-image-'));
const root=realpathSync.native(tempRoot); // Match the canonical root registered by WorkspaceManager.
try{
  const onePixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+0tGzgAAAABJRU5ErkJggg==','base64');
  await fs.writeFile(path.join(root,'screenshot.png'),Buffer.concat([onePixel,Buffer.alloc(2_500_000)]));
  const config={...loadConfig(['--root',root,'--allow-root',root]),maxReadBytes:1_000_000};
  const ws={id:'ws_image',root,openedAt:new Date().toISOString()};
  const guard=new PathGuard(config);
  await assert.rejects(()=>viewWorkspaceImage(config,guard,ws,'screenshot.png'),/max_bytes|Image is too large/i);
  await assert.rejects(()=>viewWorkspaceImage({...config,maxReadBytes:5_000_000},guard,ws,'screenshot.png'),/max_bytes|Image is too large/i, 'default remains 2 MB even when read limit is higher');
  const result=await viewWorkspaceImage(config,guard,ws,'screenshot.png',3_000_000);
  assert.equal(result.mimeType,'image/png');
  assert.equal(result.width,1);assert.equal(result.height,1);
  assert(result.bytes>2_000_000);
  assert.equal(Buffer.from(result.data,'base64').byteLength,result.bytes);
  assert.match(result.sha256,/^[a-f0-9]{64}$/);
  console.log('image delivery size override smoke passed');
}finally{await fs.rm(tempRoot,{recursive:true,force:true})}
