import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BrowserPairingStore } from '../dist/continuation/browserAuth.js';
import { createBrowserBridgeApp } from '../dist/continuation/browserBridge.js';

const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-browser-auth-'));
const cliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-browser-cli-'));
let now = Date.parse('2026-09-08T08:00:00Z');
const clock = () => now;

try {
  const store = new BrowserPairingStore(stateDir, { now: clock });
  const pairing = await store.createPairing('default');
  assert.match(pairing.code, /^[A-Z2-7]{8}$/);
  assert.equal(pairing.expiresAt, new Date(now + 300_000).toISOString());
  const diskBefore = JSON.stringify(await store.debugRecordsForTest());
  assert(!diskBefore.includes(pairing.code), 'pairing code was persisted in plaintext');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await assert.rejects(() => store.exchangePairing('default', 'AAAAAAAA'), /pairing_code_invalid/i);
  }
  await assert.rejects(() => store.exchangePairing('default', 'BBBBBBBB'), /pairing_locked/i);

  const expiring = await store.createPairing('expire-me');
  now += 300_001;
  await assert.rejects(() => store.exchangePairing('expire-me', expiring.code), /pairing_expired/i);
  now -= 300_001;

  const valid = await store.createPairing('default');
  const client = await store.exchangePairing('default', valid.code, { extensionVersion: '0.1.0', extensionId: 'abcdefghijklmnopabcdefghijklmnop' });
  assert.match(client.clientId, /^browser_[A-Za-z0-9-]{1,80}$/);
  assert.match(client.credential, /^[a-f0-9]{64}$/);
  assert.equal(await store.verifyCredential(client.clientId, client.credential, 'abcdefghijklmnopabcdefghijklmnop'), true);
  assert.equal(await store.verifyCredential(client.clientId, client.credential), true, 'paired loopback client rejected credential-only MV3 authentication without Origin');
  assert.equal(await store.verifyCredential(client.clientId, client.credential, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), false, 'extension-bound client accepted the wrong extension id');
  await assert.rejects(() => store.exchangePairing('default', valid.code), /pairing_consumed|pairing_code_invalid/i);
  const replacementPair = await store.createPairing('default');
  const replacement = await store.exchangePairing('default', replacementPair.code, { extensionId: 'abcdefghijklmnopabcdefghijklmnop' });
  assert.equal(await store.verifyCredential(client.clientId, client.credential), false, 'replacement pairing did not revoke old client');
  assert.equal(await store.verifyCredential(replacement.clientId, replacement.credential, 'abcdefghijklmnopabcdefghijklmnop'), true);
  const publicClients = await store.listPublicClients();
  assert(publicClients.some((item) => item.client_id === replacement.clientId && item.active === true));
  const serializedClients = JSON.stringify(publicClients);
  assert(!serializedClients.includes(replacement.credential), 'public client status leaked credential');
  assert(!serializedClients.includes('credentialHash'), 'public client status leaked verifier');

  await store.revokeClient(replacement.clientId);
  assert.equal(await store.verifyCredential(replacement.clientId, replacement.credential, 'abcdefghijklmnopabcdefghijklmnop'), false);

  const bridgePair = await store.createPairing('bridge');
  const taskStatus = { task: { id: 'continuation_demo', revision: 4, state: 'working', title: 'Demo task' } };
  const events = [];
  const bridgeCalls = [];
  const fp = 'a'.repeat(64);
  const authToken = 'b'.repeat(64);
  const fixedMessage = 'Continue the current task from the latest CodexPro continuation state. Preserve the original goal and acceptance criteria. Do not repeat work already recorded as completed and verified.';
  const app = createBrowserBridgeApp({
    store, statusProvider: async () => taskStatus, onEvent: async (event) => { events.push(event); },
    bindConversation: async (input) => { bridgeCalls.push({ kind: 'bind', input }); return { task: { ...taskStatus.task, revision: 5, conversation_bound: true } }; },
    authorizeDispatch: async (input) => { bridgeCalls.push({ kind: 'authorize', input }); return { authorization_token: authToken, task_id: input.taskId, revision: 5, conversation_fingerprint: input.conversationFingerprint, message: fixedMessage }; },
    consumeRemoteDispatch: async (input) => { bridgeCalls.push({ kind: 'remote', input }); return { authorization_token: authToken, task_id: input.taskId, revision: input.revision, conversation_fingerprint: input.conversationFingerprint, message: fixedMessage }; },
    rejectRemoteDispatch: async (input) => { bridgeCalls.push({ kind: 'remote_reject', input }); return { task: { ...taskStatus.task, revision: input.revision + 1, state: 'continuation_ready' } }; },
    completeDispatch: async (input) => { bridgeCalls.push({ kind: 'complete', input }); return { task: { ...taskStatus.task, revision: 6, state: 'dispatched' } }; },
    releaseDispatch: async (input) => { bridgeCalls.push({ kind: 'release', input }); return { task: { ...taskStatus.task, revision: 6, state: 'continuation_ready' } }; },
    manualInteraction: async (input) => { bridgeCalls.push({ kind: 'manual', input }); return { task: { ...taskStatus.task, revision: 6, state: 'paused_by_user', manual_turn_pending: true } }; }
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const extensionOrigin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const pairResponse = await fetch(`${base}/continuation/v1/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: extensionOrigin },
    body: JSON.stringify({ profile_label: 'bridge', code: bridgePair.code })
  });
  assert.equal(pairResponse.status, 200);
  const paired = await pairResponse.json();
  assert.match(paired.client_id, /^browser_/);
  assert.match(paired.credential, /^[a-f0-9]{64}$/);
  const browserHeaders = { authorization: `Bearer ${paired.credential}`, 'x-codexpro-browser-client': paired.client_id };
  const statusResponse = await fetch(`${base}/continuation/v1/status`, { headers: browserHeaders });
  assert.equal(statusResponse.status, 200, 'paired MV3 client without Origin header could not poll status');
  assert.deepEqual(await statusResponse.json(), taskStatus);
  const csrf = await fetch(`${base}/continuation/v1/status`, { headers: { ...browserHeaders, origin: 'https://chatgpt.com' } });
  assert.equal(csrf.status, 403, 'ordinary webpage origin reached privileged browser bridge');
  const wrongExtensionOrigin = await fetch(`${base}/continuation/v1/status`, { headers: { ...browserHeaders, origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' } });
  assert.equal(wrongExtensionOrigin.status, 401, 'different extension origin reached privileged browser bridge');
  const forwarded = await fetch(`${base}/continuation/v1/status`, { headers: { ...browserHeaders, 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(forwarded.status, 403, 'forwarded/tunneled request reached browser bridge');
  const wrongCredential = await fetch(`${base}/continuation/v1/status`, { headers: { ...browserHeaders, authorization: 'Bearer ' + '0'.repeat(64) } });
  assert.equal(wrongCredential.status, 401);

  const pageState = await fetch(`${base}/continuation/v1/page-state`, {
    method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ auth_state: 'signed_in', composer_available: true, streaming: false, platform_state: 'idle', blocking_interaction: false, recent_user_input: false, conversation_bound: true, observation_generation_id: 'browser-smoke-1', long_observation_gap: false })
  });
  assert.equal(pageState.status, 204);
  assert.equal(events.at(-1)?.type, 'page_state');
  const bindEvent = await fetch(`${base}/continuation/v1/events/bind`, {
    method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp })
  });
  assert.equal(bindEvent.status, 200);
  assert.equal(bridgeCalls.at(-1)?.kind, 'bind');
  const bindMissingFingerprint = await fetch(`${base}/continuation/v1/events/bind`, {
    method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4 })
  });
  assert.equal(bindMissingFingerprint.status, 400, 'bridge bound a chat without an opaque conversation fingerprint');
  const safePage = { auth_state: 'signed_in', composer_ready: true, streaming: false, platform_state: 'idle', blocking_interaction: false, recent_user_input: false };
  const unauthDispatch = await fetch(`${base}/continuation/v1/dispatch/authorize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp, page_state: safePage }) });
  assert.equal(unauthDispatch.status, 401, 'dispatch endpoint was not browser-client authenticated');
  const unsafeDispatch = await fetch(`${base}/continuation/v1/dispatch/authorize`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp, page_state: { ...safePage, streaming: true } }) });
  assert.equal(unsafeDispatch.status, 409, 'streaming page was authorized for dispatch');
  const authorize = await fetch(`${base}/continuation/v1/dispatch/authorize`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp, page_state: safePage }) });
  assert.equal(authorize.status, 200);
  const grant = await authorize.json();
  assert.equal(grant.authorization_token, authToken);
  assert.equal(grant.message, fixedMessage);
  assert.equal(bridgeCalls.at(-1)?.kind, 'authorize');
  const arbitrary = await fetch(`${base}/continuation/v1/dispatch/authorize`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp, page_state: safePage, selector: '#danger', script: 'alert(1)', command: 'git push', message: 'arbitrary' }) });
  assert.equal(arbitrary.status, 409, 'bridge accepted arbitrary selector/script/command/message fields');
  const remoteUnauth = await fetch(`${base}/continuation/v1/dispatch/remote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5, conversation_fingerprint: fp }) });
  assert.equal(remoteUnauth.status, 401, 'remote Telegram grant endpoint was not browser-client authenticated');
  const remote = await fetch(`${base}/continuation/v1/dispatch/remote`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5, conversation_fingerprint: fp }) });
  assert.equal(remote.status, 200);
  assert.equal((await remote.json()).authorization_token, authToken);
  assert.equal(bridgeCalls.at(-1)?.kind, 'remote');
  const remoteArbitrary = await fetch(`${base}/continuation/v1/dispatch/remote`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5, conversation_fingerprint: fp, message: 'arbitrary' }) });
  assert.equal(remoteArbitrary.status, 409, 'remote Telegram grant endpoint accepted arbitrary message content');
  const remoteReject = await fetch(`${base}/continuation/v1/dispatch/remote/reject`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5 }) });
  assert.equal(remoteReject.status, 200);
  assert.equal(bridgeCalls.at(-1)?.kind, 'remote_reject');
  const complete = await fetch(`${base}/continuation/v1/dispatch/complete`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5, conversation_fingerprint: fp, authorization_token: authToken }) });
  assert.equal(complete.status, 200);
  assert.equal(bridgeCalls.at(-1)?.kind, 'complete');
  const release = await fetch(`${base}/continuation/v1/dispatch/release`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 5, authorization_token: authToken }) });
  assert.equal(release.status, 200);
  assert.equal(bridgeCalls.at(-1)?.kind, 'release');
  const manual = await fetch(`${base}/continuation/v1/events/manual`, { method: 'POST', headers: { ...browserHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ task_id: 'continuation_demo', revision: 4, conversation_fingerprint: fp, reason: 'manual_message' }) });
  assert.equal(manual.status, 200);
  assert.equal(bridgeCalls.at(-1)?.kind, 'manual');
  assert.equal(statusResponse.headers.get('access-control-allow-origin'), null, 'bridge enabled permissive browser CORS');
  const revokeResponse = await fetch(`${base}/continuation/v1/client`, { method: 'DELETE', headers: browserHeaders });
  assert.equal(revokeResponse.status, 204);
  const revokedResponse = await fetch(`${base}/continuation/v1/status`, { headers: browserHeaders });
  assert.equal(revokedResponse.status, 401, 'revoked browser client retained bridge access');
  await new Promise((resolve) => server.close(resolve));

  const manifest = JSON.parse(await fs.readFile(path.resolve('browser-extension/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual([...manifest.permissions].sort(), ['notifications', 'storage', 'tabs']);
  assert.deepEqual(manifest.host_permissions, ['https://chatgpt.com/*', 'http://127.0.0.1/*']);
  const manifestText = JSON.stringify(manifest);
  for (const forbidden of ['<all_urls>', 'webRequestBlocking', 'debugger', 'downloads', 'history', 'passwords']) {
    assert(!manifestText.includes(forbidden), `extension manifest exposed forbidden capability ${forbidden}`);
  }
  assert.deepEqual(manifest.content_scripts?.[0]?.js, ['chatgpt-adapter.js', 'content.js'], 'ChatGPT adapter must load before the generic content controller');
  const extensionFiles = ['background.js', 'chatgpt-adapter.js', 'content.js', 'popup.js'];
  const sourceText = (await Promise.all(extensionFiles.map((name) => fs.readFile(path.resolve('browser-extension', name), 'utf8')))).join('\n');
  for (const forbidden of ['innerText', 'textContent', 'document.body.innerHTML', 'eval(', 'new Function', 'chrome.debugger']) {
    assert(!sourceText.includes(forbidden), `extension source contains forbidden conversation/DOM capability ${forbidden}`);
  }
  assert(!sourceText.includes('Authorization: Bearer'), 'extension source hard-coded bearer material');
  assert(!sourceText.includes('x-codexpro-extension-id'), 'extension relies on a custom identity header that Chrome MV3 may omit');
  assert(!/chrome\.runtime\.sendMessage\([^;]*\)\.catch/.test(sourceText), 'content script assumes Promise-returning chrome.runtime.sendMessage');
  assert(sourceText.includes('chrome.notifications.create('), 'ready continuation does not create a browser notification');
  assert(sourceText.includes('chrome.action.setBadgeText('), 'ready continuation does not set/clear the extension badge');
  assert(sourceText.includes('chrome.notifications.onClicked.addListener('), 'continuation notification cannot focus the bound chat');
  assert(!/notifications\.onClicked\.addListener[\s\S]{0,800}codexpro_continue/.test(sourceText), 'notification click directly dispatches a continuation message');
  const forcedPageStateResends = sourceText.split('await sendPageState(active.pageState, { tab: { id: active.tabId } });').length - 1;
  assert(forcedPageStateResends >= 2, 'pair/bind transitions must explicitly re-send the current page state to the bridge');
  assert(sourceText.includes('if (binding && sender?.tab?.id !== binding.tabId) return;'), 'unbound ChatGPT tab heartbeat can overwrite bound-tab continuation readiness');

  const cliSecret = 'mcp-token-plan30-must-not-print';
  const cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'continuation', 'browser', 'pair', '--profile', 'smoke'], { encoding: 'utf8', env: { ...process.env, CODEXPRO_HOME: cliHome, CODEXPRO_HTTP_TOKEN: cliSecret, CODEXPRO_CONTINUATION_ENABLED: '1' } });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const cliOutput = `${cli.stdout}${cli.stderr}`;
  const cliCode = cliOutput.match(/Pairing code:\s*([A-Z2-7]{8})/)?.[1];
  assert(cliCode, 'CLI pairing did not print an 8-character code');
  assert(!cliOutput.includes(cliSecret), 'CLI pairing leaked main MCP bearer material');
  const pairingDisk = await fs.readFile(path.join(cliHome, 'continuation', 'browser', 'pairings', 'smoke.json'), 'utf8');
  assert(!pairingDisk.includes(cliCode), 'CLI pairing persisted the plaintext pairing code');
  const disabledCli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'continuation', 'browser', 'pair', '--profile', 'disabled'], { encoding: 'utf8', env: { ...process.env, CODEXPRO_HOME: cliHome, CODEXPRO_CONTINUATION_ENABLED: '' } });
  assert.notEqual(disabledCli.status, 0, 'CLI browser pairing succeeded while continuation was disabled');
  assert.match(`${disabledCli.stdout}${disabledCli.stderr}`, /continuation_disabled/i);

  console.log('browser continuation smoke passed');
} finally {
  await fs.rm(stateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(cliHome, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
