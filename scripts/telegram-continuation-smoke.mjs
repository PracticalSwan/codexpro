import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  telegramBotTokenFile,
  saveTelegramBotToken,
  resolveTelegramBotToken,
  clearTelegramBotToken
} from '../dist/continuation/telegramSecrets.js';
import { TelegramBotApiClient } from '../dist/continuation/telegramClient.js';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-telegram-'));
const storedToken = `${'123456789'}:${'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghi'}`;
const envToken = `${'987654321'}:${'abcdefghijklmnopqrstuvwxyz-ABCDEFGHI'}`;
const tokenPath = telegramBotTokenFile(home);
await saveTelegramBotToken(home, storedToken);
assert.equal((await fs.readFile(tokenPath, 'utf8')).trim(), storedToken);
const tokenStat = await fs.lstat(tokenPath);
assert(tokenStat.isFile() && !tokenStat.isSymbolicLink());
if (process.platform !== 'win32') assert.equal(tokenStat.mode & 0o077, 0);
assert.deepEqual(resolveTelegramBotToken(home, {}), { token: storedToken, source: 'protected_file' });
assert.deepEqual(resolveTelegramBotToken(home, { CODEXPRO_TELEGRAM_BOT_TOKEN: envToken }), { token: envToken, source: 'environment' });
const calls = [];
let responseMode = 'ok';
const fakeFetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (responseMode === 'flood') return new Response(JSON.stringify({ ok: false, description: `Too Many Requests ${url}`, parameters: { retry_after: 7 } }), { status: 429, headers: { 'content-type': 'application/json' } });
  if (responseMode === 'network') throw new Error(`network failed for ${url}`);
  const method = String(url).split('/').at(-1);
  const result = method === 'getMe'
    ? { id: 123456789, is_bot: true, username: 'codexpro_smoke_bot' }
    : method === 'getUpdates' ? [] : { message_id: 42 };
  return new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const client = new TelegramBotApiClient(storedToken, { fetchImpl: fakeFetch, baseUrl: 'https://telegram.invalid', timeoutMs: 1000 });
