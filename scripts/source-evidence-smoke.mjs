import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureSourceIdentity, compareSourceIdentity, evaluateVerificationFreshness } from '../dist/sourceEvidence.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'codexpro-evidence-'));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
try{
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(root,'a.txt'),'before\n');
  git('add','a.txt');git('commit','-q','-m','baseline');
  const before=captureSourceIdentity(root);
  assert.equal(before.complete,true);
  const identical=compareSourceIdentity(before,captureSourceIdentity(root));
  assert.equal(identical.changed_during_run,false);
  assert.equal(evaluateVerificationFreshness(identical,captureSourceIdentity(root)),true);
  fs.appendFileSync(path.join(root,'a.txt'),'after\n');
  const stale=compareSourceIdentity(before,captureSourceIdentity(root));
  assert.equal(stale.changed_during_run,true);
  assert.equal(stale.current_matches,false);
  assert.equal(evaluateVerificationFreshness(identical,captureSourceIdentity(root)),false);
  fs.writeFileSync(path.join(root,'untracked.txt'),'never read as evidence\n');
  const incomplete=compareSourceIdentity(before,captureSourceIdentity(root));
  assert.equal(incomplete.current_matches,null);
  assert.match(incomplete.warning,/Untracked/i);
  console.log('source evidence smoke passed');
}finally{fs.rmSync(root,{recursive:true,force:true})}
