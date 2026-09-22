import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = mkdtempSync(path.join(os.tmpdir(), 'codexpro-user-probe-'));
const home = path.join(base, 'home');
const otherHome = path.join(base, 'other-home');
const root = path.join(base, 'one');
const nextRoot = path.join(base, 'two');
const thirdRoot = path.join(base, 'three');
for (const dir of [home, otherHome, root, nextRoot, thirdRoot]) mkdirSync(dir);
function run(args, selectedHome = home) {
  const env = { ...process.env, CODEXPRO_HOME: selectedHome, CODEXPRO_LOCAL_SERVICE_PROBE: '' };
  const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], { cwd: repo, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}
const { createHash } = await import('node:crypto');
function savedProfile(dir, selectedHome = home) {
  const id = createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 24);
  return JSON.parse(readFileSync(path.join(selectedHome, 'profiles', id + '.json'), 'utf8'));
}
try {
  // A fresh account retains the secure global default.
  run(['settings', 'set', '--root', thirdRoot, '--tunnel', 'none'], otherHome);
  assert.notEqual(savedProfile(thirdRoot, otherHome).localServiceProbeEnabled, true);
  run(['settings', 'user-default', '--local-service-probe', 'on']);
  const preference = JSON.parse(readFileSync(path.join(home, 'user-preferences.json'), 'utf8'));
  assert.equal(preference.localServiceProbeEnabled, true);
  run(['settings', 'set', '--root', root, '--tunnel', 'none']);
  assert.equal(savedProfile(root).localServiceProbeEnabled, true);
  run(['settings', 'set', '--root', nextRoot, '--tunnel', 'none', '--local-service-probe', 'off']);
  assert.equal(savedProfile(nextRoot).localServiceProbeEnabled, false);
  run(['settings', 'set', '--root', nextRoot, '--tunnel', 'none']);
  assert.equal(savedProfile(nextRoot).localServiceProbeEnabled, false, 'explicit workspace opt-out wins');
  const { readWorkspaceProfile, saveWorkspaceProfile } = await import('../dist/profileStore.js');
  process.env.CODEXPRO_HOME = home;
  assert.equal(readWorkspaceProfile(path.join(base, 'future-admin')).localServiceProbeEnabled, true);
  const adminRoot = path.join(base, 'future-admin');
  mkdirSync(adminRoot);
  saveWorkspaceProfile(adminRoot, {});
  assert.equal(savedProfile(adminRoot).localServiceProbeEnabled, true);
  run(['settings', 'user-default', '--local-service-probe', 'off']);
  const later = path.join(base, 'later');
  mkdirSync(later);
  run(['settings', 'set', '--root', later, '--tunnel', 'none']);
  assert.notEqual(savedProfile(later).localServiceProbeEnabled, true);
  console.log('per-user local service probe preference smoke passed');
} finally {
  delete process.env.CODEXPRO_HOME;
  rmSync(base, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
