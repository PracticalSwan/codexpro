import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadConfig } from '../dist/config.js';
import { JobStore, publicJobRecord } from '../dist/jobs/store.js';
import {
  registerStructuredJobProducer,
  launchStructuredJob,
  reconcileJob,
  cancelJob,
  resumeJob,
  signalJobProcessTree,
  processStartIdentity,
  STRUCTURED_JOB_ATTESTATION_GRACE_MS
} from '../dist/jobs/runner.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-jobs-smoke-'));
const stateDir = path.join(root, 'state');
const workspace = { id: 'ws_jobs_smoke', root, openedAt: new Date().toISOString() };
const envKeys = ['CODEXPRO_ROOT', 'CODEXPRO_ALLOWED_ROOTS', 'CODEXPRO_BASH_MODE', 'CODEXPRO_ALLOW_NO_HTTP_TOKEN'];
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_BASH_MODE = 'safe';
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
const config = loadConfig([]);
const store = new JobStore({ baseDir: stateDir, maxJobs: 4, maxOutputBytes: 4_096, maxReadBytes: 1_024 });const helperUrl = pathToFileURL(path.resolve('dist/jobs/worker.js')).href;
const fixtureWorker = path.join(root, 'job-fixture-worker.mjs');
await fs.writeFile(fixtureWorker, `
import { runStructuredJobWorker } from ${JSON.stringify(helperUrl)};
await runStructuredJobWorker(async (ctx) => {
  const mode = String(ctx.payload.mode || 'complete');
  if (mode === 'hold') {
    await ctx.setProgress({ phase: 'holding', completed: Number(ctx.payload.completed || 0), total: 2 });
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { ok: true, resumed: true };
  }
  await ctx.setProgress({ phase: 'verifying', completed: Number(ctx.payload.completed || 0), total: 2 });
  await ctx.appendOutput('TOKEN=ghp_abcdefghijklmnopqrstuvwxyz123456 fixture output\\n');
  await new Promise((resolve) => setTimeout(resolve, 120));
  return { ok: true, secret: 'ghp_abcdefghijklmnopqrstuvwxyz123456', completed: Number(ctx.payload.completed || 0) + 1 };
});
`, 'utf8');
const unregister = registerStructuredJobProducer({ kind: 'verification', workerEntrypoint: fixtureWorker, resumable: true });

