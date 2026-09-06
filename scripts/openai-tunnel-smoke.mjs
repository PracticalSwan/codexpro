import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { runOpenAiKeyCommand } from './openai-key-store.mjs';

function run(args, env) {
  const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], {
    cwd: path.resolve('.'),
    env,
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`codexpro ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

function runFail(args, env) {
  const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], {
    cwd: path.resolve('.'), env, encoding: 'utf8'
  });
  if (result.status === 0) throw new Error(`expected failure: codexpro ${args.join(' ')}`);
  return `${result.stdout}\n${result.stderr}`;
}

function runWithInput(args, env, input) {
  const result = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], {
    cwd: path.resolve('.'), env, input, encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`codexpro ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return `${result.stdout}\n${result.stderr}`;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close(() => port ? resolve(port) : reject(new Error('no free port')));
    });
    server.on('error', reject);
  });
}

async function writeNodeExecutable(filePath, lines) {
  await fs.writeFile(filePath, lines.join('\n'), { mode: 0o700 });
  if (process.platform !== 'win32') return filePath;
  const cmdPath = path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.cmd`);
  await fs.writeFile(cmdPath, `@echo off\r\n"${process.execPath}" "${filePath}" %*\r\n`, 'utf8');
  return cmdPath;
}

async function readProfile(root, home) {
  const realRoot = await fs.realpath(root);
  const id = createHash('sha256').update(realRoot).digest('hex').slice(0, 24);
  return JSON.parse(await fs.readFile(path.join(home, 'profiles', `${id}.json`), 'utf8'));
}

async function runtimeStatusPath(root, home) {
  const realRoot = await fs.realpath(root);
  const id = createHash('sha256').update(realRoot).digest('hex').slice(0, 24);
  return path.join(home, 'runtime', `${id}.json`);
}

async function waitForJson(filePath, predicate, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (predicate(data)) return data;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label}: ${lastError?.message ?? 'predicate not met'}`);
}

