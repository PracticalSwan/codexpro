import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readWorkspaceProfile, saveWorkspaceProfile, profilePathForRoot } from '../dist/profileStore.js';
import { loadConfig } from '../dist/config.js';
import { toolNamesForMode, serverInstructions } from '../dist/server.js';
import { toolSurfaceDiagnostics } from '../dist/diagnosticsOps.js';

const root = process.cwd();
const config = loadConfig(['--root', root, '--allow-root', root, '--tool-mode', 'full']);
assert(!('syncCallDeadlineMs' in config), 'obsolete call deadline is still configured');
assert(!('syncCallDeadlineMode' in config), 'obsolete call deadline mode is still configured');
assert.throws(() => loadConfig(['--root', root, '--sync-call-deadline-ms', '300000']), /removed/i);
const oldEnv = process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE;
try {
  process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE = 'observe';
  assert.throws(() => loadConfig(['--root', root]), /removed/i);
} finally {
  if (oldEnv === undefined) delete process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE;
  else process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE = oldEnv;
}
assert(!toolNamesForMode(config).includes('tool_time_probe'), 'obsolete probe remains registered');
assert(!/call.deadline|unlimited\/observe|tool.time.probe/i.test(serverInstructions(config)), 'obsolete guidance remains');
const help = execFileSync(process.execPath, ['scripts/codexpro.mjs', '--help'], { encoding: 'utf8' });
assert(!help.includes('sync-call-deadline'), 'obsolete CLI option still advertised');
const diagnostics = toolSurfaceDiagnostics(config, [], [], { counters: {}, totalEvents: 0, events: [] });
assert(!('deadline' in diagnostics), 'obsolete deadline diagnostics remain');
assert(!('deadline_yields' in (diagnostics.resilience ?? {})), 'obsolete deadline telemetry remains');
const page = readFileSync('src/http.ts','utf8');
assert(!page.includes('syncCallDeadlineMinutes'), 'obsolete setup control remains');
assert(!page.includes('syncCallDeadlineObserve'), 'obsolete observe control remains');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'codexpro-retired-call-budget-'));
const previousHome = process.env.CODEXPRO_HOME;
try {
  process.env.CODEXPRO_HOME = path.join(fixture, 'user');
  const workspace = path.join(fixture, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const oldPath = profilePathForRoot(workspace);
  fs.mkdirSync(path.dirname(oldPath), { recursive: true });
  const legacy = { version: 1, root: workspace, tunnel: 'none', toolMode: 'standard', token: 'fixture-only-secret',
    syncCallDeadlineMode: 'observe', syncCallDeadlineMs: 3600000, extraFutureField: 'keep-me' };
  fs.writeFileSync(oldPath, JSON.stringify(legacy), { mode: 0o600 });
  const original = fs.readFileSync(oldPath,'utf8');
  const loaded = readWorkspaceProfile(workspace);
  assert(!('syncCallDeadlineMode' in loaded) && !('syncCallDeadlineMs' in loaded));
  assert.equal(loaded.token,'fixture-only-secret');
  assert.equal(loaded.extraFutureField,'keep-me');
  assert.equal(fs.readFileSync(oldPath,'utf8'), original, 'reading legacy profile rewrote user state');
  saveWorkspaceProfile(workspace, loaded);
  const updated = JSON.parse(fs.readFileSync(oldPath,'utf8'));
  assert(!('syncCallDeadlineMode' in updated) && !('syncCallDeadlineMs' in updated));
  assert.equal(updated.token, 'fixture-only-secret');
  assert.equal(updated.extraFutureField,'keep-me');
  assert.equal(updated.toolMode,'standard');
} finally {
  if (previousHome === undefined) delete process.env.CODEXPRO_HOME;
  else process.env.CODEXPRO_HOME = previousHome;
  fs.rmSync(fixture, { recursive:true, force:true });
}
console.log('deadline-retirement smoke passed');
