import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { discoverTrustedChecks, verifyChanges } from '../dist/checksOps.js';
import { JobStore } from '../dist/jobs/store.js';
import { reconcileJob, resumeJob, signalJobProcessTree } from '../dist/jobs/runner.js';
import { registerVerificationJobProducer, startChecksJob, startVerificationJob } from '../dist/jobs/verification.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-async-verification-'));
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-async-jobs-'));
const saved = { ...process.env };
process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_BASH_MODE = 'safe';
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node test.cjs', build: 'node build.cjs' } }, null, 2));
await fs.writeFile(path.join(root, 'test.cjs'), "const fs=require('fs');const p='test-count.txt';const n=Number(fs.existsSync(p)?fs.readFileSync(p,'utf8'):0)+1;fs.writeFileSync(p,String(n));console.log('1 passed');\n");
await fs.writeFile(path.join(root, 'build.cjs'), "const fs=require('fs');fs.writeFileSync('build-started.txt','1');console.log('build start');setTimeout(()=>{},10000);\n");
await fs.writeFile(path.join(root, 'src.ts'), 'export const x = 1;\n');
const config = loadConfig([]);
const manager = new WorkspaceManager(config);
const workspace = manager.selectDefaultWorkspace();
const guard = new PathGuard(config);
const store = new JobStore({ baseDir: stateDir });
const unregister = registerVerificationJobProducer();

async function waitPidGone(pid, attempts = 100) {
  if (!pid) return;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { process.kill(pid, 0); } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`worker pid still alive: ${pid}`);
}

async function settle(id, attempts = 200) {
  let record = await store.require(id);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    record = await reconcileJob(store, id);
    if (['completed','failed','canceled'].includes(record.state)) return record;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const terminal = await store.readTerminal(id);
  const owner = await store.readOwner(id).catch(() => null);
  const output = await store.readOutput(id, 0, 4096).catch(() => ({ text: "" }));
  throw new Error(`job did not settle: ${id}; record=${JSON.stringify(record)}; terminal=${JSON.stringify(terminal)}; owner=${JSON.stringify(owner)}; output=${output.text}`);
}

