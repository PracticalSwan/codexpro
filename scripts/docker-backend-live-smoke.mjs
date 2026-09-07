import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadConfig } from '../dist/config.js';
import { PathGuard } from '../dist/guard.js';
import { runBash } from '../dist/bashOps.js';
import { OperationStore } from '../dist/operations/store.js';
import { OperationManager } from '../dist/operations/manager.js';
import { WorkspaceProcessManager } from '../dist/processOps.js';
import { probeDockerBackend } from '../dist/execution/dockerBackend.js';

const image = process.env.CODEXPRO_DOCKER_TEST_IMAGE?.trim();
if (!image) {
  console.log('docker backend live smoke not tested: CODEXPRO_DOCKER_TEST_IMAGE is not set');
  process.exit(0);
}
const base = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-docker-live-'));
const root = path.join(base, 'workspace');
const opDir = path.join(base, 'operations');
await fs.mkdir(path.join(root, 'sub'), { recursive: true });
const keys = ['CODEXPRO_ROOT','CODEXPRO_ALLOWED_ROOTS','CODEXPRO_BASH_MODE','CODEXPRO_OPERATION_DIR','CODEXPRO_ALLOW_NO_HTTP_TOKEN','CODEXPRO_EXECUTION_BACKEND','CODEXPRO_DOCKER_IMAGE'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));function dockerNames(workspaceId) {
  const label = workspaceId.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 63);
  const result = spawnSync('docker', ['ps','-aq','--filter',`label=codexpro.workspace=${label}`,'--format','{{.Names}}'], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, 'docker ps failed while checking cleanup');
  return String(result.stdout ?? '').trim().split(/\r?\n/).filter(Boolean);
}
function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}
async function waitForOutput(manager, id, needle) {
  for (let i = 0; i < 30; i++) {
    const page = manager.readOutput(id, { maxBytes: 8192 });
    if ((page.stdout + page.stderr).includes(needle)) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for process output: ${needle}`);
}

process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_BASH_MODE = 'full';
process.env.CODEXPRO_OPERATION_DIR = opDir;
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
process.env.CODEXPRO_EXECUTION_BACKEND = 'docker';
process.env.CODEXPRO_DOCKER_IMAGE = image;
process.env.CODEXPRO_DOCKER_SECRET_SENTINEL = 'must-not-enter-container';let manager;
let goalGate = 'not-tested';
try {
  const config = loadConfig([]);
  assert.equal(config.executionBackend, 'docker');
  const status = probeDockerBackend(config);
  assert.equal(status.available, true, JSON.stringify(status));
  const workspace = { id: 'ws_docker_live', root: await fs.realpath(root), openedAt: new Date().toISOString() };
  const guard = new PathGuard(config);

  const oneShot = await runBash(config, guard, workspace, "printf docker-live > result.txt; cat result.txt");
  assert.equal(oneShot.exitCode, 0);
  assert.equal(oneShot.bashRuntime, 'docker');
  assert.match(oneShot.stdout, /docker-live/);
  assert.equal((await fs.readFile(path.join(root, 'result.txt'), 'utf8')).trim(), 'docker-live');

  const cwd = await runBash(config, guard, workspace, 'pwd', { cwd: 'sub' });
  assert.equal(cwd.exitCode, 0);
  assert.match(cwd.stdout, /\/workspace\/sub/);
  const envResult = await runBash(config, guard, workspace, 'env');
  assert.equal(envResult.exitCode, 0);
  assert.equal(envResult.stdout.includes('CODEXPRO_DOCKER_SECRET_SENTINEL'), false);
  assert.equal(dockerNames(workspace.id).length, 0, 'one-shot container leaked');
  const timeout = await runBash(config, guard, workspace, 'sleep 5', { timeoutMs: 1000 });
  assert.equal(timeout.terminationReason, 'timeout');
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(dockerNames(workspace.id).length, 0, 'timed-out container leaked');

  const limitedConfig = { ...config, maxOutputBytes: 1024, maxBashObservedOutputBytes: 2048 };
  const limited = await runBash(limitedConfig, new PathGuard(limitedConfig), workspace,
    'i=0; while [ $i -lt 5000 ]; do printf x; i=$((i+1)); done');
  assert.equal(limited.terminationReason, 'output_limit');
  assert.equal(limited.truncated, true);
  assert.ok(limited.observedOutputBytes > 2048);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(dockerNames(workspace.id).length, 0, 'output-limited container leaked');

  const operations = new OperationManager(new OperationStore({ baseDir: opDir, maxReceipts: 64 }), workspace.id);
  manager = new WorkspaceProcessManager({ config, guard, workspace, operationManager: operations, maxProcesses: 2 });
  const proc = await manager.start({ command: 'printf ready; sleep 30' });
  assert.match(proc.id, /^proc_/);
  await waitForOutput(manager, proc.id, 'ready');
  const stopped = await manager.stop(proc.id);
  assert.equal(stopped.terminationReason, 'stopped');
  assert.equal(stopped.cleanupError, undefined);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(dockerNames(workspace.id).length, 0, 'managed container leaked');
  const shutdownProc = await manager.start({ command: 'printf shutdown-ready; sleep 30' });
  await waitForOutput(manager, shutdownProc.id, 'shutdown-ready');
  await manager.close();
  const shutdown = manager.status(shutdownProc.id);
  assert.equal(shutdown.terminationReason, 'shutdown');
  assert.equal(shutdown.cleanupError, undefined);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(dockerNames(workspace.id).length, 0, 'shutdown container leaked');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'full', '--write', 'workspace', '--tool-mode', 'full'],
    env: { ...process.env, CODEXPRO_ROOT: root, CODEXPRO_ALLOWED_ROOTS: root, CODEXPRO_BASH_MODE: 'full', CODEXPRO_OPERATION_DIR: opDir,
      CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_EXECUTION_BACKEND: 'docker', CODEXPRO_DOCKER_IMAGE: image }
  });
  const client = new Client({ name: 'docker-backend-live-smoke', version: '0.1.0' });
  await client.connect(transport);
  try {
    const publicConfig = await client.callTool({ name: 'server_config', arguments: {} });
    assert.equal(publicConfig.structuredContent.executionBackend, 'docker');
    assert.equal(publicConfig.structuredContent.execution?.available, true);
    assert.equal(publicConfig.structuredContent.goalExecutionBackend, 'host');
    assert.equal(publicConfig.structuredContent.bashRuntime?.runtime, 'docker');
    const selfTest = await client.callTool({ name: 'codexpro_self_test', arguments: { write_probe: false, pro_context_probe: false } });
    assert.equal(selfTest.structuredContent.bash_runtime?.runtime, 'docker');
    assert.equal(selfTest.structuredContent.bash_toolchain, null);
    const publicBash = await client.callTool({ name: 'bash', arguments: { command: 'printf mcp-docker-live' } });
    assert.equal(publicBash.isError, undefined);
    assert.equal(publicBash.structuredContent.bashRuntime, 'docker');
    assert.match(publicBash.structuredContent.stdout, /mcp-docker-live/);
  } finally {
    await client.close();
  }
  assert.equal(dockerNames(workspace.id).length, 0, 'MCP Docker container leaked');
  const source = path.join(base, 'goal-source');
  const worktree = path.join(base, 'goal-worktree');
  await fs.mkdir(source, { recursive: true });
  assert.equal(git(source, ['init']).status, 0);
  await fs.writeFile(path.join(source, 'tracked.txt'), 'source-original\n');
  assert.equal(git(source, ['add', 'tracked.txt']).status, 0);
  assert.equal(git(source, ['-c','user.name=CodexPro','-c','user.email=codexpro@example.invalid','commit','-m','init']).status, 0);
  assert.equal(git(source, ['worktree','add','--detach',worktree,'HEAD']).status, 0);
  const sourceBefore = await fs.readFile(path.join(source, 'tracked.txt'), 'utf8');
  const goalConfig = { ...config, defaultRoot: await fs.realpath(worktree), allowedRoots: [await fs.realpath(worktree)] };
  const goalWorkspace = { id: 'ws_goal_docker_probe', root: goalConfig.defaultRoot, openedAt: new Date().toISOString() };
  const goalStatus = await runBash(goalConfig, new PathGuard(goalConfig), goalWorkspace, 'git status --short', { timeoutMs: 10000 });
  if (goalStatus.exitCode === 0) {
    const mutate = await runBash(goalConfig, new PathGuard(goalConfig), goalWorkspace, "printf changed > tracked.txt");
    assert.equal(mutate.exitCode, 0);
    assert.equal(await fs.readFile(path.join(source, 'tracked.txt'), 'utf8'), sourceBefore, 'source checkout changed during worktree probe');
    goalGate = 'passed';
  } else {
    assert.equal(await fs.readFile(path.join(source, 'tracked.txt'), 'utf8'), sourceBefore);
    goalGate = 'host-only';
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(dockerNames(goalWorkspace.id).length, 0, 'Goal probe container leaked');
  git(source, ['worktree','remove','--force',worktree]);
  console.log(`docker backend live smoke passed; goal gate=${goalGate}`);
} finally {
  await manager?.close().catch(() => {});
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  delete process.env.CODEXPRO_DOCKER_SECRET_SENTINEL;
  await fs.rm(base, { recursive: true, force: true });
}