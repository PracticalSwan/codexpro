import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { discoverTrustedChecks, runChecks, verifyChanges } from '../dist/checksOps.js';
import { parseTestOutput } from '../dist/testResultOps.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checks-smoke-'));
const envKeys = ['CODEXPRO_ROOT','CODEXPRO_ALLOWED_ROOTS','CODEXPRO_BASH_MODE','CODEXPRO_ALLOW_NO_HTTP_TOKEN'];
const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_BASH_MODE = 'safe';
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';

await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: {
  test: 'node test-fixture.cjs',
  build: 'node -e "console.log(\'build ok\')"',
  deploy: 'node -e "throw new Error(\'must not run\')"'
}}, null, 2));
await fs.writeFile(path.join(root, 'test-fixture.cjs'), "console.error('src/demo.test.ts:17:4 failing example'); process.exit(1);\n");
await fs.writeFile(path.join(root, 'src.ts'), 'export const value = 1;\n');const config = loadConfig([]);
const workspaces = new WorkspaceManager(config);
const workspace = workspaces.selectDefaultWorkspace();
const guard = new PathGuard(config);

try {
  const discovered = await discoverTrustedChecks(config, guard, workspace);
  assert(discovered.some((check) => check.command === 'npm test'), 'trusted test script missing');
  assert(discovered.some((check) => check.command === 'npm run build'), 'trusted build script missing');
  assert(!discovered.some((check) => /deploy/.test(check.command)), 'non-verification script leaked into trusted checks');
  assert(discovered.every((check) => /^check_[a-f0-9]{16}$/.test(check.id)), 'check ids must be opaque and stable');

  await assert.rejects(
    () => runChecks({ config, guard, workspace, checkIds: ['check_deadbeefdeadbeef'] }),
    /unknown|not discovered/i,
    'unknown check id was accepted'
  );

  const testCheck = discovered.find((check) => check.command === 'npm test');
  assert(testCheck, 'test check not found');
  const run = await runChecks({ config, guard, workspace, checkIds: [testCheck.id] });
  assert.equal(run.results.length, 1);
  assert.equal(run.results[0].exitCode, 1);
  assert(run.results[0].structured.failures.some((failure) => failure.file === 'src/demo.test.ts' && failure.line === 17));  const parsed = parseTestOutput(
    'generic',
    '',
    'TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456\nsrc/unit.test.ts:9:2 expected true',
    160
  );
  assert(!JSON.stringify(parsed).includes('ghp_abcdefghijklmnopqrstuvwxyz123456'), 'test evidence leaked a token');
  assert(Buffer.byteLength(parsed.evidence, 'utf8') <= 160, 'test evidence exceeded bound');
  assert(parsed.failures.some((failure) => failure.file === 'src/unit.test.ts' && failure.line === 9));

  const verification = await verifyChanges({
    config,
    guard,
    workspace,
    changedPaths: ['src.ts'],
    run: false
  });
  assert(verification.selectedChecks.length >= 1, 'verify_changes selected no check');
  assert(verification.selectedChecks.length <= 2, 'verify_changes selected too many checks');
  assert(verification.selectedChecks.every((check) => discovered.some((candidate) => candidate.id === check.id)));
  assert.equal(verification.results.length, 0);
  assert.equal(verification.repair.status, 'not_run');
  assert.equal(verification.repair.retryRecommended, false);

  console.log('checks smoke passed');
} finally {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(root, { recursive: true, force: true });
}