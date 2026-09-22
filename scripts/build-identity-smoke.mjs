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
console.log('build identity smoke passed');
