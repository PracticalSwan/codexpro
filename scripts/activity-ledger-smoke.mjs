import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ActivityStore } from '../dist/activity/store.js';
import { ActivityRegistry } from '../dist/activity/registry.js';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-activity-'));
const store = new ActivityStore({ baseDir, maxRecords: 4, maxBytes: 6000 });
const registry = new ActivityRegistry(store);
await registry.append({ workspaceId: 'ws_one', kind: 'tool', action: 'read', status: 'ok', relativePaths: ['src/a.ts'], summary: 'safe result' });
await registry.append({ workspaceId: 'ws_one', kind: 'operation', action: 'write', status: 'ok', operationId: 'op_123', relativePaths: ['src/a.ts'] });
await registry.append({ workspaceId: 'ws_one', kind: 'tool', action: 'bad', status: 'error', summary: 'token=secret-value C:\\Users\\me\\secret.txt' });
const page = await registry.read({ workspaceId: 'ws_one', limit: 10 });
assert.equal(page.records.length, 3);
assert.deepEqual(page.records.map((record) => record.sequence), [1, 2, 3]);
assert.equal(page.records[1].operationId, 'op_123');
assert.ok(!JSON.stringify(page).includes('secret-value'));
assert.ok(!JSON.stringify(page).includes('C:\\Users'));
const filtered = await registry.read({ workspaceId: 'ws_one', afterSequence: 1, kinds: ['operation'], statuses: ['ok'], limit: 2 });
assert.equal(filtered.records.length, 1);
assert.equal(filtered.records[0].sequence, 2);
await registry.append({ workspaceId: 'ws_two', kind: 'tool', action: 'read', status: 'ok', summary: 'other workspace' });
const isolated = await registry.read({ workspaceId: 'ws_one', limit: 10 });
assert.ok(isolated.records.every((record) => record.workspaceId === 'ws_one'));
await registry.append({ workspaceId: 'ws_one', kind: 'tool', action: 'four', status: 'ok' });
await registry.append({ workspaceId: 'ws_one', kind: 'tool', action: 'five', status: 'ok' });
const rotated = await registry.read({ workspaceId: 'ws_one', limit: 10 });
assert.equal(rotated.records.length, 4);
assert.deepEqual(rotated.records.map((record) => record.sequence), [2, 3, 4, 5]);

const broken = new ActivityRegistry(new ActivityStore({ baseDir: path.join(baseDir, 'blocked'), maxRecords: 4, maxBytes: 6000 }));
await fs.writeFile(path.join(baseDir, 'blocked'), 'not a directory');
await broken.appendBestEffort({ workspaceId: 'ws_fail', kind: 'tool', action: 'read', status: 'ok' });
const mcpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-activity-mcp-'));
const mcpActivity = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-activity-mcp-store-'));
await fs.writeFile(path.join(mcpRoot, 'visible.txt'), 'visible\n');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', mcpRoot, '--allow-root', mcpRoot, '--bash', 'off', '--write', 'off', '--tool-mode', 'minimal'],
  env: { ...process.env, CODEXPRO_ACTIVITY_DIR: mcpActivity, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1' }
});
const client = new Client({ name: 'activity-ledger-smoke', version: '0.1.0' });
await client.connect(transport);
const opened = await client.callTool({ name: 'open_current_workspace', arguments: {} });
const ws = opened.structuredContent.workspace_id;
const okRead = await client.callTool({ name: 'read', arguments: { workspace_id: ws, path: 'visible.txt' } });
assert.notEqual(okRead.isError, true);
const badRead = await client.callTool({ name: 'read', arguments: { workspace_id: ws, path: 'missing.txt' } });
assert.equal(badRead.isError, true);
const logged = await client.callTool({ name: 'activity_log', arguments: { workspace_id: ws, limit: 20 } });
assert.notEqual(logged.isError, true);
const readRecords = logged.structuredContent.records.filter((record) => record.action === 'read');
assert.ok(readRecords.some((record) => record.status === 'ok'));
assert.ok(readRecords.some((record) => record.status === 'error'));
assert.ok(!JSON.stringify(logged.structuredContent).includes('visible\n'));
await client.close();
console.log('activity ledger smoke passed');
