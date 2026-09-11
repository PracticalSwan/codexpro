import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { loadConfig } from '../dist/config.js';
import { WorkspaceManager } from '../dist/guard.js';
import { ContinuationStore } from '../dist/continuation/store.js';
import {
  armContinuation, checkpointContinuation, requestContinuation, observeContinuationManualTurn,
  reconcileContinuationManualTurn, completeContinuation, cancelContinuation, heartbeatContinuation, continuationStatus
} from '../dist/continuation/ops.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-workspace-'));
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-state-'));
const boundedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-bounded-'));
const mcpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-mcp-root-'));
const mcpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-mcp-home-'));
const workspace = { id: 'ws_plan29', root };
const bindingA = { workspace, sessionId: 'session-a' };
const bindingB = { workspace, sessionId: 'session-b' };
const secret = 'sk-plan29-secret-abcdefghijklmnopqrstuvwxyz';

try {
  const store = new ContinuationStore(stateDir, 16);
  await assert.rejects(() => armContinuation({ enabled: false, store, binding: bindingA, title: 'Disabled' }), /continuation_disabled/i);
  const armed = await armContinuation({ enabled: true, store, binding: bindingA, title: `Lifecycle ${secret}` });
  assert.match(armed.id, /^continuation_/);
  assert.equal(armed.schemaVersion, 1);
  assert.equal(armed.revision, 1);
  assert.equal(armed.state, 'armed');
  const rawArmed = await fs.readFile(path.join(stateDir, 'records', `${armed.id}.json`), 'utf8');
  assert(!rawArmed.includes(secret), 'continuation record retained a secret-looking title fragment');
  await assert.rejects(() => armContinuation({ enabled: true, store, binding: bindingA, title: 'Duplicate' }), /continuation_active_exists/i);
  const otherSession = await armContinuation({ enabled: true, store, binding: bindingB, title: 'Other session' });
  assert.notEqual(otherSession.id, armed.id, 'separate MCP session should have its own active task');
  await assert.rejects(() => store.requireForBinding(armed.id, { workspace: { id: workspace.id, root: `${root}-other` }, sessionId: 'session-a' }), /selected workspace/i);
  await assert.rejects(() => store.requireForBinding(armed.id, { workspace, sessionId: 'wrong-session' }), /selected MCP session/i);

  const raceBinding = { workspace, sessionId: 'session-race' };
  const raceA = new ContinuationStore(stateDir, 16);
  const raceB = new ContinuationStore(stateDir, 16);
  const raced = await Promise.allSettled([
    armContinuation({ enabled: true, store: raceA, binding: raceBinding, title: 'Race A' }),
    armContinuation({ enabled: true, store: raceB, binding: raceBinding, title: 'Race B' })
  ]);
  assert.equal(raced.filter((item) => item.status === 'fulfilled').length, 1, 'continuation active-task race was not serialized');
  assert.equal(raced.filter((item) => item.status === 'rejected').length, 1, 'continuation active-task race did not reject duplicate arm');
  const raceRecord = raced.find((item) => item.status === 'fulfilled').value;
  await cancelContinuation({ store: raceA, binding: raceBinding, continuationId: raceRecord.id, expectedRevision: raceRecord.revision });

  const explicitId = 'continuation_explicit-race';
  const explicitA = { workspace, sessionId: 'explicit-a' };
  const explicitB = { workspace, sessionId: 'explicit-b' };
  const explicitRace = await Promise.allSettled([
    armContinuation({ enabled: true, store: new ContinuationStore(stateDir, 16), binding: explicitA, title: 'Explicit A', continuationId: explicitId }),
    armContinuation({ enabled: true, store: new ContinuationStore(stateDir, 16), binding: explicitB, title: 'Explicit B', continuationId: explicitId })
  ]);
  assert.equal(explicitRace.filter((item) => item.status === 'fulfilled').length, 1, 'explicit continuation id race was not serialized');
  assert.equal(explicitRace.filter((item) => item.status === 'rejected').length, 1, 'duplicate explicit continuation id was not rejected');
  const explicitWinner = explicitRace.find((item) => item.status === 'fulfilled').value;
  const explicitBinding = explicitWinner.mcpSessionId === 'explicit-a' ? explicitA : explicitB;
  await cancelContinuation({ store: new ContinuationStore(stateDir, 16), binding: explicitBinding, continuationId: explicitWinner.id, expectedRevision: explicitWinner.revision });

  const restarted = new ContinuationStore(stateDir, 16);
  assert.equal((await restarted.requireForBinding(armed.id, bindingA)).revision, 1, 'record did not survive store restart');
  const cp = await checkpointContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 1,
    checkpointId: 'checkpoint-1', currentPhase: 'Implement lifecycle', completedEvidence: ['Store compiled'],
    remainingWork: ['Register MCP tools', 'Run verification']
  });
  assert.equal(cp.revision, 2);
  assert.equal(cp.state, 'working');
  assert.equal(cp.continuationIntents.length, 1);
  assert.equal(cp.continuationIntents[0].revision, 2);
  assert.equal(cp.continuationIntents[0].templateKey, 'resume_all_v1');
  const duplicateCp = await checkpointContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 1,
    checkpointId: 'checkpoint-1', currentPhase: 'ignored duplicate', completedEvidence: [], remainingWork: []
  });
  assert.equal(duplicateCp.revision, 2, 'duplicate checkpoint changed revision');
  assert.equal(duplicateCp.currentPhase, 'Implement lifecycle');

  const requested = await requestContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 2,
    requestId: 'request-1'
  });
  assert.equal(requested.revision, 3);
  assert.equal(requested.state, 'continuation_requested');
  assert.equal(requested.continuationCount, 0, 'request must not increment successful-dispatch counter');
  assert.match(requested.outstandingNonce, /^[a-f0-9]{64}$/);
  assert.equal(requested.continuationIntents[0].revision, 3);
  const firstNonce = requested.outstandingNonce;
  const duplicateRequest = await requestContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 2,
    requestId: 'request-1'
  });
  assert.equal(duplicateRequest.revision, 3);
  assert.equal(duplicateRequest.outstandingNonce, firstNonce);
  assert.equal(duplicateRequest.continuationCount, 0);
  const publicRequested = await continuationStatus(restarted, bindingA, armed.id);
  const publicText = JSON.stringify(publicRequested);
  assert(!publicText.includes(firstNonce), 'public continuation status leaked authorization nonce');
  assert(!publicText.includes(root), 'public continuation status leaked workspace root');
  assert(!publicText.includes('lastCheckpointId') && !publicText.includes('lastRequestId'), 'public continuation status leaked idempotency keys');

  const beforeHeartbeat = await restarted.require(armed.id);
  const heartbeat = await heartbeatContinuation({ enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 3 });
  assert.equal(heartbeat.revision, 4);
  assert.equal(heartbeat.state, beforeHeartbeat.state);
  assert.equal(heartbeat.currentPhase, beforeHeartbeat.currentPhase);
  assert.deepEqual(heartbeat.completedEvidence, beforeHeartbeat.completedEvidence);
  assert.deepEqual(heartbeat.remainingWork, beforeHeartbeat.remainingWork);
  assert.deepEqual(heartbeat.continuationIntents, beforeHeartbeat.continuationIntents);
  assert(heartbeat.lastHeartbeatAt, 'heartbeat did not update liveness timestamp');

  const paused = await observeContinuationManualTurn({
    store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 4, reason: 'manual_message'
  });
  assert.equal(paused.revision, 5);
  assert.equal(paused.state, 'paused_by_user');
  assert.equal(paused.manualTurnPending.reason, 'manual_message');
  assert.equal(paused.manualTurnPending.observedRevision, 4);
  assert.equal(paused.outstandingNonce, undefined);
  assert.equal(paused.selectedContinuationIntentId, undefined);
  const resumed = await reconcileContinuationManualTurn({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 5,
    disposition: 'resume'
  });
  assert.equal(resumed.revision, 6);
  assert.equal(resumed.state, 'working');
  assert.equal(resumed.manualTurnPending, undefined);
  assert.deepEqual(resumed.remainingWork, ['Register MCP tools', 'Run verification']);
  assert(resumed.continuationIntents.every((intent) => intent.revision === 6));

  const pausedAgain = await observeContinuationManualTurn({
    store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 6, reason: 'stop_generating'
  });
  const redirected = await reconcileContinuationManualTurn({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: pausedAgain.revision,
    disposition: 'redirect', replacementCurrentPhase: 'Prioritize verification', replacementRemainingWork: ['Run verification'],
    replacementIntents: [{ templateKey: 'focus_remaining_v1', label: 'Verification', focusRef: 'Run verification' }]
  });
  assert.equal(redirected.state, 'working');
  assert.equal(redirected.currentPhase, 'Prioritize verification');
  assert.deepEqual(redirected.remainingWork, ['Run verification']);
  assert.equal(redirected.continuationIntents[0].templateKey, 'focus_remaining_v1');
  assert.equal(redirected.continuationIntents[0].focusRef, 'Run verification');
  await assert.rejects(() => checkpointContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: 1,
    checkpointId: 'stale-checkpoint', completedEvidence: [], remainingWork: []
  }), /stale_continuation_revision/i);

  await assert.rejects(() => completeContinuation({
    store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: redirected.revision
  }), /continuation_incomplete/i);
  const completed = await completeContinuation({
    store: restarted, binding: bindingA, continuationId: armed.id, expectedRevision: redirected.revision, verifiedComplete: true
  });
  assert.equal(completed.state, 'completed');
  assert.equal(completed.remainingWork.length, 0);
  assert.equal(completed.continuationIntents.length, 0);
  assert.equal(completed.outstandingNonce, undefined);
  await assert.rejects(() => restarted.update(armed.id, bindingA, { expectedRevision: redirected.revision }, (record) => {
    record.state = 'working'; return record;
  }), /stale_continuation_revision|terminal/i);
  assert.equal((await restarted.require(armed.id)).state, 'completed', 'stale writer revived completed task');

  const pausedB = await observeContinuationManualTurn({
    store: restarted, binding: bindingB, continuationId: otherSession.id, expectedRevision: 1, reason: 'manual_message'
  });
  const superseded = await reconcileContinuationManualTurn({
    enabled: true, store: restarted, binding: bindingB, continuationId: otherSession.id, expectedRevision: pausedB.revision,
    disposition: 'supersede'
  });
  assert.equal(superseded.state, 'canceled');
  assert.equal(superseded.cancelReason, 'superseded_by_user');
  assert.equal(superseded.manualTurnPending, undefined);

  const fresh = await armContinuation({ enabled: true, store: restarted, binding: bindingA, title: 'Fresh task' });
  await assert.rejects(() => checkpointContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: fresh.id, expectedRevision: 1,
    checkpointId: 'bad-focus', completedEvidence: [], remainingWork: ['Only item'],
    intents: [{ templateKey: 'focus_remaining_v1', label: 'Wrong focus', focusRef: 'Not recorded' }]
  }), /focus reference/i);
  await assert.rejects(() => checkpointContinuation({
    enabled: true, store: restarted, binding: bindingA, continuationId: fresh.id, expectedRevision: 1,
    checkpointId: 'too-many', completedEvidence: [], remainingWork: Array.from({ length: 65 }, (_, i) => `item-${i}`)
  }), /64 entries/i);
  const canceledFresh = await cancelContinuation({ store: restarted, binding: bindingA, continuationId: fresh.id, expectedRevision: 1 });
  assert.equal(canceledFresh.state, 'canceled');
  assert.equal((await cancelContinuation({ store: restarted, binding: bindingA, continuationId: fresh.id, expectedRevision: 1 })).revision, canceledFresh.revision, 'duplicate cancel rewrote terminal record');

  const exactRoot = path.join(root, 'token=keep-this-path');
  await fs.mkdir(exactRoot, { recursive: true });
  const exactBinding = { workspace: { id: 'ws_exact_path', root: exactRoot }, sessionId: 'exact-path' };
  const exactRecord = await armContinuation({ enabled: true, store: restarted, binding: exactBinding, title: 'Exact path binding' });
  assert.equal(exactRecord.workspaceRoot, path.resolve(exactRoot), 'workspace binding path was altered by redaction');
  assert.equal((await restarted.requireForBinding(exactRecord.id, exactBinding)).workspaceRoot, path.resolve(exactRoot));
  await cancelContinuation({ store: restarted, binding: exactBinding, continuationId: exactRecord.id, expectedRevision: exactRecord.revision });

  const boundedStore = new ContinuationStore(boundedDir, 2);
  const c1 = await armContinuation({ enabled: true, store: boundedStore, binding: { workspace, sessionId: 'bounded-1' }, title: 'One' });
  await armContinuation({ enabled: true, store: boundedStore, binding: { workspace, sessionId: 'bounded-2' }, title: 'Two' });
  await assert.rejects(() => armContinuation({ enabled: true, store: boundedStore, binding: { workspace, sessionId: 'bounded-3' }, title: 'Three' }), /full of active/i);
  await cancelContinuation({ store: boundedStore, binding: { workspace, sessionId: 'bounded-1' }, continuationId: c1.id, expectedRevision: 1 });
  const c3 = await armContinuation({ enabled: true, store: boundedStore, binding: { workspace, sessionId: 'bounded-3' }, title: 'Three' });
  assert.equal(c3.state, 'armed', 'terminal pruning did not free bounded store capacity');

  const c3File = path.join(boundedDir, 'records', `${c3.id}.json`);
  const malformed = JSON.parse(await fs.readFile(c3File, 'utf8'));
  malformed.prompt = 'raw prompt must not be accepted';
  await fs.writeFile(c3File, JSON.stringify(malformed));
  await assert.rejects(() => boundedStore.require(c3.id), /unsupported continuation record field/i);

  const mcpOperationDir = path.join(mcpHome, 'operations');
  const mcpConfig = { ...loadConfig(['--root', mcpRoot, '--allow-root', mcpRoot, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full']), operationDir: mcpOperationDir };
  const mcpWorkspace = new WorkspaceManager(mcpConfig).defaultWorkspace();
  const mcpStore = new ContinuationStore(path.join(mcpHome, 'continuation'), 16);
  const mcpBinding = { workspace: mcpWorkspace, sessionId: 'mcp-session' };
  const mcpArmed = await armContinuation({ enabled: true, store: mcpStore, binding: mcpBinding, title: 'MCP lifecycle' });
  const mcpWorking = await checkpointContinuation({
    enabled: true, store: mcpStore, binding: mcpBinding, continuationId: mcpArmed.id, expectedRevision: 1,
    checkpointId: 'mcp-checkpoint', currentPhase: 'Ready for MCP', completedEvidence: ['Direct setup'], remainingWork: []
  });
  const makeTransport = (enabled) => new StdioClientTransport({
    command: process.execPath,
    args: ['dist/stdio.js', '--root', mcpRoot, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full'],
    env: {
      ...process.env,
      CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1',
      CODEXPRO_OPERATION_DIR: mcpOperationDir,
      CODEXPRO_CONTINUATION_ENABLED: enabled ? '1' : '0'
    }
  });
  const client = new Client({ name: 'continuation-state-smoke', version: '0.1.0' });
  await client.connect(makeTransport(true));
  const listed = await client.listTools();
  const requiredTools = ['continuation_arm','continuation_checkpoint','continuation_request','continuation_status','continuation_reconcile','continuation_complete','continuation_cancel'];
  for (const name of requiredTools) assert(listed.tools.some((tool) => tool.name === name), `continuation MCP contract did not expose ${name}`);
  const continuationTools = listed.tools.filter((tool) => requiredTools.includes(tool.name));
  const schemaKeys = new Set();
  const collectSchemaKeys = (value) => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { schemaKeys.add(key); collectSchemaKeys(child); } };
  for (const tool of continuationTools) collectSchemaKeys(tool.inputSchema);
  for (const forbidden of ['raw_prompt','prompt_text','transcript','cookie','browser_secret','conversation_url']) assert(!schemaKeys.has(forbidden), `continuation MCP schema exposed forbidden field ${forbidden}`);
  const mcpCancel = await armContinuation({ enabled: true, store: mcpStore, binding: { workspace: mcpWorkspace, sessionId: 'mcp-cancel' }, title: 'MCP cancel' });
  const canceledViaMcp = await client.callTool({ name: 'continuation_cancel', arguments: { continuation_id: mcpCancel.id, expected_revision: mcpCancel.revision, session_id: 'mcp-cancel' } });
  assert.equal(canceledViaMcp.isError, undefined);
  assert.equal(canceledViaMcp.structuredContent.task.state, 'canceled', 'MCP cancellation did not terminally cancel continuation state');
  const status1 = await client.callTool({ name: 'continuation_status', arguments: { continuation_id: mcpWorking.id, session_id: 'mcp-session' } });
  assert.equal(status1.isError, undefined);
  assert.equal(status1.structuredContent.task.state, 'working');
  const publicMcpText = JSON.stringify(status1.structuredContent);
  assert(!publicMcpText.includes(mcpRoot), 'MCP continuation status leaked workspace root');
  assert(!publicMcpText.includes('outstandingNonce'), 'MCP continuation status leaked nonce field');
  assert(!publicMcpText.includes('mcp_session_id'), 'MCP continuation status leaked internal session binding');
  const invalidSession = await client.callTool({ name: 'continuation_status', arguments: { continuation_id: mcpWorking.id, session_id: 'bad\nsession' } });
  assert.equal(invalidSession.isError, true, 'invalid continuation session id bypassed MCP schema');
  assert.match(JSON.stringify(invalidSession), /invalid|validation|session/i);
  const disabledClient = new Client({ name: 'continuation-state-smoke-disabled', version: '0.1.0' });
  await disabledClient.connect(makeTransport(false));
  const disabledListed = await disabledClient.listTools();
  for (const name of requiredTools) {
    assert(!disabledListed.tools.some((tool) => tool.name === name), `disabled continuation unexpectedly exposed ${name}`);
  }
  await disabledClient.close();
  const reconcileTool = listed.tools.find((tool) => tool.name === 'continuation_reconcile');
  const reconcileSchemaText = JSON.stringify(reconcileTool?.inputSchema ?? {});
  for (const disposition of ['resume','redirect','supersede','cancel']) assert(reconcileSchemaText.includes(disposition), `continuation_reconcile schema omitted ${disposition}`);
  await client.close();

  const client2 = new Client({ name: 'continuation-state-smoke-restart', version: '0.1.0' });
  await client2.connect(makeTransport(true));
  const status2 = await client2.callTool({ name: 'continuation_status', arguments: { continuation_id: mcpWorking.id, session_id: 'mcp-session' } });
  assert.equal(status2.structuredContent.task.revision, mcpWorking.revision, 'MCP continuation state did not survive server/client turnover');
  const completedMcp = await client2.callTool({ name: 'continuation_complete', arguments: { continuation_id: mcpWorking.id, expected_revision: mcpWorking.revision, verified_complete: true, session_id: 'mcp-session' } });
  assert.equal(completedMcp.isError, undefined);
  assert.equal(completedMcp.structuredContent.task.state, 'completed');
  await client2.close();

  console.log('continuation state smoke passed');
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(boundedDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(mcpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(mcpHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