try {
  const sync = await verifyChanges({ config, guard, workspace, changedPaths: ['src.ts'], run: true });
  assert.equal(sync.complete, true);
  const startedAt = Date.now();
  const started = await startVerificationJob({ config, guard, workspace, store, changedPaths: ['src.ts'] });
  assert(Date.now() - startedAt < 2_000, 'async start waited for verification completion');
  const terminal = await settle(started.id);
  await waitPidGone(started.worker?.pid);
  assert.equal(terminal.state, 'completed');
  assert.deepEqual(terminal.result?.selectedChecks, sync.selectedChecks);
  assert.equal(terminal.result?.ok, sync.ok);
  assert.deepEqual(terminal.result?.repair, sync.repair);
  await fs.rm(path.join(root, 'test-count.txt'), { force: true });
  const discovered = await discoverTrustedChecks(config, guard, workspace);
  const testCheck = discovered.find((check) => check.command === 'npm test');
  const buildCheck = discovered.find((check) => check.command === 'npm run build');
  assert(testCheck && buildCheck, 'two-check fixture was not discovered');
  const resumable = await startChecksJob({ config, guard, workspace, store, checkIds: [testCheck.id, buildCheck.id] });
  let sawSecondStart = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    sawSecondStart = await fs.access(path.join(root, 'build-started.txt')).then(() => true).catch(() => false);
    if (sawSecondStart) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert(sawSecondStart, 'second check did not start');
  const checkpoint = await store.require(resumable.id);
  assert.equal(checkpoint.state, 'running');
  assert.equal(checkpoint.result?.complete, false);
  assert.equal(checkpoint.result?.results?.length, 1, 'first check was not persisted before second check started');
  assert.equal(checkpoint.result.results[0].check.id, testCheck.id);
  assert.equal(checkpoint.progress.completed, 1);
  assert(checkpoint.worker?.pid, 'resumable job worker missing');
  assert(signalJobProcessTree(checkpoint.worker.pid), 'failed to stop disposable verification worker');
  await new Promise((resolve) => setTimeout(resolve, 150));
  const interrupted = await reconcileJob(store, resumable.id);
  assert.equal(interrupted.state, 'interrupted');
  await fs.writeFile(path.join(root, 'build.cjs'), "console.log('build ok');\n");
  const resumed = await resumeJob(config, store, workspace, resumable.id);
  assert.equal(resumed.state, 'running');
  const resumedDone = await settle(resumable.id);
  await waitPidGone(resumed.worker?.pid);
  assert.equal(resumedDone.state, 'completed');
  assert.equal(resumedDone.result?.results?.length, 2);
  assert.equal(await fs.readFile(path.join(root, 'test-count.txt'), 'utf8'), '1', 'resume reran an already completed check');
  assert.match((await store.readOutput(resumable.id, 0, 4096)).text, /passed/);

  const makeClient = async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'safe', '--tool-mode', 'standard'], env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_JOB_DIR: stateDir, CODEXPRO_OPERATION_DIR: path.join(stateDir, 'mcp-ops'), CODEXPRO_ACTIVITY_DIR: path.join(stateDir, 'mcp-activity') } });
    const client = new Client({ name: 'async-verification-mcp-smoke', version: '0.1.0' });
    await client.connect(transport);
    return client;
  };
  let mcpJobId;
  let mcpSync;
  const firstClient = await makeClient();
  try {
    const tools = await firstClient.listTools();
    assert(tools.tools.some((tool) => tool.name === 'start_verification'));
    assert(tools.tools.some((tool) => tool.name === 'start_checks'));
    assert(!tools.tools.some((tool) => tool.name === 'job_start'));
    mcpSync = await firstClient.callTool({ name: 'verify_changes', arguments: { changed_paths: ['src.ts'], run: true } });
    const t0 = Date.now();
    const asyncStart = await firstClient.callTool({ name: 'start_verification', arguments: { changed_paths: ['src.ts'] } });
    assert(Date.now() - t0 < 2_000, 'MCP async start waited for completion');
    mcpJobId = asyncStart.structuredContent.job_id;
    assert.match(mcpJobId, /^job_/);
  } finally { await firstClient.close(); }
  const secondClient = await makeClient();
  try {
    let status;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      status = await secondClient.callTool({ name: 'job_status', arguments: { job_id: mcpJobId } });
      if (['completed','failed','canceled'].includes(status.structuredContent.job.state)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(status.structuredContent.job.state, 'completed');
    const asyncResult = status.structuredContent.job.result;
    const syncResult = mcpSync.structuredContent;
    assert.deepEqual(asyncResult.selectedChecks, syncResult.selectedChecks);
    assert.equal(asyncResult.ok, syncResult.ok);
    assert.deepEqual(asyncResult.repair, syncResult.repair);
  } finally { await secondClient.close(); }

  const minimalTransport = new StdioClientTransport({ command: process.execPath, args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'safe', '--tool-mode', 'minimal'], env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_JOB_DIR: stateDir } });
  const minimalClient = new Client({ name: 'async-verification-minimal-smoke', version: '0.1.0' });
  await minimalClient.connect(minimalTransport);
  try {
    const minimalTools = await minimalClient.listTools();
    assert(!minimalTools.tools.some((tool) => tool.name === 'start_verification'), 'minimal mode exposed async start without job polling controls');
    assert(!minimalTools.tools.some((tool) => tool.name === 'start_checks'), 'minimal mode exposed async start without job polling controls');
  } finally { await minimalClient.close(); }

  const sessionTransport = new StdioClientTransport({ command: process.execPath, args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'safe', '--tool-mode', 'standard', '--bash-session', 'session-ok', '--require-bash-session'], env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_JOB_DIR: stateDir } });
  const sessionClient = new Client({ name: 'async-verification-session-smoke', version: '0.1.0' });
  await sessionClient.connect(sessionTransport);
  try {
    const denied = await sessionClient.callTool({ name: 'resume_job', arguments: { job_id: 'job_deadbeef' } });
    assert.equal(denied.isError, true, 'resume_job bypassed required Bash session');
    assert.match(denied.content?.find((part) => part.type === 'text')?.text ?? '', /session/i);
  } finally { await sessionClient.close(); }

  assert.equal(resumedDone.result?.routing?.asyncToolName, 'start_checks');
  console.log('async verification smoke passed');
} finally {
  unregister();
  process.env = saved;
  await fs.rm(root, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
  await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 100 });
}
