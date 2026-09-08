import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ContinuationStore } from '../dist/continuation/store.js';
import {
  armContinuation, checkpointContinuation, requestContinuation,
  bindContinuationConversation, authorizeContinuationDispatch,
  completeContinuationDispatch, cancelContinuation
} from '../dist/continuation/ops.js';
import {
  DEFAULT_CONTINUATION_COOLDOWN_MS,
  DEFAULT_MAX_CONTINUATION_DISPATCHES,
  acknowledgeContinuationDispatch,
  evaluateContinuationReadiness,
  recordContinuationHeartbeat,
  recordContinuationUserInteraction
} from '../dist/continuation/watchdog.js';

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

try {
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
  await cancelContinuation({ store, binding, continuationId: heartbeatAck.id, expectedRevision: heartbeatAck.revision });

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

  console.log('continuation watchdog smoke passed');
} finally {
  await fs.rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
