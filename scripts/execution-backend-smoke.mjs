import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { buildDockerRunArgs, containerWorkdir, probeDockerBackend } from '../dist/execution/dockerBackend.js';
import { resolveExecutionBackend } from '../dist/execution/index.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-execution-backend-'));
const keys = ['CODEXPRO_ROOT','CODEXPRO_ALLOWED_ROOTS','CODEXPRO_EXECUTION_BACKEND','CODEXPRO_DOCKER_IMAGE','CODEXPRO_ALLOW_NO_HTTP_TOKEN'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
try {
  process.env.CODEXPRO_ROOT = root;
  process.env.CODEXPRO_ALLOWED_ROOTS = root;
  process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
  delete process.env.CODEXPRO_EXECUTION_BACKEND;
  delete process.env.CODEXPRO_DOCKER_IMAGE;
  const host = loadConfig([]);
  assert.equal(host.executionBackend, 'host');
  assert.equal(resolveExecutionBackend(host).kind, 'host');
  process.env.CODEXPRO_EXECUTION_BACKEND = 'docker';
  assert.throws(() => loadConfig([]), /requires CODEXPRO_DOCKER_IMAGE/i);
  delete process.env.CODEXPRO_EXECUTION_BACKEND;
  process.env.CODEXPRO_EXECUTION_BACKEND = 'docker';
  process.env.CODEXPRO_DOCKER_IMAGE = '--privileged';
  assert.throws(() => loadConfig([]), /image reference|option prefix/i);
  delete process.env.CODEXPRO_EXECUTION_BACKEND;
  delete process.env.CODEXPRO_DOCKER_IMAGE;

  const docker = { ...host, executionBackend: 'docker', dockerExecutable: 'codexpro-does-not-exist',
    dockerImage: 'local/test:latest', dockerMemoryMb: 256, dockerCpus: 1.5, dockerPidsLimit: 64 };
  assert.equal(probeDockerBackend(docker).available, false);
  const args = buildDockerRunArgs(docker, {
    workspaceRoot: root, workspaceId: 'ws_test', command: 'printf hello', cwdRel: 'sub/dir', containerName: 'codexpro-test-123'
  });
  assert.ok(args.includes('--rm') && args.includes('--init'));
  assert.ok(args.includes('--network') && args.includes('none'));
  assert.ok(args.includes('--memory') && args.includes('256m'));
  assert.ok(args.includes('--cpus') && args.includes('1.5'));
  assert.ok(args.includes('--pids-limit') && args.includes('64'));
  assert.ok(args.includes('codexpro.owner=codexpro'));
  assert.ok(args.includes('codexpro.container=codexpro-test-123'));
  assert.ok(args.includes('--entrypoint') && args.includes('/bin/sh'));
  assert.equal(resolveExecutionBackend(docker).kind, 'docker');
  assert.throws(() => resolveExecutionBackend(docker).start({ config: docker, workspace: { id: 'ws_test', root, openedAt: new Date().toISOString() }, command: 'printf hello', cwdAbs: root, cwdRel: '.' }), /unavailable/i, 'explicit docker selection must fail closed without host fallback');
  const fakeHandle = { kind: 'docker', child: { pid: undefined }, containerName: 'foreign-container' };
  resolveExecutionBackend(docker).stop(fakeHandle, 'SIGTERM');
  assert.match(fakeHandle.cleanupError, /refused/i, 'unowned container cleanup must be rejected');
  const mounts = args.filter((value) => value.startsWith('type=bind,'));
  assert.equal(mounts.length, 1);
  assert.ok(mounts[0].includes('dst=/workspace'));
  assert.equal(containerWorkdir('sub/dir'), '/workspace/sub/dir');
  assert.throws(() => containerWorkdir('../escape'), /inside|relative|escape/i);
  assert.ok(!args.includes('--privileged'));
  assert.ok(!args.some((value) => /docker\.sock|\.ssh|id_rsa|USERPROFILE|HOME/i.test(value)));
  assert.equal(args.at(-3), 'local/test:latest');
  assert.equal(args.at(-2), '-lc');
  assert.equal(args.at(-1), 'printf hello');
} finally {
  for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key];
  await fs.rm(root, { recursive: true, force: true });
}
console.log('execution backend smoke passed');
