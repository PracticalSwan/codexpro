import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ContinuationStore } from '../dist/continuation/store.js';
import {
  armContinuation, checkpointContinuation, requestContinuation, bindContinuationConversation,
  authorizeContinuationDispatch, completeContinuationDispatch, releaseContinuationDispatch,
  observeContinuationManualTurn, cancelContinuation, FIXED_CONTINUATION_MESSAGE
} from '../dist/continuation/ops.js';
import { publicContinuationRecord } from '../dist/continuation/types.js';

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-cont-dispatch-'));
const root = path.join(base, 'workspace'); await fs.mkdir(root);
const store = new ContinuationStore(path.join(base, 'state'));
const binding = { workspace: { id: 'ws_dispatch', root }, sessionId: 'sess_dispatch' };
const fp = createHash('sha256').update('salt:c:conversation-a').digest('hex');
const fpOther = createHash('sha256').update('salt:c:conversation-b').digest('hex');

async function readyTask(title = 'Dispatch test') {
  let record = await armContinuation({ enabled: true, store, binding, title });
  record = await bindContinuationConversation({ enabled: true, store, binding, continuationId: record.id, expectedRevision: record.revision, conversationFingerprint: fp });
  record = await checkpointContinuation({ enabled: true, store, binding, continuationId: record.id, expectedRevision: record.revision, checkpointId: `cp_${record.id}`, completedEvidence: ['setup verified'], remainingWork: ['finish remaining work'] });
  record = await requestContinuation({ enabled: true, store, binding, continuationId: record.id, expectedRevision: record.revision, requestId: `req_${record.id}` });
  return store.update(record.id, binding, { expectedRevision: record.revision }, (draft) => { draft.state = 'continuation_ready'; return draft; });
}
try {
  let bindingProbe = await armContinuation({ enabled: true, store, binding, title: 'Stale bind test' });
  bindingProbe = await bindContinuationConversation({ enabled: true, store, binding, continuationId: bindingProbe.id, expectedRevision: bindingProbe.revision, conversationFingerprint: fp });
  await assert.rejects(() => bindContinuationConversation({ enabled: true, store, binding, continuationId: bindingProbe.id, expectedRevision: bindingProbe.revision - 1, conversationFingerprint: fp }), /stale_continuation_revision/);
  await cancelContinuation({ store, binding, continuationId: bindingProbe.id, expectedRevision: bindingProbe.revision });

  let requestThenBind = await armContinuation({ enabled: true, store, binding, title: 'Request then bind' });
  requestThenBind = await checkpointContinuation({ enabled: true, store, binding, continuationId: requestThenBind.id, expectedRevision: requestThenBind.revision, checkpointId: 'cp_request_then_bind', completedEvidence: ['setup verified'], remainingWork: ['finish remaining work'] });
  requestThenBind = await requestContinuation({ enabled: true, store, binding, continuationId: requestThenBind.id, expectedRevision: requestThenBind.revision, requestId: 'req_request_then_bind' });
  const preparedNonce = requestThenBind.outstandingNonce;
  const preparedIntent = requestThenBind.selectedContinuationIntentId;
  requestThenBind = await bindContinuationConversation({ enabled: true, store, binding, continuationId: requestThenBind.id, expectedRevision: requestThenBind.revision, conversationFingerprint: fp });
  assert.equal(requestThenBind.outstandingNonce, preparedNonce, 'conversation binding cleared the prepared continuation nonce');
  assert.equal(requestThenBind.selectedContinuationIntentId, preparedIntent, 'conversation binding cleared the selected continuation intent');
  requestThenBind = await store.update(requestThenBind.id, binding, { expectedRevision: requestThenBind.revision }, (draft) => { draft.state = 'continuation_ready'; return draft; });
  const postBindGrant = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: requestThenBind.id, expectedRevision: requestThenBind.revision, conversationFingerprint: fp, source: 'browser', now: 500 });
  assert.equal(postBindGrant.record.state, 'awaiting_user_send');
  const postBindRelease = await releaseContinuationDispatch({ store, binding, continuationId: requestThenBind.id, expectedRevision: postBindGrant.record.revision, token: postBindGrant.token });
  await cancelContinuation({ store, binding, continuationId: postBindRelease.id, expectedRevision: postBindRelease.revision });

  let rebindReady = await readyTask('Ready rebind test');
  const staleRebindNonce = rebindReady.outstandingNonce;
  rebindReady = await bindContinuationConversation({ enabled: true, store, binding, continuationId: rebindReady.id, expectedRevision: rebindReady.revision, conversationFingerprint: fpOther });
  assert.equal(rebindReady.state, 'continuation_requested', 'explicit rebind from ready state did not require fresh readiness');
  assert.equal(rebindReady.conversationFingerprint, fpOther, 'explicit rebind did not replace the conversation fingerprint');
  assert.equal(rebindReady.outstandingNonce, undefined, 'explicit rebind retained the stale continuation nonce');
  assert.equal(rebindReady.selectedContinuationIntentId, undefined, 'explicit rebind retained the stale selected intent');
  assert.equal(rebindReady.dispatchAuthorization, undefined, 'explicit rebind retained stale dispatch authorization');
  assert.notEqual(rebindReady.outstandingNonce, staleRebindNonce);
  await cancelContinuation({ store, binding, continuationId: rebindReady.id, expectedRevision: rebindReady.revision });

  let ready = await readyTask();
  await assert.rejects(() => authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision, conversationFingerprint: fpOther, source: 'browser' }), /wrong_chat/);
  await assert.rejects(() => authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision - 1, conversationFingerprint: fp, source: 'browser' }), /stale_continuation_revision/);

  const grant = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision, conversationFingerprint: fp, source: 'browser', now: 1000 });
  assert.equal(grant.message, FIXED_CONTINUATION_MESSAGE);
  assert.equal(grant.record.state, 'awaiting_user_send');
  assert.match(grant.token, /^[a-f0-9]{64}$/);
  const publicRecord = JSON.stringify(publicContinuationRecord(grant.record));
  assert(!publicRecord.includes(grant.token));
  assert(!publicRecord.includes(grant.record.dispatchAuthorization?.tokenHash || 'never'));
  assert(!publicRecord.includes(fp));
  assert(publicRecord.includes(fp.slice(-8)));
  await assert.rejects(() => completeContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: grant.record.revision, conversationFingerprint: fp, token: '0'.repeat(64), now: 2000 }), /dispatch_authorization_invalid/);

  const completed = await completeContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: grant.record.revision, conversationFingerprint: fp, token: grant.token, now: 2000 });
  assert.equal(completed.state, 'awaiting_ack');
  assert.equal(completed.continuationCount, 1);
  assert.match(completed.watchdog?.pendingAckNonceHash || '', /^[a-f0-9]{64}$/);
  assert.equal(completed.watchdog?.pendingAckDispatchRevision, completed.revision);
  assert.equal(completed.dispatchAuthorization, undefined);
  assert.equal(completed.outstandingNonce, undefined);
  await assert.rejects(() => completeContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: completed.revision, conversationFingerprint: fp, token: grant.token, now: 3000 }), /dispatch_authorization_missing/);
  await cancelContinuation({ store, binding, continuationId: completed.id, expectedRevision: completed.revision });

  ready = await readyTask('Release test');
  const releaseGrant = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision, conversationFingerprint: fp, source: 'browser', now: 5000 });
  const released = await releaseContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: releaseGrant.record.revision, token: releaseGrant.token });
  assert.equal(released.state, 'continuation_ready');
  assert.equal(released.dispatchAuthorization, undefined);
  assert(released.outstandingNonce, 'failed send release lost prepared continuation nonce');
  await cancelContinuation({ store, binding, continuationId: released.id, expectedRevision: released.revision });
  ready = await readyTask('Manual race');
  const manualGrant = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision, conversationFingerprint: fp, source: 'browser', now: 10_000 });
  const paused = await observeContinuationManualTurn({ store, binding, continuationId: ready.id, expectedRevision: manualGrant.record.revision, reason: 'manual_message' });
  assert.equal(paused.state, 'paused_by_user');
  assert.equal(paused.dispatchAuthorization, undefined);
  await assert.rejects(() => completeContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: paused.revision, conversationFingerprint: fp, token: manualGrant.token, now: 11_000 }), /dispatch_authorization_missing/);
  await cancelContinuation({ store, binding, continuationId: paused.id, expectedRevision: paused.revision });

  ready = await readyTask('Expiry test');
  const expiring = await authorizeContinuationDispatch({ enabled: true, store, binding, continuationId: ready.id, expectedRevision: ready.revision, conversationFingerprint: fp, source: 'browser', now: 20_000 });
  await assert.rejects(() => completeContinuationDispatch({ store, binding, continuationId: ready.id, expectedRevision: expiring.record.revision, conversationFingerprint: fp, token: expiring.token, now: 81_001 }), /dispatch_authorization_expired/);

  console.log('continuation dispatch smoke passed');
} finally {
  await fs.rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
