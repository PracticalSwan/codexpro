import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { TelemetryRegistry } from '../dist/telemetry.js';
import { diagnosticsSnapshot } from '../dist/diagnosticsOps.js';
import { ActivityStore } from '../dist/activity/store.js';
import { ActivityRegistry } from '../dist/activity/registry.js';
import { TelegramBotApiClient } from '../dist/continuation/telegramClient.js';
import { publicContinuationRecord } from '../dist/continuation/types.js';
import {
  assertBrowserExtensionManifestSafe,
  assertContinuationPackageFilesSafe,
  assertContinuationPackagedTextSafe
} from './release-guard.mjs';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'browser-extension', 'manifest.json'), 'utf8'));
const security = await fs.readFile(path.join(root, 'SECURITY.md'), 'utf8');
const decisions = await fs.readFile(path.join(root, 'docs', 'agentic', 'DECISIONS.md'), 'utf8');

assert.doesNotThrow(() => assertBrowserExtensionManifestSafe(manifest));
assert.throws(() => assertBrowserExtensionManifestSafe({ ...manifest, permissions: [...manifest.permissions, 'cookies'] }), /permission/i);
assert.throws(() => assertBrowserExtensionManifestSafe({ ...manifest, host_permissions: [...manifest.host_permissions, '<all_urls>'] }), /host/i);
assert.throws(() => assertBrowserExtensionManifestSafe({ ...manifest, externally_connectable: { matches: ['*://*/*'] } }), /externally|connect/i);
const forbiddenPackagePaths = [
  'browser-profile/default/Cookies',
  'browser/default/user-data/Default/Local Storage/leveldb/000001.log',
  'browser-extension/pairing.json',
  'artifacts/continuation.har',
  'artifacts/cdp-trace.json',
  'artifacts/browser-screenshot.png'
];
for (const candidate of forbiddenPackagePaths) {
  assert.throws(() => assertContinuationPackageFilesSafe([candidate]), /forbidden|private|browser|package/i, candidate);
}
assert.doesNotThrow(() => assertContinuationPackageFilesSafe([
  'browser-extension/manifest.json',
  'browser-extension/background.js',
  'dist/http.js',
  'README.md'
]));

const syntheticBotToken = ['123456789', 'A'.repeat(32)].join(':');
const syntheticBotUrl = ['https://api.telegram.org/bot', syntheticBotToken, '/getMe'].join('');
const syntheticTelegramId = ['900719925474', '0991'].join('');
const syntheticCallback = 'callback_' + 'c'.repeat(40);
const syntheticCookie = 'session=' + 's'.repeat(40);
const syntheticChatUrl = ['https://chatgpt.com/', 'c/', '12345678-abcd-4def-9999-123456789abc'].join('');
const syntheticEmail = ['private.account', 'example.invalid'].join('@');
const privateValues = [syntheticBotToken, syntheticBotUrl, syntheticTelegramId, syntheticCallback, syntheticCookie, syntheticChatUrl, syntheticEmail];
const packagedPrivateValues = [syntheticBotToken, syntheticBotUrl, `telegramUserId=${syntheticTelegramId}`, syntheticCallback, syntheticCookie, syntheticChatUrl];
for (const value of packagedPrivateValues) {
  assert.throws(() => assertContinuationPackagedTextSafe(value, 'fixture.txt'), /private|secret|forbidden|package/i);
}
assert.doesNotThrow(() => assertContinuationPackagedTextSafe('Static continuation documentation without private state.', 'README.md'));
assert.doesNotThrow(() => assertContinuationPackagedTextSafe('const session = codexSessions.structuredContent.sessions?.[0];', 'scripts/safe-source.mjs'));

const telemetry = new TelemetryRegistry({ maxEvents: 8 });
telemetry.record({
  stage: 'resilience', status: 'error',
  tool: `continuation_${syntheticBotToken}`,
  backend: syntheticChatUrl,
  sessionState: syntheticEmail,
  event: syntheticCallback,
  reason: `${syntheticBotUrl} ${syntheticTelegramId}`,
  entityId: syntheticCookie,
  errorBoundary: syntheticBotUrl
});
const telemetryText = JSON.stringify(telemetry.snapshot());
for (const value of privateValues) assert(!telemetryText.includes(value), `telemetry leaked private fixture: ${value.slice(0, 12)}`);

const activityDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-continuation-security-'));
try {
  const activity = new ActivityRegistry(new ActivityStore({ baseDir: activityDir, maxRecords: 8, maxBytes: 16_000 }));
  await activity.append({ workspaceId: 'ws_security', kind: 'continuation', action: 'security_fixture', status: 'error', summary: privateValues.join(' ') });
  const activityText = JSON.stringify(await activity.read({ workspaceId: 'ws_security', limit: 8 }));
  for (const value of privateValues) assert(!activityText.includes(value), `activity ledger leaked private fixture: ${value.slice(0, 12)}`);
} finally {
  await fs.rm(activityDir, { recursive: true, force: true });
}

const fakeTelegramFetch = async () => new Response(JSON.stringify({ ok: false, description: privateValues.join(' ') }), {
  status: 400, headers: { 'content-type': 'application/json' }
});
const telegramClient = new TelegramBotApiClient(syntheticBotToken, { fetchImpl: fakeTelegramFetch });
await assert.rejects(() => telegramClient.getMe(), (error) => {
  const errorText = String(error?.message ?? error);
  for (const value of privateValues) assert(!errorText.includes(value), `Telegram error leaked private fixture: ${value.slice(0, 12)}`);
  return true;
});
const config = {
  toolMode: 'full', bashMode: 'safe', writeMode: 'workspace', codexSessions: 'off', connectionTest: false,
  analysisEnabled: false, continuationEnabled: true, syncCallDeadlineMode: 'bounded', syncCallDeadlineMs: 1_200_000
};
const diagnosticText = JSON.stringify(diagnosticsSnapshot(config, telemetry.snapshot(), [], [], 0, {
  continuationFeatureEnabled: true,
  browserPaired: true,
  browserAuthState: syntheticEmail,
  telegramEnabled: true,
  telegramTokenConfigured: true,
  telegramBot: syntheticBotToken,
  telegramPaired: true,
  telegramWorkerState: syntheticCallback,
  telegramLastSuccessfulContact: syntheticChatUrl,
  runtimeGenerationId: syntheticCookie,
  runtimeDeadlineMode: 'bounded',
  runtimeDeadlineMs: 1_200_000,
  runtimeTransportState: syntheticBotUrl
}));
for (const value of privateValues) assert(!diagnosticText.includes(value), `diagnostics leaked private fixture: ${value.slice(0, 12)}`);

const privateFingerprint = 'f'.repeat(64);
const privateTokenHash = 'e'.repeat(64);
const continuationRecord = {
  schemaVersion: 1, id: 'continuation_security-smoke', workspaceId: 'ws_security', workspaceRoot: 'C:\\private\\repo',
  revision: 4, state: 'awaiting_user_send', title: 'Security smoke', completedEvidence: [], remainingWork: ['verify'],
  continuationIntents: [{ id: 'intent_security', templateKey: 'resume_all_v1', label: 'Continue', revision: 3 }],
  selectedContinuationIntentId: 'intent_security', conversationFingerprint: privateFingerprint, continuationCount: 0,
  outstandingNonce: 'nonce_private_security', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
  dispatchAuthorization: {
    tokenHash: privateTokenHash, source: 'telegram', authorizedAt: new Date(0).toISOString(),
    expiresAt: new Date(30_000).toISOString(), routeFingerprint: privateFingerprint
  }
};
const publicText = JSON.stringify(publicContinuationRecord(continuationRecord));
for (const value of [privateFingerprint, privateTokenHash, continuationRecord.outstandingNonce, continuationRecord.workspaceRoot]) {
  assert(!publicText.includes(value), `public continuation record leaked private state: ${String(value).slice(0, 12)}`);
}

for (const phrase of [
  'malicious ChatGPT page', 'extension compromise', 'pairing', 'replay', 'browser profile', 'Telegram',
  'automatic Retry', 'approval', 'rate limit', 'conversation output'
]) assert(security.toLowerCase().includes(phrase.toLowerCase()), `SECURITY.md missing threat boundary: ${phrase}`);
for (const phrase of ['human-gated', 'no output scraping', 'no automatic submission', 'manual authentication']) {
  assert(decisions.toLowerCase().includes(phrase.toLowerCase()), `DECISIONS.md missing browser-continuation decision: ${phrase}`);
}

const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert(packageJson.scripts.smoke.includes('continuation-security-smoke.mjs'), 'full smoke does not include continuation security gate');
console.log('continuation security smoke passed');
