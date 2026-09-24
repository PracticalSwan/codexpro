import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';

const fixture = await createFixture('codexpro-runtime-');
const root = await fs.realpath(fixture.root);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-runtime-home-'));
const env = { ...process.env, CODEXPRO_HOME: home };
let fakeLauncher = null;
let fakeServerPid = null;
let fixtureStopped = false;
const run = (args) => spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], { cwd: path.resolve('.'), env, encoding: 'utf8' });

function processStartKey(pid) {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$p=Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    return `win:${result.stdout.trim()}`;
  }
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  return `${process.platform}:${result.stdout.trim()}`;
}

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

  if (process.platform === 'win32') {
    // The launcher can exit before its owned server finishes teardown on Windows.
    await fs.rm(runtimePath);
    const serverScript = path.join(root, 'delayed-server.cjs');
    const launcherScript = path.join(root, 'delayed-launcher.cjs');
    await fs.writeFile(serverScript, [
      'const parentPid = Number(process.argv[2]);',
      'let exiting = false;',
      'setInterval(() => {',
      '  if (exiting) return;',
      '  try { process.kill(parentPid, 0); }',
      '  catch { exiting = true; setTimeout(() => process.exit(0), 800); }',
      '}, 25);'
    ].join('\n'), 'utf8');
    await fs.writeFile(launcherScript, [
      "const { spawn } = require('node:child_process');",
      "const child = spawn(process.execPath, [process.argv[2], String(process.pid)], { stdio: 'ignore' });",
      "process.stdout.write(String(child.pid) + '\\n');",
      'setInterval(() => {}, 1000);'
    ].join('\n'), 'utf8');
    fakeLauncher = spawn(process.execPath, [launcherScript, serverScript],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    fakeServerPid = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Test launcher did not report its child PID')), 10000);
      fakeLauncher.stdout.on('data', (chunk) => {
        output += String(chunk);
        if (output.includes('\n')) { clearTimeout(timeout); resolve(Number(output.trim())); }
      });
      fakeLauncher.once('error', (error) => { clearTimeout(timeout); reject(error); });
      fakeLauncher.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Test launcher exited early: ${code}`)); });
    });
    assert(Number.isInteger(fakeServerPid) && fakeServerPid > 0);
    const owned = {
      version: 1, root, pid: fakeLauncher.pid, pidStartKey: processStartKey(fakeLauncher.pid),
      runtimePid: fakeServerPid, runtimePidStartKey: processStartKey(fakeServerPid),
      transportState: 'ready', localBase: '', tunnel: 'none'
    };
    await fs.writeFile(runtimePath, JSON.stringify(owned));
    const running = run(['status', '--root', root, '--json']);
    assert.equal(running.status, 0, running.stderr);
    assert.equal(JSON.parse(running.stdout).state, 'running');
    const delayedStop = run(['stop', '--root', root, '--json']);
    assert.equal(delayedStop.status, 0, delayedStop.stderr);
    assert.equal(JSON.parse(delayedStop.stdout).state, 'stopped');
    assert.equal(await fs.stat(runtimePath).then(() => true, () => false), false);
    fixtureStopped = true;
  }
  console.log('runtime lifecycle smoke passed');
} finally {
  if (!fixtureStopped) {
    try { fakeLauncher?.kill('SIGTERM'); } catch {}
    if (fakeServerPid) { try { process.kill(fakeServerPid, 'SIGTERM'); } catch {} }
  }
  await removeFixture(fixture);
  await fs.rm(home, { recursive: true, force: true });
}