const me = await client.getMe();
assert.equal(me.username, 'codexpro_smoke_bot');
await client.getUpdates({ offset: 10, timeout: 30, allowed_updates: ['message', 'callback_query'] });
await client.sendMessage({ chat_id: 123, text: 'safe' });
await client.editMessageText({ chat_id: 123, message_id: 42, text: 'updated' });
await client.editMessageReplyMarkup({ chat_id: 123, message_id: 42, reply_markup: { inline_keyboard: [] } });
await client.answerCallbackQuery({ callback_query_id: 'cb_1', text: 'Request received' });
await client.getWebhookInfo();
for (const method of ['getMe', 'getUpdates', 'sendMessage', 'editMessageText', 'editMessageReplyMarkup', 'answerCallbackQuery', 'getWebhookInfo']) assert(calls.some((call) => call.url.endsWith(`/${method}`)), `missing Bot API method ${method}`);
responseMode = 'flood';
await assert.rejects(() => client.sendMessage({ chat_id: 123, text: 'rate' }), (error) => {
  assert.equal(error.retryAfter, 7);
  assert(!String(error.message).includes(storedToken));
  assert(!String(error.message).includes('/bot'));
  return true;
});
responseMode = 'network';
await assert.rejects(() => client.getMe(), (error) => {
  assert(!String(error.message).includes(storedToken));
  assert(!String(error.message).includes('/bot'));
  return true;
});
await clearTelegramBotToken(home);
assert.equal(await fs.stat(tokenPath).then(() => true).catch((error) => error.code === 'ENOENT' ? false : Promise.reject(error)), false);
assert.equal(resolveTelegramBotToken(home, {}).token, '');
console.log('telegram continuation smoke passed');
import { spawnSync } from 'node:child_process';
const cliRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-telegram-cli-'));
const cliEnv = { ...process.env, CODEXPRO_HOME: home, CODEXPRO_ROOT: cliRoot, CODEXPRO_TELEGRAM_BOT_TOKEN: envToken };
const runCli = (args, env = cliEnv) => spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], { cwd: process.cwd(), env, encoding: 'utf8', windowsHide: true });
const cliSave = runCli(['continuation', 'telegram', 'token', 'save']);
assert.equal(cliSave.status, 0, cliSave.stderr || cliSave.stdout);
assert(!`${cliSave.stdout}${cliSave.stderr}`.includes(envToken), 'Telegram token save echoed the token');
const cliStatus = runCli(['continuation', 'telegram', 'token', 'status']);
assert.equal(cliStatus.status, 0, cliStatus.stderr || cliStatus.stdout);
assert.match(cliStatus.stdout, /configured/i);
assert(!cliStatus.stdout.includes(envToken), 'Telegram token status exposed the token');
const cliArgLeak = runCli(['continuation', 'telegram', 'token', 'save', '--token', envToken]);
assert.notEqual(cliArgLeak.status, 0, 'Telegram token save accepted a command-line token');
assert(!`${cliArgLeak.stdout}${cliArgLeak.stderr}`.includes(envToken), 'CLI argument rejection echoed the token');
const cliClear = runCli(['continuation', 'telegram', 'token', 'clear', '--yes']);
assert.equal(cliClear.status, 0, cliClear.stderr || cliClear.stdout);
assert.equal(resolveTelegramBotToken(home, {}).token, '');
const { TelegramPairingStore } = await import('../dist/continuation/telegramPairing.js');
const pairDir = path.join(home, 'continuation', 'telegram');
let now = Date.now();
const pairingStore = new TelegramPairingStore(pairDir, { now: () => now });
const pending = await pairingStore.createPairing({ id: 123456789, username: 'codexpro_smoke_bot' });
assert.match(pending.code, /^[A-Za-z0-9_-]{16,64}$/);
assert.equal(pending.botId, '123456789');
const largeNumericUserId = Number(['9007199', '254740'].join(''));
const largeGroupChatId = -Number(['1001234', '567890'].join(''));
const groupUpdate = { message: { from: { id: largeNumericUserId }, chat: { id: largeGroupChatId, type: 'supergroup' }, text: `/start ${pending.code}` } };
await assert.rejects(() => pairingStore.claimFromUpdate(groupUpdate, '123456789'), /private/i);
const privateUpdate = { message: { from: { id: largeNumericUserId }, chat: { id: largeNumericUserId, type: 'private' }, text: `/start ${pending.code}` } };
const paired = await pairingStore.claimFromUpdate(privateUpdate, '123456789');
assert.deepEqual(paired, { telegramUserId: String(largeNumericUserId), privateChatId: String(largeNumericUserId), botId: '123456789' });
assert(!JSON.stringify(paired).includes('username'));
await assert.rejects(() => pairingStore.claimFromUpdate(privateUpdate, '123456789'), /pairing|used|active/i);
await assert.rejects(() => pairingStore.assertBotIdentity('999999999'), /identity/i);
await assert.rejects(() => pairingStore.createPairing({ id: 123456789, username: 'codexpro_smoke_bot' }), /paired|revoke/i);
await pairingStore.revoke();
const expiring = await pairingStore.createPairing({ id: 123456789, username: 'codexpro_smoke_bot' });
now += 5 * 60_000 + 1;
await assert.rejects(() => pairingStore.claimFromUpdate({ message: { from: { id: 777 }, chat: { id: 777, type: 'private' }, text: `/start ${expiring.code}` } }, '123456789'), /expired/i);
await pairingStore.revoke();
console.log('telegram pairing smoke passed');
const setupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-telegram-setup-'));
const setupEnv = { ...process.env, CODEXPRO_HOME: home, CODEXPRO_ROOT: setupRoot };
const disabledSetup = runCli(['continuation', 'telegram', 'setup', '--root', setupRoot], setupEnv);
assert.equal(disabledSetup.status, 0, disabledSetup.stderr || disabledSetup.stdout);
assert.match(disabledSetup.stdout, /requires task continuation|disabled/i);
assert(!disabledSetup.stdout.includes('WAITING_FOR_TELEGRAM_BOT_TOKEN'));
const enableSetup = runCli(['settings', 'set', '--root', setupRoot, '--tunnel', 'none', '--continuation', 'enabled', '--continuation-telegram', 'on'], setupEnv);
assert.equal(enableSetup.status, 0, enableSetup.stderr || enableSetup.stdout);
const waitingToken = runCli(['continuation', 'telegram', 'setup', '--root', setupRoot], setupEnv);
assert.equal(waitingToken.status, 0, waitingToken.stderr || waitingToken.stdout);
assert.match(waitingToken.stdout, /WAITING_FOR_TELEGRAM_BOT_TOKEN/);
assert.match(waitingToken.stdout, /continuation telegram token save/);
assert(!waitingToken.stdout.includes(storedToken) && !waitingToken.stdout.includes(envToken));
const { claimPairingFromUpdates } = await import('../dist/continuation/telegramPairing.js');
const scanRoot = path.join(home, 'pair-scan');
const scanStore = new TelegramPairingStore(scanRoot);
const scanPending = await scanStore.createPairing({ id: '123456789', username: 'codexpro_smoke_bot' });
const scanned = await claimPairingFromUpdates(scanStore, [
  { update_id: 1, message: { from: { id: 888 }, chat: { id: 888, type: 'private' }, text: '/start' } },
  { update_id: 2, message: { from: { id: 888 }, chat: { id: 888, type: 'private' }, text: `/start ${scanPending.code}` } }
], '123456789');
assert.equal(scanned?.telegramUserId, '888');
assert.equal(scanned?.privateChatId, '888');
assert.equal(await claimPairingFromUpdates(new TelegramPairingStore(path.join(home, 'empty-scan')), [], '123456789'), null);
console.log('telegram pairing scan smoke passed');
const { TelegramUpdateWorker, telegramWorkerBackoffMs } = await import('../dist/continuation/telegramWorker.js');
const workerDir = path.join(home, 'worker-smoke');
const pollCalls = [];
const handledUpdates = [];
const workerClient = {
  async getWebhookInfo() { return { url: '' }; },
  async getUpdates(input) { pollCalls.push(input); return [{ update_id: 10, message: {} }, { update_id: 11, callback_query: {} }]; }
};
let workerNow = 1_000_000;
const worker = new TelegramUpdateWorker({ stateDir: workerDir, client: workerClient, handleUpdate: async (update) => { handledUpdates.push(update.update_id); }, now: () => workerNow });
await worker.acquireLease();
await worker.runOnce();
workerNow += 91_000;
await worker.runOnce();
await assert.rejects(() => new TelegramUpdateWorker({ stateDir: workerDir, client: workerClient, handleUpdate: async () => {}, now: () => workerNow }).acquireLease(), /already active/i, 'active worker lease was not renewed before expiry');
assert.deepEqual(handledUpdates, [10, 11]);
assert.equal(pollCalls[0].timeout > 0, true);
assert.deepEqual(pollCalls[0].allowed_updates, ['message', 'callback_query']);
assert.equal(JSON.parse(await fs.readFile(path.join(workerDir, 'offset.json'), 'utf8')).offset, 12);
await assert.rejects(() => new TelegramUpdateWorker({ stateDir: workerDir, client: workerClient, handleUpdate: async () => {} }).acquireLease(), /already active/i);
await worker.releaseLease();
assert.equal(telegramWorkerBackoffMs(3, { retryAfter: 7 }), 7000);
const webhookDir = path.join(home, 'worker-webhook');
let webhookPolled = false;
const webhookWorker = new TelegramUpdateWorker({ stateDir: webhookDir, client: {
  async getWebhookInfo() { return { url: 'https://example.invalid/hook' }; },
  async getUpdates() { webhookPolled = true; return []; }
}, handleUpdate: async () => {} });
await webhookWorker.acquireLease();
await assert.rejects(() => webhookWorker.runOnce(), /webhook/i);
assert.equal(webhookPolled, false);
await webhookWorker.releaseLease();
const partialDir = path.join(home, 'worker-partial');
const partialWorker = new TelegramUpdateWorker({ stateDir: partialDir, client: { async getWebhookInfo() { return { url: '' }; }, async getUpdates() { return [{ update_id: 20 }, { update_id: 21 }]; } }, handleUpdate: async (update) => { if (update.update_id === 21) throw new Error('handler failed'); } });
await partialWorker.acquireLease();
await assert.rejects(() => partialWorker.runOnce(), /handler failed/);
assert.equal(JSON.parse(await fs.readFile(path.join(partialDir, 'offset.json'), 'utf8')).offset, 21);
await partialWorker.releaseLease();
console.log('telegram worker smoke passed');
const { createTelegramNotification, consumeTelegramAction, telegramNotificationOpportunityKey } = await import('../dist/continuation/telegramNotifications.js');
const notifyDir = path.join(home, 'notify-smoke');
const pairedIdentity = { telegramUserId: ['900719925474', '0993'].join(''), privateChatId: ['900719925474', '0994'].join(''), botId: '123456789' };
const notifyTask = {
  id: 'continuation_telegram-smoke-task', revision: 7, state: 'continuation_ready', outstandingNonce: 'nonce_telegram_smoke',
  currentPhase: 'C:\\secret\\project\\verify token_ABC123', remainingWork: ['verify current build'],
  continuationIntents: [
    { id: 'intent_resume', templateKey: 'resume_all_v1', label: 'Continue remaining work', revision: 7 },
    { id: 'intent_verify', templateKey: 'focus_remaining_v1', label: 'Verification', focusRef: 'verify current build', revision: 7 }
  ]
};
const semanticTask = { ...notifyTask, lastRequestId: 'req_semantic_opportunity', lastCheckpointId: 'cp_semantic_opportunity', continuationCount: 0 };
const semanticOpportunityKey = telegramNotificationOpportunityKey(semanticTask);
assert.match(semanticOpportunityKey, /^[a-f0-9]{64}$/);
assert.equal(telegramNotificationOpportunityKey({ ...semanticTask, revision: 8, outstandingNonce: 'nonce_telegram_churned' }), semanticOpportunityKey, 'transient revision/nonce churn changed the Telegram semantic opportunity key');
assert.notEqual(telegramNotificationOpportunityKey({ ...semanticTask, lastRequestId: 'req_semantic_next' }), semanticOpportunityKey, 'a new semantic continuation request reused the old Telegram opportunity key');
const notification = await createTelegramNotification({ stateDir: notifyDir, paired: pairedIdentity, task: notifyTask, now: 1_000_000 });
const actionRecordName = (await fs.readdir(path.join(notifyDir, 'actions')))[0];
const actionRecord = JSON.parse(await fs.readFile(path.join(notifyDir, 'actions', actionRecordName), 'utf8'));
assert.equal(Date.parse(actionRecord.expiresAt) - 1_000_000, 5 * 60 * 60_000, 'Telegram continuation button should remain valid for five hours');
assert.match(notification.text, /Task [A-Za-z0-9-]{1,8}/);
assert(!notification.text.includes('secret') && !notification.text.includes('project') && !notification.text.includes('token_'));
assert(notification.actions.length >= 1 && notification.actions.length <= 4);
for (const action of notification.actions) {
  assert(action.callbackData.length >= 1 && action.callbackData.length <= 64);
  assert(!action.callbackData.includes(notifyTask.id) && !action.callbackData.includes('verify'));
}
const chosen = notification.actions[0];
const consumed = await consumeTelegramAction({ stateDir: notifyDir, token: chosen.callbackData, paired: pairedIdentity, task: notifyTask, now: 1_000_100 });
assert.equal(consumed.intentId, chosen.intentId);
await assert.rejects(() => consumeTelegramAction({ stateDir: notifyDir, token: chosen.callbackData, paired: pairedIdentity, task: notifyTask, now: 1_000_200 }), /invalid|used|expired/i);
const unsafeActionRoot = path.join(home, 'telegram-unsafe-action-root');
const unsafeActionOutside = path.join(home, 'telegram-unsafe-action-outside');
await fs.mkdir(unsafeActionRoot, { recursive: true });
await fs.mkdir(unsafeActionOutside, { recursive: true });
await fs.symlink(unsafeActionOutside, path.join(unsafeActionRoot, 'actions'), process.platform === 'win32' ? 'junction' : 'dir');
await assert.rejects(() => createTelegramNotification({ stateDir: unsafeActionRoot, paired: pairedIdentity, task: notifyTask, now: 1_000_300 }), /unsafe|state/i, 'Telegram action state followed a symlinked actions directory');
console.log('telegram protected action state smoke passed');
console.log('telegram notification smoke passed');
const { ContinuationStore } = await import('../dist/continuation/store.js');
const dispatchOps = await import('../dist/continuation/ops.js');
const dispatchRoot = path.join(home, 'telegram-dispatch');
const dispatchWorkspace = path.join(home, 'telegram-dispatch-workspace');
await fs.mkdir(dispatchWorkspace, { recursive: true });
const dispatchStore = new ContinuationStore(dispatchRoot);
const dispatchBinding = { workspace: { id: 'ws_telegram_dispatch', root: dispatchWorkspace }, sessionId: 'sess_telegram_dispatch' };
const dispatchFp = 'a'.repeat(64);
let dispatchTask = await dispatchOps.armContinuation({ enabled: true, store: dispatchStore, binding: dispatchBinding, title: 'Telegram dispatch smoke' });
dispatchTask = await dispatchOps.bindContinuationConversation({ enabled: true, store: dispatchStore, binding: dispatchBinding, continuationId: dispatchTask.id, expectedRevision: dispatchTask.revision, conversationFingerprint: dispatchFp });
dispatchTask = await dispatchOps.checkpointContinuation({ enabled: true, store: dispatchStore, binding: dispatchBinding, continuationId: dispatchTask.id, expectedRevision: dispatchTask.revision, checkpointId: 'cp_telegram_dispatch', completedEvidence: ['setup'], remainingWork: ['verify current build'], intents: [{ templateKey: 'resume_all_v1', label: 'Continue' }, { templateKey: 'focus_remaining_v1', label: 'Verification', focusRef: 'verify current build' }] });
dispatchTask = await dispatchOps.requestContinuation({ enabled: true, store: dispatchStore, binding: dispatchBinding, continuationId: dispatchTask.id, expectedRevision: dispatchTask.revision, requestId: 'req_telegram_dispatch' });
dispatchTask = await dispatchStore.update(dispatchTask.id, dispatchBinding, { expectedRevision: dispatchTask.revision }, (draft) => { draft.state = 'continuation_ready'; return draft; });
const focusIntent = dispatchTask.continuationIntents.find((intent) => intent.templateKey === 'focus_remaining_v1');
assert(focusIntent);
assert.notEqual(focusIntent.revision, dispatchTask.revision, 'smoke fixture must preserve prepared-intent revision across readiness revision bump');
const realRevisionNotifyDir = path.join(home, 'telegram-real-revision-notify');
const realRevisionNotification = await createTelegramNotification({ stateDir: realRevisionNotifyDir, paired: pairedIdentity, task: dispatchTask, now: 1_500_000 });
const realRevisionAction = realRevisionNotification.actions.find((entry) => entry.intentId === focusIntent.id);
assert(realRevisionAction);
const realRevisionConsumed = await consumeTelegramAction({ stateDir: realRevisionNotifyDir, token: realRevisionAction.callbackData, paired: pairedIdentity, task: dispatchTask, now: 1_500_100 });
assert.equal(realRevisionConsumed.intentId, focusIntent.id);
const telegramGrant = await dispatchOps.authorizeContinuationDispatch({ enabled: true, store: dispatchStore, binding: dispatchBinding, continuationId: dispatchTask.id, expectedRevision: dispatchTask.revision, conversationFingerprint: dispatchFp, source: 'telegram', intentId: focusIntent.id, now: 1000 });
assert.equal(telegramGrant.record.selectedContinuationIntentId, focusIntent.id);
assert.equal(telegramGrant.record.dispatchAuthorization?.source, 'telegram');
assert.equal(Date.parse(telegramGrant.record.dispatchAuthorization.expiresAt) - Date.parse(telegramGrant.record.dispatchAuthorization.authorizedAt), 30_000);
await assert.rejects(() => dispatchOps.completeContinuationDispatch({ store: dispatchStore, binding: dispatchBinding, continuationId: telegramGrant.record.id, expectedRevision: telegramGrant.record.revision, conversationFingerprint: dispatchFp, token: telegramGrant.token, now: 31_001 }), /expired/i);
console.log('telegram dispatch authorization smoke passed');
const { storeTelegramDispatchGrant, consumeTelegramDispatchGrant } = await import('../dist/continuation/telegramNotifications.js');
const grantDir = path.join(home, 'telegram-grant-smoke');
const grantToken = 'f'.repeat(64);
await storeTelegramDispatchGrant(grantDir, { taskId: 'continuation_grant-smoke', revision: 9, conversationFingerprint: 'b'.repeat(64), authorizationToken: grantToken, expiresAt: new Date(40_000).toISOString() });
const consumedGrant = await consumeTelegramDispatchGrant(grantDir, { taskId: 'continuation_grant-smoke', revision: 9, conversationFingerprint: 'b'.repeat(64), now: 20_000 });
assert.equal(consumedGrant.authorizationToken, grantToken);
await assert.rejects(() => consumeTelegramDispatchGrant(grantDir, { taskId: 'continuation_grant-smoke', revision: 9, conversationFingerprint: 'b'.repeat(64), now: 20_001 }), /missing|used/i);
await storeTelegramDispatchGrant(grantDir, { taskId: 'continuation_grant-expired', revision: 3, conversationFingerprint: 'c'.repeat(64), authorizationToken: 'e'.repeat(64), expiresAt: new Date(10_000).toISOString() });
await assert.rejects(() => consumeTelegramDispatchGrant(grantDir, { taskId: 'continuation_grant-expired', revision: 3, conversationFingerprint: 'c'.repeat(64), now: 10_001 }), /expired/i);
const unsafeGrantRoot = path.join(home, 'telegram-unsafe-grant-root');
const unsafeGrantOutside = path.join(home, 'telegram-unsafe-grant-outside');
await fs.mkdir(unsafeGrantRoot, { recursive: true });
await fs.mkdir(unsafeGrantOutside, { recursive: true });
await fs.symlink(unsafeGrantOutside, path.join(unsafeGrantRoot, 'dispatch'), process.platform === 'win32' ? 'junction' : 'dir');
await assert.rejects(() => storeTelegramDispatchGrant(unsafeGrantRoot, { taskId: 'continuation_grant-unsafe', revision: 1, conversationFingerprint: 'd'.repeat(64), authorizationToken: 'a'.repeat(64), expiresAt: new Date(40_000).toISOString() }), /unsafe|state/i, 'Telegram dispatch grant followed a symlinked dispatch directory');
console.log('telegram protected dispatch state smoke passed');
console.log('telegram dispatch grant smoke passed');

