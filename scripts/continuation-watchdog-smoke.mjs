import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ContinuationStore } from '../dist/continuation/store.js';
import {
  armContinuation, checkpointContinuation, requestContinuation,
  bindContinuationConversation, authorizeContinuationDispatch,
  completeContinuationDispatch, cancelContinuation, reassociateContinuationSession
} from '../dist/continuation/ops.js';
import {
  DEFAULT_CONTINUATION_COOLDOWN_MS,
  DEFAULT_MAX_CONTINUATION_DISPATCHES,
  acknowledgeContinuationDispatch,
  evaluateContinuationReadiness,
  recordContinuationHeartbeat,
  recordContinuationUserInteraction
} from '../dist/continuation/watchdog.js';
import { classifyDurableContinuationWork } from '../dist/continuation/runtimeIntegration.js';

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cont-watchdog-'));
const root = path.join(base, 'workspace'); await fs.mkdir(root);
const store = new ContinuationStore(path.join(base, 'state'));
const binding = { workspace: { id: 'ws_watchdog', root }, sessionId: 'sess_watchdog' };
const fp = createHash('sha256').update('watchdog:c:bound-chat').digest('hex');
let now = Date.parse('2026-09-09T00:00:00+07:00');
const iso = (value = now) => new Date(value).toISOString();
const safePage = { authState: 'signed_in', conversationBound: true, composerReady: true, streaming: false, platformState: 'idle', blockingInteraction: false, recentUserInput: false };
function runtime(deadlineMs = 1_200_000, mode = 'bounded', generation = 'runtime-a', transportState = 'ready') {
  return { runtimeGenerationId: generation, syncCallDeadlineMode: mode, syncCallDeadlineMs: deadlineMs, transportState, observedAt: iso() };
}
function browser(generation = 'browser-a', extra = {}) {
  return { observationGenerationId: generation, connected: true, longObservationGap: false, ...safePage, ...extra };
}
async function workingTask(title) {
  let record = await armContinuation({ enabled: true, store, binding, title });
  record = await checkpointContinuation({ enabled: true, store, binding, continuationId: record.id, expectedRevision: record.revision,
    checkpointId: `cp_${record.id}`, completedEvidence: ['setup verified'], remainingWork: ['finish remaining work'] });
  record = await bindContinuationConversation({ enabled: true, store, binding, continuationId: record.id,
    expectedRevision: record.revision, conversationFingerprint: fp });
  return record;
}
async function requestedTask(title) {
  let record = await workingTask(title);
  record = await requestContinuation({ enabled: true, store, binding, continuationId: record.id,
    expectedRevision: record.revision, requestId: `req_${record.id}` });
  return record;
}
async function evaluate(record, overrides = {}) {
  return evaluateContinuationReadiness({ enabled: true, store, binding, continuationId: record.id,
    expectedRevision: record.revision, runtime: runtime(), browser: browser(), durableWork: [],
    unexpectedInterruptionGraceMs: 30_000, now, ...overrides });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no free port')));
    });
    server.on('error', reject);
  });
}
async function waitForHttp(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`HTTP continuation test server did not start\n${stderr}`)), 15_000);
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      if (stderr.includes('HTTP MCP listening')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`HTTP continuation test server exited early: ${code}\n${stderr}`)); });
  });
}
function httpClient(url, token, name) {
  const client = new Client({ name, version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  return { client, transport };
}
async function tool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find?.((part) => part.type === 'text')?.text ?? JSON.stringify(result.structuredContent));
  return result.structuredContent;
}