async function waitForFile(filePath, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await fs.readFile(filePath, 'utf8'); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-root-'));
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-home-'));
const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-fixture-'));
const env = { ...process.env, CODEXPRO_HOME: home };
const noProfileRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-default-root-'));
const noProfileHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-default-home-'));
const defaultFailure = runFail(['start', '--root', noProfileRoot, '--no-profile', '--headless'], {
  ...process.env,
  CODEXPRO_HOME: noProfileHome,
  CONTROL_PLANE_API_KEY: 'fake-default-key'
});
if (!/--openai-tunnel-id must match tunnel_<32 lowercase hexadecimal/i.test(defaultFailure)) {
  throw new Error(`no-profile codexpro start did not default to OpenAI tunnel mode:
${defaultFailure}`);
}

const promptHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-openai-prompt-home-'));
const promptInput = new PassThrough();
promptInput.isTTY = true;
promptInput.isRaw = false;
promptInput.setRawMode = (enabled) => { promptInput.isRaw = enabled; return promptInput; };
let promptOutput = '';
const promptSave = runOpenAiKeyCommand({
  homeDir: promptHome,
  argv: ['save'],
  env: { ...process.env, CONTROL_PLANE_API_KEY: '', OPENAI_API_KEY: '' },
  input: promptInput,
  output: { write: (chunk) => { promptOutput += String(chunk); } }
});
promptInput.write('abc');
promptInput.write('\b');
promptInput.end('d\n');
await promptSave;
if (!promptOutput.includes('OpenAI runtime API key (masked): ***\b \b*\n')) {
  throw new Error(`interactive openai-key prompt did not render masked input/backspace: ${JSON.stringify(promptOutput)}`);
}
if (promptOutput.includes('abd')) throw new Error('interactive openai-key prompt echoed the runtime key');

const storedRuntimeKey = 'runtime-key-stored-securely-for-smoke';
const saveOutput = runWithInput(['openai-key', 'save'], { ...process.env, CODEXPRO_HOME: home, CONTROL_PLANE_API_KEY: '', OPENAI_API_KEY: '' }, `${storedRuntimeKey}\n`);
const storedRuntimeKeyPath = path.join(home, 'secrets', 'openai-runtime-key');
if ((await fs.readFile(storedRuntimeKeyPath, 'utf8')).trim() !== storedRuntimeKey) {
  throw new Error('openai-key save did not persist the supplied runtime key');
}
if (saveOutput.includes(storedRuntimeKey)) throw new Error('openai-key save echoed the runtime key');
if (process.platform !== 'win32') {
  const mode = (await fs.stat(storedRuntimeKeyPath)).mode & 0o777;
  if (mode !== 0o600) throw new Error(`openai-key file mode must be 0600, got ${mode.toString(8)}`);
}

const tunnelId = 'tunnel_0123456789abcdef0123456789abcdef';
const fallbackHost = 'codexpro-fallback.ngrok-free.app';
const token = 'codexpro-openai-local-token-0123456789abcdef';
const argsFile = path.join(fixtureDir, 'tunnel-client-args.json');
const envFile = path.join(fixtureDir, 'tunnel-client-env.json');

const fakeTunnelClient = await writeNodeExecutable(path.join(fixtureDir, 'fake-tunnel-client.mjs'), [
  '#!/usr/bin/env node',
  "import fs from 'node:fs';",
  "import http from 'node:http';",
  "const args = process.argv.slice(2);",
  "if (args.includes('--version')) { console.log('0.0.11+fake'); process.exit(0); }",
  "if (args[0] !== 'run') { console.error('expected run'); process.exit(2); }",
  "fs.writeFileSync(process.env.CODEXPRO_FAKE_TUNNEL_ARGS, JSON.stringify(args));",
  "fs.writeFileSync(process.env.CODEXPRO_FAKE_TUNNEL_ENV, JSON.stringify({ auth: process.env.CODEXPRO_TUNNEL_MCP_AUTH_HEADER, runtimeKeyPresent: Boolean(process.env.CONTROL_PLANE_API_KEY) }));",
  "const healthIndex = args.indexOf('--health.url-file');",
  "if (healthIndex < 0 || !args[healthIndex + 1]) process.exit(3);",
  "const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/plain' }); res.end(req.url === '/readyz' ? 'ready' : 'live'); });",
  "server.listen(0, '127.0.0.1', () => { const address = server.address(); fs.writeFileSync(args[healthIndex + 1], `http://127.0.0.1:${address.port}`); });",
  "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
  "setInterval(() => {}, 1000);",
  ''
]);


const fakeNgrok = await writeNodeExecutable(path.join(fixtureDir, 'fake-ngrok.mjs'), [
  '#!/usr/bin/env node',
  "if (process.argv.includes('version')) { console.log('ngrok version fake'); process.exit(0); }",
  "process.exit(0);",
  ''
]);

run([
  'settings', 'set', '--root', root,
  '--tunnel', 'ngrok',
  '--hostname', fallbackHost,
  '--ngrok-config', 'fallback-ngrok.yml'
], env);

run([
  'settings', 'set', '--root', root,
  '--tunnel', 'openai',
  '--openai-tunnel-id', tunnelId,
  '--tunnel-client', fakeTunnelClient
], { ...env, CONTROL_PLANE_API_KEY: 'runtime-key-must-not-be-saved' });

const profile = await readProfile(root, home);
if (profile.tunnel !== 'openai' || profile.openaiTunnelId !== tunnelId || profile.tunnelClient !== fakeTunnelClient) {
  throw new Error(`OpenAI settings were not persisted correctly: ${JSON.stringify(profile)}`);
}
if (profile.ngrokFallbackHostname !== fallbackHost || !profile.ngrokFallbackConfig?.endsWith('fallback-ngrok.yml')) {
  throw new Error(`ngrok fallback was not preserved during migration: ${JSON.stringify(profile)}`);
}
if (JSON.stringify(profile).includes('runtime-key-must-not-be-saved')) {
  throw new Error('OpenAI runtime API key leaked into the CodexPro profile');
}
if (JSON.stringify(profile).includes(storedRuntimeKey)) throw new Error('persisted OpenAI runtime API key leaked into the CodexPro profile');

const invalid = runFail(['settings', 'set', '--root', root, '--tunnel', 'openai', '--openai-tunnel-id', 'tunnel_BAD'], env);
if (!/tunnel_<32 lowercase hexadecimal/i.test(invalid)) throw new Error(`invalid tunnel id failed unclearly:\n${invalid}`);


const fallbackDoctorPort = await getFreePort();
const fallbackDoctor = run(['doctor', '--root', root, '--tunnel', 'ngrok', '--ngrok', fakeNgrok, '--port', String(fallbackDoctorPort)], env);
if (!fallbackDoctor.includes(fallbackHost)) {
  throw new Error(`ngrok fallback hostname was not reused by doctor:
${fallbackDoctor}`);
}

const port = await getFreePort();
const runtimePath = await runtimeStatusPath(root, home);
const child = spawn(process.execPath, [
  'scripts/codexpro.mjs', 'start',
  '--root', root,
  '--tunnel', 'openai',
  '--openai-tunnel-id', tunnelId,
  '--tunnel-client', fakeTunnelClient,
  '--port', String(port),
  '--token', token,
  '--no-copy-url'
], {
  cwd: path.resolve('.'),
  env: {
    ...env,
    CONTROL_PLANE_API_KEY: '',
    OPENAI_API_KEY: '',
    CODEXPRO_FAKE_TUNNEL_ARGS: argsFile,
    CODEXPRO_FAKE_TUNNEL_ENV: envFile,
    NO_COLOR: '1'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });

try {
  const runtime = await waitForJson(
    runtimePath,
    (data) => data.tunnel === 'openai' && data.endpoint === tunnelId,
    'OpenAI runtime status'
  );
  if (!Number.isInteger(runtime.runtimePid)) throw new Error(`runtime child pid missing: ${JSON.stringify(runtime)}`);

  const tunnelArgs = JSON.parse(await waitForFile(argsFile, 'fake tunnel-client args'));
  const tunnelEnv = JSON.parse(await waitForFile(envFile, 'fake tunnel-client env'));
  const joinedArgs = tunnelArgs.join(' ');
  for (const expected of [
    'run', '--control-plane.tunnel-id', tunnelId,
    '--control-plane.api-key', `file:${storedRuntimeKeyPath}`,
    '--mcp.server-url', `channel=main,url=http://127.0.0.1:${port}/mcp`,
    '--mcp.extra-headers', 'Authorization: env:CODEXPRO_TUNNEL_MCP_AUTH_HEADER',
    '--mcp.discovery-extra-headers', 'Authorization: env:CODEXPRO_TUNNEL_MCP_AUTH_HEADER',
    '--health.listen-addr', '127.0.0.1:0', '--health.url-file'
  ]) {
    if (!joinedArgs.includes(expected)) throw new Error(`tunnel-client argv missing ${expected}: ${JSON.stringify(tunnelArgs)}`);
  }
  if (joinedArgs.includes(token)) throw new Error(`raw CodexPro token leaked into tunnel-client argv: ${joinedArgs}`);
  if (tunnelEnv.auth !== `Bearer ${token}` || tunnelEnv.runtimeKeyPresent !== false) {
    throw new Error(`tunnel-client environment contract mismatch: ${JSON.stringify(tunnelEnv)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const expected of ['OpenAI Secure MCP Tunnel', 'Connection: Tunnel', tunnelId, 'ready']) {
    if (!output.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`OpenAI ready output missing ${expected}\n${output}`);
    }
  }
  if (output.includes(storedRuntimeKey) || output.includes(token)) {
    throw new Error(`launcher output leaked a secret\n${output}`);
  }
} finally {
  child.stdin.end('q\n');
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 5000))
  ]);
}

const fallbackProfile = await readProfile(root, home);
if (fallbackProfile.ngrokFallbackHostname !== fallbackHost) {
  throw new Error(`ngrok fallback metadata disappeared: ${JSON.stringify(fallbackProfile)}`);
}

console.log('âœ“ OpenAI Secure MCP Tunnel smoke test passed');