const telegramStateOps = await import('../dist/continuation/telegramNotifications.js');
const disableDir = path.join(home, 'telegram-disable-smoke');
assert.equal(await telegramStateOps.telegramRuntimeAuthorizationDisabled(disableDir), false);
await telegramStateOps.setTelegramRuntimeAuthorizationDisabled(disableDir, true);
assert.equal(await telegramStateOps.telegramRuntimeAuthorizationDisabled(disableDir), true);
await telegramStateOps.setTelegramRuntimeAuthorizationDisabled(disableDir, false);
assert.equal(await telegramStateOps.telegramRuntimeAuthorizationDisabled(disableDir), false);
console.log('telegram runtime disable smoke passed');

const disableCli = runCli(['continuation', 'telegram', 'disable', '--root', setupRoot], setupEnv);
assert.equal(disableCli.status, 0, disableCli.stderr || disableCli.stdout);
assert.match(disableCli.stdout, /disabled/i);
assert.equal(await telegramStateOps.telegramRuntimeAuthorizationDisabled(path.join(home, 'continuation', 'telegram')), true);
const disabledStatusCli = runCli(['continuation', 'telegram', 'status', '--root', setupRoot], setupEnv);
assert.equal(disabledStatusCli.status, 0, disabledStatusCli.stderr || disabledStatusCli.stdout);
for (const expected of ['Live authorization', 'disabled', 'Worker', 'not_running', 'Webhook conflict', 'no', 'Last Bot API contact', 'Notifications', 'unavailable']) assert.match(disabledStatusCli.stdout, new RegExp(expected, 'i'));
for (const forbidden of [['777888999', '000111222'].join(''), ['222333444', '555666777'].join(''), storedToken, chosen.callbackData, grantToken]) assert(!disabledStatusCli.stdout.includes(forbidden));
const rePairPending = await pairingStore.createPairing({ id: 123456789, username: 'codexpro_smoke_bot' });
await pairingStore.claimFromUpdate({ message: { from: { id: 444 }, chat: { id: 444, type: 'private' }, text: `/start ${rePairPending.code}` } }, '123456789');
const revokeCli = runCli(['continuation', 'telegram', 'revoke', '--root', setupRoot], setupEnv);
assert.equal(revokeCli.status, 0, revokeCli.stderr || revokeCli.stdout);
assert.match(revokeCli.stdout, /revoked/i);
assert.equal(await pairingStore.paired(), null);
console.log('telegram disable and revoke smoke passed');

