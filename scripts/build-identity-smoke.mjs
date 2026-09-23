import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildIdentity, displayVersion } from '../dist/buildIdentity.js';

const identity = buildIdentity();
assert.equal(identity.packageName, 'codexpro-full');
assert.match(identity.version, /^\d+\.\d+\.\d+$/);
assert.match(displayVersion(identity), /^\d+\.\d+\.\d+(?:\+[a-z]+\.[A-Za-z0-9._-]+)?$/);
const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', '--version', '--verbose'], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /codexpro-full/);
assert.match(result.stdout, /Build channel:/);
assert.doesNotMatch(result.stdout, /(?:token|secret|password)=/i);
const help = spawnSync(process.execPath, ['scripts/codexpro.mjs', '--help'], { encoding: 'utf8' });
assert.equal(help.status, 0, help.stderr);
const releaseUrl = `https://github.com/PracticalSwan/codexpro/releases/download/v${identity.version}/codexpro-full-${identity.version}.tgz`;
assert(help.stdout.includes(`npm install -g ${releaseUrl}`), 'CLI help must name the canonical CodexPro Full GitHub Release artifact');
assert.doesNotMatch(help.stdout, /^  npm install -g codexpro(?:@[^\s]+)?\s*$/m, 'CLI help must not direct users to the upstream codexpro npm package');
console.log('build identity smoke passed');