try {
  const reassociateOld = { workspace: binding.workspace, sessionId: 'sess-reassociate-old' };
  const reassociateNew = { workspace: binding.workspace, sessionId: 'sess-reassociate-new' };
  let reassociated = await armContinuation({ enabled: true, store, binding: reassociateOld, title: 'Session reassociation' });
  reassociated = await checkpointContinuation({ enabled: true, store, binding: reassociateOld, continuationId: reassociated.id,
    expectedRevision: reassociated.revision, checkpointId: 'cp-reassociate', completedEvidence: ['old session work'], remainingWork: ['resume after reconnect'] });
  await assert.rejects(() => reassociateContinuationSession({ enabled: true, store, workspace: binding.workspace,
    continuationId: reassociated.id, newSessionId: reassociateNew.sessionId, previousSessionActive: true }), /previous.*session.*active/i);
  const moved = await reassociateContinuationSession({ enabled: true, store, workspace: binding.workspace,
    continuationId: reassociated.id, newSessionId: reassociateNew.sessionId, previousSessionActive: false });
  assert.equal(moved.revision, reassociated.revision + 1, 'session reassociation did not create one semantic revision');
  assert.equal(moved.mcpSessionId, reassociateNew.sessionId);
  await assert.rejects(() => store.requireForBinding(moved.id, reassociateOld), /selected MCP session/i);
  assert.equal((await store.requireForBinding(moved.id, reassociateNew)).id, moved.id);
  await assert.rejects(() => reassociateContinuationSession({ enabled: true, store, workspace: { id: 'wrong-workspace', root },
    continuationId: moved.id, newSessionId: 'sess-wrong', previousSessionActive: false }), /selected workspace/i);
  await cancelContinuation({ store, binding: reassociateNew, continuationId: moved.id, expectedRevision: moved.revision });

  let explicit = await requestedTask('Explicit readiness');
  assert.equal(explicit.continuationCount, 0, 'request incremented successful-dispatch counter');
  explicit = await evaluate(explicit);
  assert.equal(explicit.state, 'continuation_ready');
  assert.match(explicit.watchdog?.notificationKey || '', /^[a-f0-9]{64}$/);
  const firstNotification = explicit.watchdog.notificationKey;
  const duplicateReady = await evaluate(explicit);
  assert.equal(duplicateReady.revision, explicit.revision, 'duplicate readiness evaluation changed revision');
  assert.equal(duplicateReady.watchdog.notificationKey, firstNotification, 'duplicate evaluation changed notification key');

  const grant = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: explicit.id,
    expectedRevision: explicit.revision, conversationFingerprint: fp, source: 'browser', now });
  const dispatched = await completeContinuationDispatch({ store, binding, continuationId: explicit.id,
    expectedRevision: grant.record.revision, conversationFingerprint: fp, token: grant.token, now });
  assert.equal(dispatched.state, 'awaiting_ack');
  assert.equal(dispatched.continuationCount, 1);
  assert.equal(dispatched.outstandingNonce, undefined);
  assert.match(dispatched.watchdog?.pendingAckNonceHash || '', /^[a-f0-9]{64}$/);
  assert.equal(dispatched.watchdog.pendingAckDispatchRevision, dispatched.revision);
  assert.equal(dispatched.watchdog.notificationKey, undefined);
  await assert.rejects(() => requestContinuation({ enabled: true, store, binding, continuationId: dispatched.id,
    expectedRevision: dispatched.revision, requestId: 'request-before-ack' }), /awaiting_ack|cannot be requested/i);
  await assert.rejects(() => acknowledgeContinuationDispatch({ enabled: true, store, binding, continuationId: dispatched.id,
    expectedRevision: dispatched.revision, dispatchRevision: dispatched.revision - 1, now }), /stale_dispatch_ack/i);

  let acknowledged = await acknowledgeContinuationDispatch({ enabled: true, store, binding, continuationId: dispatched.id,
    expectedRevision: dispatched.revision, dispatchRevision: dispatched.revision, now });
  assert.equal(acknowledged.state, 'working');
  assert.equal(acknowledged.watchdog?.lastAcknowledgedDispatchRevision, dispatched.revision);
  const duplicateAck = await acknowledgeContinuationDispatch({ enabled: true, store, binding, continuationId: acknowledged.id,
    expectedRevision: acknowledged.revision, dispatchRevision: dispatched.revision, now });
  assert.equal(duplicateAck.revision, acknowledged.revision, 'duplicate acknowledgement changed revision');

  acknowledged = await requestContinuation({ enabled: true, store, binding, continuationId: acknowledged.id,
    expectedRevision: acknowledged.revision, requestId: 'request-cooldown' });
  const cooldownBlocked = await evaluate(acknowledged);
  assert.equal(cooldownBlocked.state, 'continuation_requested');
  now += DEFAULT_CONTINUATION_COOLDOWN_MS + 1;
  let afterCooldown = await evaluate(cooldownBlocked);
  assert.equal(afterCooldown.state, 'continuation_ready');
  const grant2 = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: afterCooldown.id,
    expectedRevision: afterCooldown.revision, conversationFingerprint: fp, source: 'browser', now });
  let awaitingAck = await completeContinuationDispatch({ store, binding, continuationId: afterCooldown.id,
    expectedRevision: grant2.record.revision, conversationFingerprint: fp, token: grant2.token, now });
  const heartbeatAck = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: awaitingAck.id,
    expectedRevision: awaitingAck.revision, now: now + 1 });
  assert.equal(heartbeatAck.state, 'working');
  assert.equal(heartbeatAck.watchdog?.lastAcknowledgedDispatchRevision, awaitingAck.revision);
  const semanticRevision = heartbeatAck.revision;
  const ordinaryHeartbeat = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: heartbeatAck.id,
    expectedRevision: semanticRevision, now: now + 2 });
  assert.equal(ordinaryHeartbeat.revision, semanticRevision, 'ordinary activity heartbeat changed semantic task revision');
  assert.equal(ordinaryHeartbeat.state, heartbeatAck.state, 'ordinary activity heartbeat changed task state');
  assert.equal(ordinaryHeartbeat.currentPhase, heartbeatAck.currentPhase, 'ordinary activity heartbeat changed current phase');
  assert.deepEqual(ordinaryHeartbeat.remainingWork, heartbeatAck.remainingWork, 'ordinary activity heartbeat changed remaining work');
  assert.equal(Date.parse(ordinaryHeartbeat.lastHeartbeatAt), now + 2, 'ordinary activity heartbeat did not refresh receive time');
  await cancelContinuation({ store, binding, continuationId: ordinaryHeartbeat.id, expectedRevision: ordinaryHeartbeat.revision });

  for (const deadlineMs of [300_000, 720_000, 1_200_000, 3_600_000]) {
    let inferred = await workingTask(`Inferred ${deadlineMs}`);
    inferred = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: inferred.id,
      expectedRevision: inferred.revision, now });
    inferred = await evaluate(inferred, { runtime: runtime(deadlineMs) });
    assert.equal(inferred.state, 'working', 'first runtime observation inferred immediately');
    now += deadlineMs + 30_001;
    inferred = await evaluate(inferred, { runtime: runtime(deadlineMs) });
    assert.equal(inferred.state, 'continuation_ready', `bounded ${deadlineMs}ms did not infer readiness`);
    await cancelContinuation({ store, binding, continuationId: inferred.id, expectedRevision: inferred.revision });
    now += 1_000;
  }

  let noRemaining = await armContinuation({ enabled: true, store, binding, title: 'No remaining work' });
  noRemaining = await bindContinuationConversation({ enabled: true, store, binding, continuationId: noRemaining.id,
    expectedRevision: noRemaining.revision, conversationFingerprint: fp });
  noRemaining = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: noRemaining.id,
    expectedRevision: noRemaining.revision, now });
  noRemaining = await evaluate(noRemaining);
  now += 1_230_001;
  const noWorkReady = await evaluate(noRemaining);
  assert.notEqual(noWorkReady.state, 'continuation_ready', 'task with no recorded remaining work became continuation-ready');
  assert.equal(noWorkReady.outstandingNonce, undefined);
  await cancelContinuation({ store, binding, continuationId: noWorkReady.id, expectedRevision: noWorkReady.revision });

  let observeOnly = await workingTask('Observe disables inference');
  observeOnly = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: observeOnly.id,
    expectedRevision: observeOnly.revision, now });
  observeOnly = await evaluate(observeOnly, { runtime: runtime(1_200_000, 'observe') });
  now += 3_600_001;
  const stillWorking = await evaluate(observeOnly, { runtime: runtime(1_200_000, 'observe') });
  assert.equal(stillWorking.state, 'working');
  let explicitObserve = await requestContinuation({ enabled: true, store, binding, continuationId: stillWorking.id,
    expectedRevision: stillWorking.revision, requestId: 'observe-explicit' });
  explicitObserve = await evaluate(explicitObserve, { runtime: runtime(1_200_000, 'observe') });
  assert.equal(explicitObserve.state, 'continuation_ready', 'observe mode blocked explicit semantic request');
  await cancelContinuation({ store, binding, continuationId: explicitObserve.id, expectedRevision: explicitObserve.revision });

  let checkpointReset = await requestedTask('Checkpoint clears pending request');
  checkpointReset = await evaluate(checkpointReset, { browser: browser('browser-checkpoint', { streaming: true, platformState: 'busy' }) });
  assert.equal(checkpointReset.state, 'continuation_requested');
  assert.equal(checkpointReset.watchdog?.pendingExplicitRequest, true);
  checkpointReset = await checkpointContinuation({ enabled: true, store, binding, continuationId: checkpointReset.id,
    expectedRevision: checkpointReset.revision, checkpointId: 'checkpoint-after-request',
    completedEvidence: ['new model progress'], remainingWork: ['continue after new progress'] });
  assert.equal(checkpointReset.state, 'working');
  assert.equal(checkpointReset.outstandingNonce, undefined);
  assert.equal(checkpointReset.watchdog?.pendingExplicitRequest, undefined, 'checkpoint retained stale explicit request');
  await cancelContinuation({ store, binding, continuationId: checkpointReset.id, expectedRevision: checkpointReset.revision });

  for (const [label, deadlineMs] of [['5m', 300_000], ['12m', 720_000], ['20m', 1_200_000], ['60m', 3_600_000]]) {
    let deadlineTask = await workingTask(`Current runtime deadline ${label}`);
    deadlineTask = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: deadlineTask.id,
      expectedRevision: deadlineTask.revision, now });
    deadlineTask = await evaluate(deadlineTask, { runtime: runtime(deadlineMs, 'bounded', `runtime-${label}`) });
    now += deadlineMs + 29_999;
    deadlineTask = await evaluate(deadlineTask, { runtime: runtime(deadlineMs, 'bounded', `runtime-${label}`) });
    assert.equal(deadlineTask.state, 'working', `${label} runtime deadline inferred continuation too early`);
    now += 2;
    deadlineTask = await evaluate(deadlineTask, { runtime: runtime(deadlineMs, 'bounded', `runtime-${label}`) });
    assert.equal(deadlineTask.state, 'continuation_ready', `${label} current runtime deadline was not used`);
    await cancelContinuation({ store, binding, continuationId: deadlineTask.id, expectedRevision: deadlineTask.revision });
  }

  const durableMatrix = classifyDurableContinuationWork({
    processes: [{ state: 'running' }, { state: 'exited' }],
    jobs: [{ state: 'running' }, { state: 'completed' }, { state: 'failed' }],
    goals: [{ state: 'running' }, { state: 'awaiting_review' }, { state: 'projected' }],
    batches: [{ state: 'active' }, { state: 'completed' }]
  });
  const classified = (kind, active, modelAttentionRequired) => durableMatrix.some((item) => item.kind === kind && item.active === active && item.modelAttentionRequired === modelAttentionRequired);
  assert(classified('process', true, false)); assert(classified('process', false, true));
  assert(classified('job', true, false)); assert(classified('job', false, true));
  assert(classified('goal', true, false)); assert(classified('goal', true, true));
  assert(classified('batch', true, true)); assert(classified('batch', false, true));

  let durable = await workingTask('Durable work suppression');
  durable = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: durable.id,
    expectedRevision: durable.revision, now });
  durable = await evaluate(durable);
  now += 1_230_001;
  const durableBlocked = await evaluate(durable, { durableWork: [{ kind: 'job', active: true, modelAttentionRequired: false }] });
  assert.equal(durableBlocked.state, 'working');
  const attentionReady = await evaluate(durableBlocked, { durableWork: [{ kind: 'job', active: true, modelAttentionRequired: true }] });
  assert.equal(attentionReady.state, 'continuation_ready');
  await cancelContinuation({ store, binding, continuationId: attentionReady.id, expectedRevision: attentionReady.revision });

  let transport = await requestedTask('Transport recovery');
  transport = await evaluate(transport, { runtime: runtime(1_200_000, 'bounded', 'runtime-t', 'unavailable') });
  assert.equal(transport.state, 'waiting_for_transport');
  assert.equal(transport.outstandingNonce, undefined);
  assert.equal(transport.watchdog?.pendingExplicitRequest, true);
  transport = await evaluate(transport, { runtime: runtime(1_200_000, 'bounded', 'runtime-t', 'ready') });
  assert.equal(transport.state, 'continuation_ready', 'explicit request did not recover after transport readiness');
  await cancelContinuation({ store, binding, continuationId: transport.id, expectedRevision: transport.revision });

  let auth = await requestedTask('Auth recovery');
  auth = await evaluate(auth, { browser: browser('browser-auth', { authState: 'signed_out' }) });
  assert.equal(auth.state, 'waiting_for_auth');
  assert.equal(auth.outstandingNonce, undefined);
  assert.equal(auth.watchdog?.pendingExplicitRequest, true);
  auth = await evaluate(auth, { browser: browser('browser-auth', { authState: 'signed_in' }) });
  assert.equal(auth.state, 'continuation_ready');
  await cancelContinuation({ store, binding, continuationId: auth.id, expectedRevision: auth.revision });

  let generation = await workingTask('Generation reset');
  generation = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: generation.id,
    expectedRevision: generation.revision, now });
  generation = await evaluate(generation, { runtime: runtime(300_000, 'bounded', 'runtime-old') });
  now += 330_001;
  generation = await evaluate(generation, { runtime: runtime(300_000, 'bounded', 'runtime-new') });
  assert.equal(generation.state, 'working', 'runtime generation change reused stale inference timer');
  assert.equal(generation.watchdog?.interruptionBaselineAt, iso());
  now += 330_001;
  generation = await evaluate(generation, { runtime: runtime(300_000, 'bounded', 'runtime-new') });
  assert.equal(generation.state, 'continuation_ready');
  await cancelContinuation({ store, binding, continuationId: generation.id, expectedRevision: generation.revision });

  let browserReset = await workingTask('Browser reset');
  browserReset = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: browserReset.id,
    expectedRevision: browserReset.revision, now });
  browserReset = await evaluate(browserReset, { runtime: runtime(300_000), browser: browser('browser-old') });
  now += 330_001;
  browserReset = await evaluate(browserReset, { runtime: runtime(300_000), browser: browser('browser-new', { longObservationGap: true }) });
  assert.equal(browserReset.state, 'working', 'browser reconnect gap reused stale inference timer');
  await cancelContinuation({ store, binding, continuationId: browserReset.id, expectedRevision: browserReset.revision });

  let manual = await requestedTask('Manual user wins');
  manual = await evaluate(manual);
  assert.equal(manual.state, 'continuation_ready');
  manual = await recordContinuationUserInteraction({ enabled: true, store, binding, continuationId: manual.id,
    expectedRevision: manual.revision, reason: 'manual_message', now });
  assert.equal(manual.state, 'paused_by_user');
  assert.equal(manual.outstandingNonce, undefined);
  assert.equal(manual.watchdog?.notificationKey, undefined);
  const manualHeartbeat = await recordContinuationHeartbeat({ enabled: true, store, binding, continuationId: manual.id,
    expectedRevision: manual.revision, now: now + 1 });
  assert.equal(manualHeartbeat.state, 'paused_by_user', 'heartbeat cleared manual user pause');
  await cancelContinuation({ store, binding, continuationId: manualHeartbeat.id, expectedRevision: manualHeartbeat.revision });

  let maxed = await workingTask('Maximum dispatches');
  maxed = await store.update(maxed.id, binding, { expectedRevision: maxed.revision }, (draft) => {
    draft.continuationCount = DEFAULT_MAX_CONTINUATION_DISPATCHES;
    return draft;
  });
  maxed = await evaluate(maxed);
  assert.equal(maxed.state, 'manual_rearm_required');
  assert.equal(maxed.outstandingNonce, undefined);
  await cancelContinuation({ store, binding, continuationId: maxed.id, expectedRevision: maxed.revision });

  let disconnected = await requestedTask('Browser disconnect');
  const disconnectedResult = await evaluate(disconnected, { browser: browser('browser-disconnected', { connected: false }) });
  assert.notEqual(disconnectedResult.state, 'continuation_ready');
  assert.equal(disconnectedResult.watchdog?.notificationKey, undefined);
  await cancelContinuation({ store, binding, continuationId: disconnectedResult.id, expectedRevision: disconnectedResult.revision });

  const httpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cont-http-root-'));
  const httpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cont-http-home-'));
  const httpPort = await freePort();
  const httpToken = 'codexpro-continuation-http-token-1234567890';
  const httpChild = spawn(process.execPath, ['dist/http.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env, CODEXPRO_ROOT: httpRoot, CODEXPRO_ALLOWED_ROOTS: httpRoot,
      CODEXPRO_HOST: '127.0.0.1', CODEXPRO_PORT: String(httpPort), CODEXPRO_HTTP_TOKEN: httpToken,
      CODEXPRO_HOME: httpHome, CODEXPRO_OPERATION_DIR: path.join(httpHome, 'operations'),
      CODEXPRO_BASH_MODE: 'off', CODEXPRO_WRITE_MODE: 'workspace', CODEXPRO_TOOL_MODE: 'full',
      CODEXPRO_CONTINUATION_ENABLED: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForHttp(httpChild);
    const url = `http://127.0.0.1:${httpPort}/mcp`;
    const a = httpClient(url, httpToken, 'continuation-http-a');
    const b = httpClient(url, httpToken, 'continuation-http-b');
    await a.client.connect(a.transport); await b.client.connect(b.transport);
    try {
      const armed = await tool(a.client, 'continuation_arm', { title: 'HTTP transport binding' });
      const taskId = armed.task.id;
      const working = await tool(a.client, 'continuation_checkpoint', {
        continuation_id: taskId, expected_revision: armed.task.revision, checkpoint_id: 'http-transport-cp',
        completed_evidence: ['armed on transport A'], remaining_work: ['resume on a later transport']
      });
      const httpStore = new ContinuationStore(path.join(httpHome, 'continuation'));
      let raw = await httpStore.require(taskId);
      assert(raw.mcpSessionId, 'HTTP continuation task was not bound to the authoritative transport session');
      const sessionA = raw.mcpSessionId;
      const semanticRevision = working.task.revision;
      const beforeHeartbeat = raw.lastHeartbeatAt;
      await tool(b.client, 'server_config');
      raw = await httpStore.require(taskId);
      assert.equal(raw.lastHeartbeatAt, beforeHeartbeat, 'unrelated HTTP transport refreshed another continuation heartbeat');
      await tool(a.client, 'server_config');
      raw = await httpStore.require(taskId);
      assert.equal(raw.revision, semanticRevision, 'automatic heartbeat changed semantic task revision');
      assert(raw.lastHeartbeatAt && raw.lastHeartbeatAt !== beforeHeartbeat, 'associated HTTP transport did not refresh continuation heartbeat');
      const activeOldSession = await b.client.callTool({ name: 'continuation_status', arguments: { continuation_id: taskId } });
      assert.equal(activeOldSession.isError, true, 'second live transport stole an active continuation session');
      assert.match(JSON.stringify(activeOldSession), /previous.*session.*active|MCP session/i);
      await a.transport.terminateSession();
      await a.client.close();
      let recovered;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        recovered = await b.client.callTool({ name: 'continuation_status', arguments: { continuation_id: taskId } });
        if (!recovered.isError) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(recovered?.isError, undefined, `inactive transport could not recover continuation: ${JSON.stringify(recovered)}`);
      const movedRecord = await httpStore.require(taskId);
      assert.notEqual(movedRecord.mcpSessionId, sessionA, 'recovered continuation retained the inactive transport session');
      assert.equal(movedRecord.revision, semanticRevision + 1, 'transport reassociation did not advance semantic revision exactly once');
    } finally {
      await a.client.close().catch(() => undefined); await b.client.close().catch(() => undefined);
    }
  } finally {
    httpChild.kill('SIGTERM');
    await new Promise((resolve) => httpChild.once('exit', resolve));
    await fs.rm(httpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    await fs.rm(httpHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  console.log('continuation watchdog smoke passed');
} finally {
  await fs.rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