const dedupeMarkerDir = path.join(home, 'telegram-send-dedupe-smoke');
assert.equal(await telegramStateOps.claimTelegramNotificationSend(dedupeMarkerDir, '3'.repeat(64)), true);
assert.equal(await telegramStateOps.telegramNotificationWasSent(dedupeMarkerDir, '3'.repeat(64)), true);
assert.equal(await telegramStateOps.claimTelegramNotificationSend(dedupeMarkerDir, '3'.repeat(64)), false, 'second notification send claim was not suppressed');
await telegramStateOps.markTelegramNotificationSent(dedupeMarkerDir, '3'.repeat(64), 103, 7);
const sentRevisionMarker = await telegramStateOps.readTelegramNotificationMarker(dedupeMarkerDir, '3'.repeat(64));
assert.equal(sentRevisionMarker?.state, 'sent');
assert.equal(sentRevisionMarker?.messageId, 103);
assert.equal(sentRevisionMarker?.revision, 7);
await telegramStateOps.markTelegramNotificationSent(dedupeMarkerDir, '3'.repeat(64), 103, 9);
const refreshedRevisionMarker = await telegramStateOps.readTelegramNotificationMarker(dedupeMarkerDir, '3'.repeat(64));
assert.equal(refreshedRevisionMarker?.messageId, 103, 'Telegram refresh should reuse the existing message');
assert.equal(refreshedRevisionMarker?.revision, 9, 'Telegram refresh did not advance the displayed button revision');
assert.deepEqual(await telegramStateOps.takeStaleTelegramNotificationMessageIds(dedupeMarkerDir), [103]);
console.log('telegram notification send dedupe smoke passed');