async function settle(id, attempts = Math.ceil(STRUCTURED_JOB_ATTESTATION_GRACE_MS / 100) + 20) {
  for (let i = 0; i < attempts; i += 1) {
    const record = await reconcileJob(store, id);
    if (['completed', 'failed', 'canceled', 'interrupted'].includes(record.state)) return record;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return store.require(id);
}

async function boundedStep(label, operation, timeoutMs = 15_000) {
  console.log(`[jobs smoke] ${label}`);
  let timer;
  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`jobs smoke timed out during ${label} after ${timeoutMs} ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}try {
  const job = await store.create({ workspace, kind: 'verification', progress: { phase: 'queued', completed: 0 } });
  assert.match(job.id, /^job_[A-Za-z0-9-]+$/);
  assert.equal(job.state, 'queued');
  assert.equal((await store.requireForWorkspace(job.id, workspace)).id, job.id);
  await assert.rejects(() => store.requireForWorkspace(job.id, { ...workspace, id: 'ws_other' }), /belong/i);

  await Promise.all([
    store.update(job.id, (record) => { record.progress.completed += 1; return record; }),
    store.update(job.id, (record) => { record.progress.completed += 1; return record; })
  ]);
  assert.equal((await store.require(job.id)).progress.completed, 2, 'atomic updates lost progress');

  await store.appendOutput(job.id, `ghp_abcdefghijklmnopqrstuvwxyz123456 ${'🙂'.repeat(1500)}\n`);
  const page1 = await store.readOutput(job.id, 0, 128);
  assert(Buffer.byteLength(page1.text, 'utf8') <= 128);
  assert(!page1.text.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'));
  assert(page1.nextCursor > 0);
  const page2 = await store.readOutput(job.id, page1.nextCursor, 128);
  assert(page2.nextCursor > page1.nextCursor);
  const tail = await store.readOutput(job.id, page2.nextCursor, 1_024);
  assert.equal(typeof tail.truncated, 'boolean');

  await fs.mkdir(path.join(stateDir, 'records'), { recursive: true });
  await fs.writeFile(path.join(stateDir, 'records', 'job_bad.json'), '{bad json', 'utf8');
  await assert.rejects(() => store.get('job_bad'), /Malformed job record/);
  const publicSource = await store.create({ workspace, kind: 'verification' });
  const publicWithWorker = await store.update(publicSource.id, (record) => {
    record.state = 'running';
    record.worker = { pid: 1234, startedAt: new Date().toISOString(), nonceHash: 'a'.repeat(64), startKey: 'test-start-key' };
    return record;
  });
  const safePublic = publicJobRecord(publicWithWorker);
  assert(!('workspaceRoot' in safePublic));
  assert(!JSON.stringify(safePublic).includes('test-start-key'));
  assert(!JSON.stringify(safePublic).includes('a'.repeat(64)));

  const attestationGraceJob = await store.create({ workspace, kind: 'verification' });
  await store.update(attestationGraceJob.id, (record) => {
    record.state = 'running';
    record.worker = { pid: process.pid, startedAt: new Date().toISOString(), nonceHash: 'b'.repeat(64), startKey: 'delayed-start-key' };
    return record;
  });
  const attestationGrace = await reconcileJob(store, attestationGraceJob.id, { processStartIdentity: () => null });
  assert.equal(attestationGrace.state, 'running', 'temporary identity-probe unavailability interrupted a newly claimed worker');

  const completeJob = await store.create({ workspace, kind: 'verification' });
  await store.savePayload(completeJob.id, { mode: 'complete', completed: 0 });
  const launched = await boundedStep('complete job launch', () => launchStructuredJob(config, store, workspace, completeJob.id), 60_000);
  assert.equal(launched.state, 'running');
  assert(launched.worker?.pid && launched.worker.nonceHash.length === 64 && launched.worker.startKey);
  const completed = await boundedStep('complete job settle', () => settle(completeJob.id), 60_000);
  assert.equal(completed.state, 'completed');
  assert.equal(completed.result?.ok, true);
  assert(!JSON.stringify(completed.result).includes('ghp_abcdefghijklmnopqrstuvwxyz123456'));
  const completedOutput = await store.readOutput(completeJob.id, 0, 512);
  assert.match(completedOutput.text, /fixture output/);
  assert(!completedOutput.text.includes('ghp_abcdefghijklmnopqrstuvwxyz123456'));

  if (process.platform === 'win32') {
    const parentAttestedJob = await store.create({ workspace, kind: 'verification' });
    await store.savePayload(parentAttestedJob.id, { mode: 'complete', completed: 0 });
    const parentAttestedLaunch = await boundedStep('parent-attested job launch', () => launchStructuredJob(config, store, workspace, parentAttestedJob.id, {
      spawnWorker: (entrypoint, args, env) => spawn(process.execPath, [entrypoint, ...args], {
        detached: true, stdio: 'ignore', windowsHide: true, env: { ...env, PATH: '', Path: '' }
      })
    }), 60_000);
    assert.equal(parentAttestedLaunch.state, 'running');
    const parentAttestedDone = await boundedStep('parent-attested job settle', () => settle(parentAttestedJob.id), 60_000);
    assert.equal(parentAttestedDone.state, 'completed', 'worker required a redundant Windows start-identity lookup after parent attestation');
  }

  // A cold Windows runner can take longer than the worker's initial claim window to expose StartTime.
  // Keep the detached worker alive while the parent performs bounded secure PID/start-identity attestation.
  const delayedIdentityJob = await store.create({ workspace, kind: 'verification' });
  await store.savePayload(delayedIdentityJob.id, { mode: 'complete', completed: 0 });
  let delayedIdentityAttempts = 0;
  const delayedIdentityLaunched = await boundedStep('delayed-identity job launch', () => launchStructuredJob(config, store, workspace, delayedIdentityJob.id, {
    processStartIdentity: (pid) => {
      delayedIdentityAttempts += 1;
      if (delayedIdentityAttempts <= 6) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
        return null;
      }
      return processStartIdentity(pid);
    }
  }), 60_000);
  assert(delayedIdentityAttempts >= 7, 'delayed identity fixture did not cross the legacy worker-claim window');
  assert.equal(delayedIdentityLaunched.state, 'running');
  const delayedIdentityDone = await boundedStep('delayed-identity job settle', () => settle(delayedIdentityJob.id), 60_000);
  assert.equal(delayedIdentityDone.state, 'completed');

  const crashJob = await store.create({ workspace, kind: 'verification' });
  await store.savePayload(crashJob.id, { mode: 'hold', completed: 1 });
  const crashLaunched = await boundedStep('crash job launch', () => launchStructuredJob(config, store, workspace, crashJob.id), 60_000);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert(await store.readOwner(crashJob.id), 'worker did not attest ownership');
  assert(signalJobProcessTree(crashLaunched.worker.pid));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const interrupted = await boundedStep('crash job reconcile', () => reconcileJob(store, crashJob.id), 60_000);
  assert.equal(interrupted.state, 'interrupted');
  await store.savePayload(crashJob.id, { mode: 'complete', completed: 1 });
  const resumed = await boundedStep('crash job resume', () => resumeJob(config, store, workspace, crashJob.id), 60_000);
  assert.equal(resumed.state, 'running');
  const resumedDone = await boundedStep('resumed job settle', () => settle(crashJob.id), 60_000);
  assert.equal(resumedDone.state, 'completed');
  assert.equal(resumedDone.result?.completed, 2, 'resume did not use durable producer payload');

  const mismatchJob = await store.create({ workspace, kind: 'verification' });
  await store.savePayload(mismatchJob.id, { mode: 'hold', completed: 0 });
  const mismatchLaunched = await boundedStep('mismatch job launch', () => launchStructuredJob(config, store, workspace, mismatchJob.id), 60_000);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert(await store.readOwner(mismatchJob.id), 'mismatch worker did not attest ownership');
  let signaled = false;
  await assert.rejects(
    () => cancelJob(store, mismatchJob.id, { processStartIdentity: () => 'reused-pid-start-key', signalProcess: () => { signaled = true; return true; } }),
    /refus/i
  );
  assert.equal(signaled, false, 'PID reuse defense attempted to signal an unverified process');
  signalJobProcessTree(mismatchLaunched.worker.pid);

  const cancelTarget = await store.create({ workspace, kind: 'verification' });
  await store.savePayload(cancelTarget.id, { mode: 'hold', completed: 0 });
  const cancelLaunched = await boundedStep('cancel job launch', () => launchStructuredJob(config, store, workspace, cancelTarget.id), 60_000);
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert(await store.readOwner(cancelTarget.id), 'cancel worker did not attest ownership');
  const canceled = await boundedStep('cancel running job', () => cancelJob(store, cancelTarget.id), 60_000);
  assert.equal(canceled.state, 'canceled');
  assert.equal(await store.readOwner(cancelTarget.id), null);
  let canceledAlive = true;
  try { process.kill(cancelLaunched.worker.pid, 0); } catch { canceledAlive = false; }
  assert.equal(canceledAlive, false, 'canceled job worker still alive');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'safe', '--write', 'workspace', '--tool-mode', 'standard'],
    env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_JOB_DIR: stateDir, CODEXPRO_OPERATION_DIR: path.join(root, '.mcp-ops'), CODEXPRO_ACTIVITY_DIR: path.join(root, '.mcp-activity') }
  });
  const client = new Client({ name: 'jobs-mcp-smoke', version: '0.1.0' });
  try {
    await boundedStep('MCP connect', () => client.connect(transport));
    const tools = await boundedStep('MCP listTools', () => client.listTools());
    assert(!tools.tools.some((tool) => tool.name === 'job_start'), 'generic public job_start tool must not exist');
    assert(['job_status','list_jobs','read_job_output','cancel_job','resume_job'].every((name) => tools.tools.some((tool) => tool.name === name)), 'job control surface incomplete');
    const opened = await boundedStep('MCP open_current_workspace', () => client.callTool({ name: 'open_current_workspace', arguments: {} }));
    const serverWorkspaceId = opened.structuredContent.workspace?.id ?? opened.structuredContent.workspace_id;
    const serverWorkspaceRoot = opened.structuredContent.workspace?.root ?? opened.structuredContent.root;
    assert(serverWorkspaceId, 'MCP workspace id missing');
    assert(serverWorkspaceRoot, 'MCP canonical workspace root missing');
    const mcpWorkspace = { id: serverWorkspaceId, root: serverWorkspaceRoot };
    const mcpJob = await store.create({ workspace: mcpWorkspace, kind: 'verification' });
    await store.appendOutput(mcpJob.id, 'mcp persisted output\n');
    const statusStarted = Date.now();
    const status = await boundedStep('MCP job_status', () => client.callTool({ name: 'job_status', arguments: { workspace_id: serverWorkspaceId, job_id: mcpJob.id } }));
    assert(Date.now() - statusStarted < 2_000, 'job_status waited instead of polling persisted state');
    assert.equal(status.structuredContent.job.id, mcpJob.id);
    assert.equal(status.structuredContent.job.state, 'queued');
    const jobs = await boundedStep('MCP list_jobs', () => client.callTool({ name: 'list_jobs', arguments: { workspace_id: serverWorkspaceId } }));
    assert(jobs.structuredContent.jobs.some((item) => item.id === mcpJob.id));
    const output = await boundedStep('MCP read_job_output', () => client.callTool({ name: 'read_job_output', arguments: { workspace_id: serverWorkspaceId, job_id: mcpJob.id, cursor: 0, max_bytes: 1024 } }));
    assert.match(output.structuredContent.text, /mcp persisted output/);
    const canceledMcp = await boundedStep('MCP cancel_job', () => client.callTool({ name: 'cancel_job', arguments: { workspace_id: serverWorkspaceId, job_id: mcpJob.id } }));
    assert.equal(canceledMcp.structuredContent.job.state, 'canceled');
  } finally {
    await boundedStep('MCP close', () => client.close().catch(() => undefined), 7_500);
  }

  for (let i = 0; i < 6; i += 1) {
    const old = await store.create({ workspace, kind: 'verification' });
    const at = new Date(Date.now() - (10_000 + i * 1_000)).toISOString();
    await store.saveTerminal(old.id, { schemaVersion: 1, state: 'completed', at, result: { index: i } });
    await store.update(old.id, (record) => { record.state = 'completed'; record.result = { index: i }; record.updatedAt = at; return record; });
  }
  const listed = await store.list(workspace.id);
  assert(listed.length <= 4, 'bounded job listing exceeded maxJobs');
  assert(listed.every((record) => record.workspaceId === workspace.id));

  console.log('jobs smoke passed');
} finally {
  unregister();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}