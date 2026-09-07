import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadConfig } from '../dist/config.js';
import { WorkspaceManager, PathGuard } from '../dist/guard.js';
import { OperationStore } from '../dist/operations/store.js';
import { OperationManager } from '../dist/operations/manager.js';
import { CheckpointStore } from '../dist/checkpoints/store.js';
import { createMutationCheckpoint, finalizeMutationCheckpoint, restoreCheckpoint } from '../dist/checkpoints/ops.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-'));
const checkpointDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-store-'));
const operationDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-ops-'));
const config = { ...loadConfig(['--root', root, '--allow-root', root, '--write', 'workspace']), checkpointDir, operationDir };
const workspace = new WorkspaceManager(config).defaultWorkspace();
const guard = new PathGuard(config);
const operationManager = new OperationManager(new OperationStore({ baseDir: operationDir, maxReceipts: 32 }), workspace.id);
const store = new CheckpointStore({ baseDir: checkpointDir, maxCheckpoints: 32, maxBytes: 1_000_000 });

await fs.writeFile(path.join(root, 'a.txt'), 'before\n');
const checkpoint = await createMutationCheckpoint({ config, guard, workspace, store, paths: ['a.txt'] });
assert.match(checkpoint.id, /^chk_/);
assert.equal(checkpoint.entries.length, 1);
assert.equal(checkpoint.entries[0].path, 'a.txt');
await fs.writeFile(path.join(root, 'a.txt'), 'after\n');
const finalized = await finalizeMutationCheckpoint({ config, guard, workspace, store, checkpointId: checkpoint.id });
assert.ok(finalized.entries[0].afterSha256);
const blobFiles = await fs.readdir(path.join(checkpointDir, 'blobs'));
assert.equal(blobFiles.length, 1, 'preimage should be content-addressed once');
await restoreCheckpoint({ config, guard, workspace, store, operationManager, checkpointId: checkpoint.id });
assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'before\n');

const created = await createMutationCheckpoint({ config, guard, workspace, store, paths: ['new.txt'] });
await fs.writeFile(path.join(root, 'new.txt'), 'created\n');
await finalizeMutationCheckpoint({ config, guard, workspace, store, checkpointId: created.id });
await restoreCheckpoint({ config, guard, workspace, store, operationManager, checkpointId: created.id });
await assert.rejects(fs.access(path.join(root, 'new.txt')));

const stale = await createMutationCheckpoint({ config, guard, workspace, store, paths: ['a.txt'] });
await fs.writeFile(path.join(root, 'a.txt'), 'mutation\n');
await finalizeMutationCheckpoint({ config, guard, workspace, store, checkpointId: stale.id });
await fs.writeFile(path.join(root, 'a.txt'), 'later-user-edit\n');
await assert.rejects(
  restoreCheckpoint({ config, guard, workspace, store, operationManager, checkpointId: stale.id }),
  /changed after|stale|hash/i
);
assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'later-user-edit\n');


const mcpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-mcp-'));
const mcpCheckpointDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-mcp-store-'));
const mcpOperationDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-checkpoint-mcp-ops-'));
const gitInit = spawnSync('git', ['init'], { cwd: mcpRoot, encoding: 'utf8' });
assert.equal(gitInit.status, 0, gitInit.stderr || gitInit.stdout);
await fs.writeFile(path.join(mcpRoot, 'edit.txt'), 'before-edit\n');
await fs.writeFile(path.join(mcpRoot, 'patch.txt'), 'before-patch\n');
await fs.writeFile(path.join(mcpRoot, 'change.txt'), 'before-change\n');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', mcpRoot, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full'],
  env: {
    ...process.env,
    CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1',
    CODEXPRO_CHECKPOINT_DIR: mcpCheckpointDir,
    CODEXPRO_OPERATION_DIR: mcpOperationDir
  }
});
const client = new Client({ name: 'checkpoints-mcp-smoke', version: '0.1.0' });
await client.connect(transport);

let call = await client.callTool({ name: 'write', arguments: { path: 'created.txt', content: 'created-by-mcp\n' } });
assert.match(call.structuredContent.checkpoint_id, /^chk_/);
let restore = await client.callTool({ name: 'restore_checkpoint', arguments: { checkpoint_id: call.structuredContent.checkpoint_id } });
assert.equal(restore.isError, undefined);
await assert.rejects(fs.access(path.join(mcpRoot, 'created.txt')));

call = await client.callTool({ name: 'edit', arguments: { path: 'edit.txt', old_text: 'before-edit', new_text: 'after-edit' } });
assert.match(call.structuredContent.checkpoint_id, /^chk_/);
await client.callTool({ name: 'restore_checkpoint', arguments: { checkpoint_id: call.structuredContent.checkpoint_id } });
assert.equal(await fs.readFile(path.join(mcpRoot, 'edit.txt'), 'utf8'), 'before-edit\n');

const patch = ['diff --git a/patch.txt b/patch.txt','--- a/patch.txt','+++ b/patch.txt','@@ -1 +1 @@','-before-patch','+after-patch',''].join('\n');
call = await client.callTool({ name: 'apply_patch', arguments: { patch } });
assert.match(call.structuredContent.checkpoint_id, /^chk_/);
await client.callTool({ name: 'restore_checkpoint', arguments: { checkpoint_id: call.structuredContent.checkpoint_id } });
assert.equal(await fs.readFile(path.join(mcpRoot, 'patch.txt'), 'utf8'), 'before-patch\n');

const changeBeforeSha = createHash('sha256').update('before-change\n').digest('hex');
const prepared = await client.callTool({ name: 'prepare_change_set', arguments: { changes: [{ path: 'change.txt', content: 'after-change\n', expected_sha256: changeBeforeSha }] } });
if (!prepared.structuredContent?.change_set?.id) throw new Error(`prepare_change_set response: ${JSON.stringify(prepared)}`);
const changeSetId = prepared.structuredContent.change_set.id;
call = await client.callTool({ name: 'apply_change_set', arguments: { change_set_id: changeSetId } });
assert.match(call.structuredContent.checkpoint_id, /^chk_/);
await client.callTool({ name: 'restore_checkpoint', arguments: { checkpoint_id: call.structuredContent.checkpoint_id } });
assert.equal(await fs.readFile(path.join(mcpRoot, 'change.txt'), 'utf8'), 'before-change\n');
await client.close();

console.log('checkpoints smoke passed');
