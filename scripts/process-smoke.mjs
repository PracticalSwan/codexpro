import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard } from '../dist/guard.js';
import { OperationStore } from '../dist/operations/store.js';
import { OperationManager } from '../dist/operations/manager.js';
import { WorkspaceProcessManager } from '../dist/processOps.js';

const rootRaw = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-process-smoke-'));
const root = await fs.realpath(rootRaw);
const opDir = path.join(root, '.ops');
const keys = ['CODEXPRO_ROOT','CODEXPRO_ALLOWED_ROOTS','CODEXPRO_BASH_MODE','CODEXPRO_OPERATION_DIR','CODEXPRO_ALLOW_NO_HTTP_TOKEN'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_BASH_MODE = 'full';
process.env.CODEXPRO_OPERATION_DIR = opDir;
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
const config = loadConfig([]);
const workspace = { id: 'ws_process_smoke', root, openedAt: new Date().toISOString() };
const guard = new PathGuard(config);
const operations = new OperationManager(new OperationStore({ baseDir: opDir, maxReceipts: 64 }), workspace.id);
const manager = new WorkspaceProcessManager({ config, guard, workspace, operationManager: operations, maxProcesses: 4 });
try {
  await assert.rejects(
    manager.start({ command: 'node -e "console.log(1)"', cwd: '..' }),
    /escapes workspace root/i
  );

  const noisy = await manager.start({
    command: "node -e \"for(let i=0;i<4000;i++) console.log('line-'+i); setTimeout(()=>{},1500)\""
  });
  assert.match(noisy.id, /^proc_/);
  assert.equal(noisy.workspaceId, workspace.id);
  assert.equal('pid' in noisy, false, 'public process record exposed an OS PID');
  assert.ok(noisy.operationId?.startsWith('op_'));

  const outputDeadline = Date.now() + 2000;
  let first = manager.readOutput(noisy.id, { maxBytes: 4096 });
  while (first.nextCursor <= first.cursor && Date.now() < outputDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    first = manager.readOutput(noisy.id, { maxBytes: 4096 });
  }
  assert.ok(first.nextCursor > first.cursor, 'workspace process did not produce output within 2 seconds');
  assert.ok(Buffer.byteLength(first.stdout + first.stderr, 'utf8') <= 5000);
  assert.equal(first.truncated || first.hasMore, true);
  const second = manager.readOutput(noisy.id, { cursor: first.nextCursor, maxBytes: 4096 });
  assert.ok(second.cursor >= first.nextCursor);
  assert.throws(() => manager.status('proc_not_owned'), /Unknown process id/i);
  await assert.rejects(manager.stop('12345'), /Unknown process id/i);
  const long = await manager.start({
    command: "node -e \"setInterval(()=>console.log('alive'),50)\""
  });
  assert.equal(manager.status(long.id).state, 'running');
  await manager.close();
  const stopped = manager.status(long.id);
  assert.notEqual(stopped.state, 'running');
  assert.equal(stopped.terminationReason, 'shutdown');

  console.log('process smoke passed');
} finally {
  await manager.close().catch(() => {});
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fs.rm(rootRaw, { recursive: true, force: true });
}
