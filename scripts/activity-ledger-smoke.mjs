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
await fs.writeFile(path.join(mcpRoot, 'package.json'), JSON.stringify({ scripts: { test: 'node -e \"process.exit(1)\"' } }, null, 2));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', mcpRoot, '--allow-root', mcpRoot, '--bash', 'safe', '--write', 'off', '--tool-mode', 'full'],
  env: { ...process.env, CODEXPRO_ACTIVITY_DIR: mcpActivity, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_CONTINUATION_ENABLED: '1' }
});
const client = new Client({ name: 'activity-ledger-smoke', version: '0.1.0' });
await client.connect(transport);
const opened = await client.callTool({ name: 'open_current_workspace', arguments: {} });
const ws = opened.structuredContent.workspace_id;
const okRead = await client.callTool({ name: 'read', arguments: { workspace_id: ws, path: 'visible.txt' } });
assert.notEqual(okRead.isError, true);
const badRead = await client.callTool({ name: 'read', arguments: { workspace_id: ws, path: 'missing.txt' } });
assert.equal(badRead.isError, true);
const checks = await client.callTool({ name: 'run_checks', arguments: { workspace_id: ws } });
const checkId = checks.structuredContent.checks?.find((check) => check.command === 'npm test')?.id;
assert.ok(checkId, 'npm test check was not discovered');
const failedCheck = await client.callTool({ name: 'run_checks', arguments: { workspace_id: ws, check_ids: [checkId] } });
assert.equal(failedCheck.isError, undefined);
assert.equal(failedCheck.structuredContent.ok, false);
const armedContinuation = await client.callTool({ name: 'continuation_arm', arguments: { workspace_id: ws, title: 'bounded lifecycle test' } });
const continuationId = armedContinuation.structuredContent.task.id;
let continuationRevision = armedContinuation.structuredContent.task.revision;
const checkpointedContinuation = await client.callTool({ name: 'continuation_checkpoint', arguments: {
  workspace_id: ws, continuation_id: continuationId, expected_revision: continuationRevision,
  checkpoint_id: 'activity-cp', completed_evidence: ['phase complete'], remaining_work: ['next phase']
} });
continuationRevision = checkpointedContinuation.structuredContent.task.revision;
const requestedContinuation = await client.callTool({ name: 'continuation_request', arguments: {
  workspace_id: ws, continuation_id: continuationId, expected_revision: continuationRevision, request_id: 'activity-request'
} });
continuationRevision = requestedContinuation.structuredContent.task.revision;
await client.callTool({ name: 'continuation_cancel', arguments: { workspace_id: ws, continuation_id: continuationId, expected_revision: continuationRevision } });
const completedContinuation = await client.callTool({ name: 'continuation_arm', arguments: { workspace_id: ws, title: 'completed lifecycle test' } });
await client.callTool({ name: 'continuation_complete', arguments: { workspace_id: ws, continuation_id: completedContinuation.structuredContent.task.id, expected_revision: completedContinuation.structuredContent.task.revision } });
const logged = await client.callTool({ name: 'activity_log', arguments: { workspace_id: ws, limit: 40 } });
assert.notEqual(logged.isError, true);
const readRecords = logged.structuredContent.records.filter((record) => record.action === 'read');
assert.ok(readRecords.some((record) => record.status === 'ok'));
assert.ok(readRecords.some((record) => record.status === 'error'));
const failedCheckRecord = logged.structuredContent.records.find((record) => record.action === 'run_checks' && record.status === 'ok' && record.operationId);
assert.ok(failedCheckRecord, 'failed check invocation was not recorded as a completed tool call');
assert.match(failedCheckRecord.summary ?? '', /fail/i, 'activity summary must distinguish a completed failing check from a passing check');
const continuationRecords = logged.structuredContent.records.filter((record) => record.kind === 'continuation');
assert.deepEqual(continuationRecords.map((record) => record.action), ['arm', 'checkpoint', 'request', 'canceled', 'arm', 'completed']);
const firstShort = continuationId.replace(/^continuation_/, '').slice(0, 8);
const secondShort = completedContinuation.structuredContent.task.id.replace(/^continuation_/, '').slice(0, 8);
assert(continuationRecords.every((record) => /^[A-Za-z0-9-]{1,8}$/.test(String(record.continuationId || ''))), 'continuation lifecycle record omitted bounded task short id');
assert(continuationRecords.slice(0, 4).every((record) => record.continuationId === firstShort), 'first continuation lifecycle records changed task identity');
assert(continuationRecords.slice(4).every((record) => record.continuationId === secondShort), 'completed continuation lifecycle records changed task identity');
assert(continuationRecords.every((record) => !String(record.summary ?? '').includes('bounded lifecycle test')), 'continuation lifecycle record retained task title');
assert.ok(!JSON.stringify(logged.structuredContent).includes('visible\n'));
const beforeSelfReadSequence = logged.structuredContent.nextSequence;
const selfRead = await client.callTool({ name: 'activity_log', arguments: { workspace_id: ws, after_sequence: beforeSelfReadSequence, limit: 20 } });
assert.notEqual(selfRead.isError, true);
assert.equal(selfRead.structuredContent.records.length, 0, 'activity_log must not record its own read');
assert.equal(selfRead.structuredContent.nextSequence, beforeSelfReadSequence, 'activity_log must not advance the ledger sequence');
await client.close();
console.log('activity ledger smoke passed');
