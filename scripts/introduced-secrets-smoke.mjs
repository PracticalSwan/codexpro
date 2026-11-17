import assert from 'node:assert/strict';
import { introducedSecretFindings, hasSecretValue } from '../dist/redact.js';
const fakeTokenA = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz012345';
const old = 'const accessToken = "' + fakeTokenA + '";\nconst safe = 1;\n';
const changed = old.replace('const safe = 1;', 'const safe = 2;');
assert.equal(hasSecretValue(old), true);
assert.deepEqual(introducedSecretFindings(old, changed), [], 'existing secret must not veto unrelated edit');
assert.deepEqual(introducedSecretFindings(old, old.replace('accessToken =', 'accessToken  =')), [],
  'formatting an unchanged secret assignment must not block a safe edit');
assert(introducedSecretFindings(old, old.replace('accessToken =','differentToken =')).length >= 1,
  'moving the value into a different credential field must still be rejected');

const fakeTokenB = 'ghp_' + 'abcdefghijklmnopqrstuvwxyz012346';
const newSecret = 'const accessToken = "' + fakeTokenB + '";\n';
const introduced = introducedSecretFindings(old, old + newSecret);
assert.equal(introduced.length, 1, 'duplicating/replacing token must be rejected');
assert.equal(introduced[0].line, 3);
assert.equal(introduced[0].category, 'token');
assert(!JSON.stringify(introduced).includes('abcdefghijklmnopqrstuvwxyz'));
assert.equal(introducedSecretFindings('', old).length, 1);
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadConfig } from '../dist/config.js';
import { PathGuard } from '../dist/guard.js';
import { editTextFile, writeTextFile } from '../dist/fsOps.js';
import { preflightChanges } from '../dist/preflightOps.js';

const tempRoot=await fs.mkdtemp(path.join(os.tmpdir(),'codexpro-secret-baseline-'));
const root=realpathSync.native(tempRoot); // Match WorkspaceManager's canonical root identity.
try {
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
  git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  await fs.writeFile(path.join(root,'session.py'),old);
  git('add','session.py');git('commit','-q','-m','synthetic test baseline');
  const config=loadConfig(['--root',root,'--allow-root',root]);
  const workspace={id:'ws_secrets',root,openedAt:new Date().toISOString()};
  const guard=new PathGuard(config);
  const accepted=await editTextFile(config,guard,workspace,'session.py','const safe = 1;','const safe = 2;');
  assert.equal(accepted.replacements,1);
  assert.equal((await preflightChanges(config,guard,workspace,{paths:['session.py']})).ok,true);
  const unsafe=old+newSecret;
  await assert.rejects(()=>writeTextFile(config,guard,workspace,'session.py',unsafe),
    (error)=>/Secret-looking content is blocked/.test(error.message)&&
      /session\.py:3/.test(error.message)&&!error.message.includes('abcdefghijklmnopqrstuvwxyz'));
  const result=await preflightChanges(config,guard,workspace,{paths:['session.py']});
  assert.equal(result.ok,true);
  assert(result.notices.some(n=>n.kind==='secret'&&n.baseline==='HEAD'));
  await fs.writeFile(path.join(root,'session.py'),unsafe);
  const flagged=await preflightChanges(config,guard,workspace,{paths:['session.py']});
  assert.equal(flagged.ok,false);
  assert(flagged.issues.some(n=>n.kind==='secret'&&n.line===3&&n.baseline==='HEAD'));
  assert(!JSON.stringify(flagged.issues).includes('abcdefghijklmnopqrstuvwxyz'));
  // Git path prefixes are relative to the repository top-level, not the opened workspace.
  const nested=path.join(root,'nested');await fs.mkdir(nested);
  await fs.writeFile(path.join(nested,'inside.py'),old);
  git('add','nested/inside.py');git('commit','-q','-m','nested synthetic fixture');
  const nestedConfig=loadConfig(['--root',nested,'--allow-root',nested]);
  const nestedWorkspace={id:'ws_nested',root:nested,openedAt:new Date().toISOString()};
  const nestedResult=await preflightChanges(nestedConfig,new PathGuard(nestedConfig),nestedWorkspace,{paths:['inside.py']});
  assert.equal(nestedResult.ok,true,'unchanged secret in nested Git checkout must be identified against its own HEAD path');
  assert(nestedResult.notices.some(n=>n.kind==='secret'&&n.baseline==='HEAD'));

} finally {
  await fs.rm(tempRoot,{recursive:true,force:true});
}

console.log('introduced secret regression passed');
