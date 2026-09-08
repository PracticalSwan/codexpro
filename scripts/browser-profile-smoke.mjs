import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { discoverBrowserExecutable, resolveManagedBrowserProfile, classifyBrowserAuthState, browserProfileStatus, writeBrowserProfileMetadata } from '../dist/continuation/browserProfile.js';
import { buildManagedBrowserArgs, launchManagedBrowser, managedBrowserProcessStartIdentity } from '../dist/continuation/browserLauncher.js';
import { BrowserPairingStore } from '../dist/continuation/browserAuth.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-browser-workspace-'));
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-browser-home-'));
const fakeExe = path.join(home, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
const cliEnv = { ...process.env, CODEXPRO_HOME: home, CODEXPRO_CONTINUATION_ENABLED: '1' };
function runCli(args, expectSuccess = true) {
  const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (expectSuccess && result.status !== 0) throw new Error(`CLI failed: ${args.join(' ')}\n${output}`);
  if (!expectSuccess && result.status === 0) throw new Error(`CLI unexpectedly succeeded: ${args.join(' ')}\n${output}`);
  return output;
}
await fs.writeFile(fakeExe, 'fixture');
try {
  const discovered = discoverBrowserExecutable({ browser: 'chrome', override: fakeExe });
  assert.equal(discovered, path.resolve(fakeExe));
  assert.throws(() => discoverBrowserExecutable({ browser: 'firefox' }), /unsupported browser/i);
  assert.throws(() => discoverBrowserExecutable({ browser: 'chrome', override: path.join(home, 'missing.exe') }), /not found/i);

  const profile = resolveManagedBrowserProfile({ homeDir: home, profileLabel: 'default', browser: 'chrome', sourceRoots: [root] });
  assert(profile.userDataDir.startsWith(path.join(home, 'browser', 'chatgpt', 'default')));
  assert(!profile.userDataDir.includes(path.join('Google', 'Chrome', 'User Data')));
  assert.throws(() => resolveManagedBrowserProfile({ homeDir: home, profileLabel: '../escape', browser: 'chrome', sourceRoots: [root] }), /profile label/i);
  assert.throws(() => resolveManagedBrowserProfile({ homeDir: root, profileLabel: 'inside', browser: 'chrome', sourceRoots: [root] }), /source workspace/i);
  const extensionPath = path.resolve('browser-extension');
  const args = buildManagedBrowserArgs({ profile, extensionPath, url: 'https://chatgpt.com/' });
  assert(args.includes(`--user-data-dir=${profile.userDataDir}`));
  assert(!args.some((arg) => arg.startsWith('--load-extension=')), 'branded-browser default must not use removed --load-extension flag');
  assert(!args.some((arg) => arg.startsWith('--disable-extensions-except=')), 'branded-browser default must not use removed --disable-extensions-except flag');
  const testBrowserArgs = buildManagedBrowserArgs({ profile, extensionPath, url: 'https://chatgpt.com/', allowCommandLineExtensionLoad: true });
  assert(testBrowserArgs.includes(`--load-extension=${extensionPath}`));
  assert(testBrowserArgs.includes(`--disable-extensions-except=${extensionPath}`));
  assert(args.includes('https://chatgpt.com/'));
  const joined = args.join(' ');
  for (const forbidden of ['remote-debugging', 'disable-web-security', 'no-sandbox', '--profile-directory', 'User Data']) assert(!joined.includes(forbidden), `launcher args contain forbidden option ${forbidden}`);

  assert.equal(classifyBrowserAuthState({ url: 'https://chatgpt.com/', composerAvailable: true, loginVisible: false }), 'signed_in');
  assert.equal(classifyBrowserAuthState({ url: 'https://chatgpt.com/auth/login', composerAvailable: false, loginVisible: true }), 'signed_out');
  assert.equal(classifyBrowserAuthState({ url: 'https://chatgpt.com/', composerAvailable: true, loginVisible: true }), 'ambiguous');
  assert.equal(classifyBrowserAuthState({ url: 'https://chatgpt.com/auth/login', composerAvailable: false, loginVisible: true, previousAuthState: 'signed_in' }), 'authentication_required');
  assert.equal(classifyBrowserAuthState({ url: 'https://chatgpt.com/', composerAvailable: false, loginVisible: false }), 'unknown');

  let spawnCalls = 0;
  const launched = await launchManagedBrowser({ executable: fakeExe, profile, extensionPath, spawnBrowser: () => { spawnCalls += 1; return { pid: 4242 }; }, pidAlive: (pid) => pid === 4242, processIdentity: (pid) => pid === 4242 ? 'test:owned' : null });
  assert.equal(launched.pid, 4242);
  assert.equal(spawnCalls, 1);
  const reused = await launchManagedBrowser({ executable: fakeExe, profile, extensionPath, spawnBrowser: () => { throw new Error('should not respawn'); }, pidAlive: (pid) => pid === 4242, processIdentity: (pid) => pid === 4242 ? 'test:owned' : null });
  assert.equal(reused.reused, true);
  const status = await browserProfileStatus({ profile, pidAlive: (pid) => pid === 4242, processIdentity: (pid) => pid === 4242 ? 'test:owned' : null, paired: true });
  assert.deepEqual(status, { browser: 'chrome', profile_label: 'default', running: true, paired: true, auth_state: 'unknown' });
  await writeBrowserProfileMetadata(profile, { authState: 'signed_in' });
  const signedInStatus = await browserProfileStatus({ profile, pidAlive: (pid) => pid === 4242, processIdentity: (pid) => pid === 4242 ? 'test:owned' : null, paired: true });
  assert.equal(signedInStatus.auth_state, 'signed_in', 'coarse signed-in state did not persist through managed-profile metadata');
  const pidReused = await browserProfileStatus({ profile, pidAlive: () => true, processIdentity: () => 'test:other', paired: true });
  assert.equal(pidReused.running, false, 'PID reuse was mistaken for owned managed browser');
  assert.equal(pidReused.auth_state, 'unknown');
  const persisted = JSON.parse(await fs.readFile(profile.metadataFile, 'utf8'));
  assert.equal(persisted.pid, 4242);
  assert(!JSON.stringify(status).includes(profile.userDataDir), 'public browser status leaked managed profile path');

  const cleanupProfile = resolveManagedBrowserProfile({ homeDir: home, profileLabel: 'cleanup-test', browser: 'chrome', sourceRoots: [root] });
  await fs.writeFile(path.join(cleanupProfile.userDataDir, 'marker.txt'), 'cleanup target\n', 'utf8');
  const pairingStore = new BrowserPairingStore(path.join(home, 'continuation', 'browser'));
  const pairing = await pairingStore.createPairing('cleanup-test');
  const pairedClient = await pairingStore.exchangePairing('cleanup-test', pairing.code, { extensionVersion: '1.0.0' });
  const ownedIdentity = managedBrowserProcessStartIdentity(process.pid);
  assert(ownedIdentity, 'test process start identity unavailable');
  await writeBrowserProfileMetadata(cleanupProfile, { pid: process.pid, processStartKey: ownedIdentity, authState: 'signed_in' });
  const missingYes = runCli(['continuation', 'browser', 'clear-profile', '--profile', 'cleanup-test', '--root', root, '--executable', fakeExe], false);
  assert.match(missingYes, /--yes/i);
  const runningRefusal = runCli(['continuation', 'browser', 'clear-profile', '--profile', 'cleanup-test', '--root', root, '--executable', fakeExe, '--yes'], false);
  assert.match(runningRefusal, /running/i);
  await writeBrowserProfileMetadata(cleanupProfile, { pid: 999999, processStartKey: 'stale-test-process' });
  const cleared = runCli(['continuation', 'browser', 'clear-profile', '--profile', 'cleanup-test', '--root', root, '--executable', fakeExe, '--yes']);
  assert.match(cleared, /cleared|revoked/i);
  await assert.rejects(fs.stat(cleanupProfile.profileRoot), /ENOENT/);
  await fs.stat(profile.profileRoot);
  const clientsAfterClear = await pairingStore.listPublicClients();
  const clearedClient = clientsAfterClear.find((entry) => entry.client_id === pairedClient.clientId);
  assert.equal(clearedClient?.active, false, 'clear-profile did not revoke the selected managed profile client');

  const sources = (await Promise.all(['src/continuation/browserProfile.ts','src/continuation/browserLauncher.ts'].map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert(!/Google[\\/]+Chrome[\\/]+User Data|Microsoft[\\/]+Edge[\\/]+User Data/.test(sources), 'implementation searches/copies normal browser profile paths');
  console.log('browser profile smoke passed');
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
