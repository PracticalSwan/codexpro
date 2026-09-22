import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';

const fixture = await createFixture('codexpro-runtime-');
const root = await fs.realpath(fixture.root);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-runtime-home-'));
const env = { ...process.env, CODEXPRO_HOME: home };
const run = (args) => spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], { cwd: path.resolve('.'), env, encoding: 'utf8' });
try {
  const stopped = run(['status', '--root', root, '--json']);
  assert.equal(stopped.status, 0, stopped.stderr);
  assert.equal(JSON.parse(stopped.stdout).state, 'stopped');
  const id = crypto.createHash('sha256').update(root).digest('hex').slice(0, 24);
  const runtimePath = path.join(home, 'runtime', `${id}.json`);
  await fs.mkdir(path.dirname(runtimePath), { recursive: true });
  const record = { version: 1, root, pid: 999999, pidStartKey: 'win:fixture', runtimePid: null, transportState: 'ready', localBase: '' };
  await fs.writeFile(runtimePath, JSON.stringify(record));
  const stale = run(['status', '--root', root, '--json']);
  assert.equal(stale.status, 0, stale.stderr);
  assert.equal(JSON.parse(stale.stdout).state, 'stale');
  const stop = run(['stop', '--root', fixture.root, '--json']);
  assert.notEqual(stop.status, 0);
  assert.equal(JSON.parse(await fs.readFile(runtimePath, 'utf8')).pid, 999999);
  console.log('runtime lifecycle smoke passed');
} finally {
  await removeFixture(fixture);
  await fs.rm(home, { recursive: true, force: true });
}