const staleMarkerDir = path.join(home, 'telegram-stale-marker-smoke');
await telegramStateOps.markTelegramNotificationSent(staleMarkerDir, '1'.repeat(64), 101);
await telegramStateOps.markTelegramNotificationSent(staleMarkerDir, '2'.repeat(64), 102);
assert.deepEqual(await telegramStateOps.takeStaleTelegramNotificationMessageIds(staleMarkerDir, '2'.repeat(64)), [101]);
assert.equal(await telegramStateOps.telegramNotificationWasSent(staleMarkerDir, '2'.repeat(64)), true);
assert.deepEqual(await telegramStateOps.takeStaleTelegramNotificationMessageIds(staleMarkerDir), [102]);
assert.equal(await telegramStateOps.telegramNotificationWasSent(staleMarkerDir, '2'.repeat(64)), false);
console.log('telegram stale notification marker smoke passed');

const telegramStatusModule = await import('../dist/continuation/telegramStatus.js');
const statusDir = path.join(home, 'telegram-status-smoke');
await telegramStatusModule.writeTelegramRuntimeStatus(statusDir, {
  state: 'ready', workerState: 'running', botUsername: 'codexpro_smoke_bot', webhookConflict: false,
  lastSuccessfulContactAt: '2026-09-10T00:00:00.000Z', notificationAvailable: true
});
const safeTelegramStatus = await telegramStatusModule.readTelegramRuntimeStatus(statusDir);
assert.equal(safeTelegramStatus.state, 'ready');
assert.equal(safeTelegramStatus.workerState, 'running');
assert.equal(safeTelegramStatus.botUsername, 'codexpro_smoke_bot');
assert.equal(safeTelegramStatus.notificationAvailable, true);
const safeStatusText = JSON.stringify(safeTelegramStatus);
for (const forbidden of [storedToken, pairedIdentity.telegramUserId, pairedIdentity.privateChatId, chosen.callbackData, grantToken]) assert(!safeStatusText.includes(forbidden));
const httpSource = await fs.readFile('src/http.ts', 'utf8');
const callbackStart = httpSource.indexOf('handleUpdate: async (update) => {');
const callbackEnd = httpSource.indexOf('telegramWorkerAbort.signal', callbackStart);
assert(callbackStart >= 0 && callbackEnd > callbackStart, 'Telegram callback handler source was not found');
const callbackSource = httpSource.slice(callbackStart, callbackEnd);
const taskReadyGuard = callbackSource.indexOf('current.state !== "continuation_ready"');
const actionConsume = callbackSource.indexOf('const action = await consumeTelegramAction');
assert(taskReadyGuard >= 0 && actionConsume >= 0 && taskReadyGuard < actionConsume, 'Telegram callback consumed the one-time action before validating the continuation-ready bound task');
assert(!callbackSource.slice(0, actionConsume).includes('browserObservations') && !callbackSource.slice(0, actionConsume).includes('listPublicClients()') && !callbackSource.slice(0, actionConsume).includes('evaluateRecord(current'), 'Telegram callback duplicated managed-browser live page-safety validation');
const remoteDispatchStart = httpSource.indexOf('consumeRemoteDispatch: async');
const remoteDispatchEnd = httpSource.indexOf('rejectRemoteDispatch:', remoteDispatchStart);
assert(remoteDispatchStart >= 0 && remoteDispatchEnd > remoteDispatchStart, 'remote Telegram dispatch handler source was not found');
assert(!httpSource.slice(remoteDispatchStart, remoteDispatchEnd).includes('browserObservations.get'), 'remote Telegram grant consumption duplicated managed-browser live page-safety validation');
assert(httpSource.includes('telegramNotificationOpportunityKey(record)'), 'Telegram ready delivery is not keyed to the semantic continuation opportunity');
assert(httpSource.includes('editMessageReplyMarkup({ chat_id: currentPaired.privateChatId, message_id: marker.messageId'), 'Telegram ready delivery does not refresh an existing semantic-opportunity message in place');
console.log('telegram managed-browser authority smoke passed');

console.log('telegram sanitized runtime status smoke passed');
