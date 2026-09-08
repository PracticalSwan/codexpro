import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { buildVerificationRepairContract } from '../dist/verificationEvidence.js';

const analysis = {
  schemaVersion: 1, changedPaths: ['src/a.ts'], affectedAreas: ['src'],
  dependentFiles: [{ path: 'src/b.ts', confidence: 'high', reasons: ['imports changed file'] }],
  relatedTests: [{ path: 'test/a.test.ts', confidence: 'high', reasons: ['tests changed file'] }],
  riskSignals: [], recommendedCommands: [], coverage: {}, warnings: [], cache: { hit: false, key: 'x' }
};
const failed = [{
  check: { id: 'check_test', command: 'npm test', source: 'package.json', reasons: [], framework: 'vitest' },
  exitCode: 1, signal: null, durationMs: 12, terminationReason: 'normal', ok: false,
  structured: { framework: 'vitest', passed: 2, failed: 1, skipped: 0,
    failures: [{ file: 'test/a.test.ts', line: 4, message: 'expected 1 to be 2' }], evidence: 'raw output not copied', truncated: false }
}];
const repair = buildVerificationRepairContract(analysis, failed);
assert.equal(repair.status, 'failed');
assert.equal(repair.failures[0].category, 'test');
assert.ok(repair.failures[0].likelyPaths.includes('test/a.test.ts'));
assert.ok(repair.failures[0].relatedTests.includes('test/a.test.ts'));
assert.equal(repair.retryRecommended, true);
assert.equal(repair.maxSuggestedRepairAttempts, 2);
assert.ok(repair.failures.length <= 8 && repair.nextActions.length <= 8);
const passed = buildVerificationRepairContract(analysis, [{ ...failed[0], exitCode: 0, ok: true, structured: { ...failed[0].structured, failed: 0, failures: [] } }]);
assert.deepEqual(passed, { status: 'passed', retryRecommended: false, maxSuggestedRepairAttempts: 2, failures: [], nextActions: [] });
const notRun = buildVerificationRepairContract(analysis, []);
assert.equal(notRun.status, 'not_run');
assert.equal(notRun.retryRecommended, false);

const toolchain = buildVerificationRepairContract(analysis, [{ ...failed[0],
  check: { ...failed[0].check, id: 'check_build', command: 'npm run build', framework: 'generic' },
  terminationReason: 'spawn_error', structured: { ...failed[0].structured, failures: [] }
}]);
assert.equal(toolchain.failures[0].category, 'toolchain');
assert.equal(toolchain.retryRecommended, false);

const bounded = buildVerificationRepairContract(analysis, Array.from({ length: 20 }, (_, i) => ({ ...failed[0], check: { ...failed[0].check, id: `check_${i}` } })));
assert.equal(bounded.failures.length, 8);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-repair-mcp-'));
await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test-fixture.cjs' } }, null, 2));
await fs.writeFile(path.join(root, 'src.ts'), 'export const value = 1;\n');
await fs.mkdir(path.join(root, 'test'), { recursive: true });
await fs.writeFile(path.join(root, 'test', 'a.test.ts'), 'export const testMarker = true;\n');
await fs.writeFile(path.join(root, 'test-fixture.cjs'), "const p=require('node:path').join(process.cwd(),'test','a.test.ts'); console.error(p+':4:2 expected 1 to be 2'); process.exit(1);\n");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'safe', '--write', 'workspace', '--tool-mode', 'full'],
  env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_OPERATION_DIR: path.join(root, '.ops'), CODEXPRO_ACTIVITY_DIR: path.join(root, '.activity') }
});
const client = new Client({ name: 'verification-repair-smoke', version: '0.1.0' });
try {
  await client.connect(transport);
  const planned = await client.callTool({ name: 'verify_changes', arguments: { changed_paths: ['src.ts'], run: false } });
  assert.equal(planned.structuredContent.repair.status, 'not_run');
  const failing = await client.callTool({ name: 'verify_changes', arguments: { changed_paths: ['src.ts'], run: true } });
  assert.equal(failing.structuredContent.repair.status, 'failed');
  assert.equal(failing.structuredContent.repair.retryRecommended, true);
  assert.ok(failing.structuredContent.repair.failures.length <= 8);
  assert.equal(failing.structuredContent.results[0].structured.failures[0].file, 'test/a.test.ts');
  assert.equal(failing.structuredContent.repair.failures[0].likelyPaths[0], 'test/a.test.ts');
  await fs.writeFile(path.join(root, 'test-fixture.cjs'), "console.log('1 passed'); process.exit(0);\n");
  const passing = await client.callTool({ name: 'verify_changes', arguments: { changed_paths: ['src.ts'], run: true } });
  assert.equal(passing.structuredContent.repair.status, 'passed');
  assert.equal(passing.structuredContent.repair.retryRecommended, false);

  const clockWrapper = path.join(root, 'fake-clock-stdio.mjs');
  await fs.writeFile(clockWrapper, "import { pathToFileURL } from 'node:url'; let now=0; Date.now=()=>{ now += 400000; return now; }; await import(pathToFileURL(process.env.CODEXPRO_TEST_STDIO_ENTRY).href);\n");
  const deadlineTransport = new StdioClientTransport({
    command: process.execPath,
    args: [clockWrapper, '--root', root, '--allow-root', root, '--bash', 'safe', '--write', 'workspace', '--tool-mode', 'full'],
    env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_OPERATION_DIR: path.join(root, '.ops-deadline'), CODEXPRO_ACTIVITY_DIR: path.join(root, '.activity-deadline'), CODEXPRO_SYNC_CALL_DEADLINE_MODE: 'bounded', CODEXPRO_SYNC_CALL_DEADLINE_MS: '300000', CODEXPRO_TEST_STDIO_ENTRY: path.resolve('dist/stdio.js') }
  });
  const deadlineClient = new Client({ name: 'verification-deadline-smoke', version: '0.1.0' });
  try {
    await deadlineClient.connect(deadlineTransport);
    const partial = await deadlineClient.callTool({ name: 'verify_changes', arguments: { changed_paths: ['src.ts'], run: true } });
    assert.equal(partial.structuredContent.complete, false);
    assert.equal(partial.structuredContent.deadlineYielded, true);
    assert.equal(partial.structuredContent.ok, null);
    assert(partial.structuredContent.remainingCheckIds.length >= 1);
    assert.match(partial.content?.[0]?.text ?? '', /Verification incomplete/);
  } finally {
    await deadlineClient.close().catch(() => undefined);
  }
} finally {
  await client.close().catch(() => undefined);
  await fs.rm(root, { recursive: true, force: true });
}
console.log('verification repair smoke passed');
