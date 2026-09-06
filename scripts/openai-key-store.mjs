import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function openAiRuntimeKeyFile(homeDir) {
  return path.join(homeDir, 'secrets', 'openai-runtime-key');
}

function hardenWindowsSecretPath(target, directory = false) {
  const identity = process.env.USERDOMAIN && process.env.USERNAME
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : spawnSync('whoami', [], { encoding: 'utf8', windowsHide: true }).stdout.trim();
  if (!identity) throw new Error('Could not determine the current Windows user for secret-file ACLs.');
  const access = directory ? '(OI)(CI)F' : 'F';
  const result = spawnSync('icacls', [
    target, '/inheritance:r', '/grant:r',
    `${identity}:${access}`,
    `*S-1-5-18:${access}`,
    `*S-1-5-32-544:${access}`
  ], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`Could not restrict secret-file ACLs: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}
export function saveOpenAiRuntimeKey(homeDir, secret) {
  const value = String(secret ?? '').trim();
  if (!value) throw new Error('OpenAI runtime API key cannot be empty.');
  const filePath = openAiRuntimeKeyFile(homeDir);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') hardenWindowsSecretPath(dir, true);
  else fs.chmodSync(dir, 0o700);

  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, `${value}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    if (process.platform === 'win32') hardenWindowsSecretPath(tmp, false);
    else fs.chmodSync(tmp, 0o600);
    if (process.platform === 'win32') fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, filePath);
    if (process.platform === 'win32') hardenWindowsSecretPath(filePath, false);
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
  return filePath;
}

async function readHiddenSecret(input, output, promptText) {
  if (!input.isTTY) {
    let value = '';
    for await (const chunk of input) value += chunk;
    return value.trim();
  }
  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw);
    let value = '';
    const cleanup = () => {
      input.off('data', onData);
      if (input.setRawMode) input.setRawMode(wasRaw);
      input.pause();
    };
    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\u0003') {
          output.write('\n');
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\r' || ch === '\n') {
          output.write('\n');
          cleanup();
          resolve(value.trim());
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    output.write(promptText);
    input.setEncoding('utf8');
    if (input.setRawMode) input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

export async function runOpenAiKeyCommand({
  homeDir,
  argv = [],
  env = process.env,
  input = process.stdin,
  output = process.stdout
}) {
  const action = argv[0] ?? 'save';
  if (action === '--help' || action === 'help') {
    output.write('Usage: codexpro openai-key save\n');
    return;
  }
  if (action !== 'save') throw new Error('openai-key supports only: save');
  const fromEnv = env.CONTROL_PLANE_API_KEY || env.OPENAI_API_KEY || '';
  const secret = fromEnv || await readHiddenSecret(input, output, 'OpenAI runtime API key (input hidden): ');
  const filePath = saveOpenAiRuntimeKey(homeDir, secret);
  output.write(`OK Saved OpenAI runtime API key to protected file: ${filePath}\n`);
  output.write('   CodexPro profiles never store the key value.\n');
}
export function resolveOpenAiRuntimeKey(homeDir, env = process.env) {
  if (env.CONTROL_PLANE_API_KEY) {
    return { reference: 'env:CONTROL_PLANE_API_KEY', description: 'CONTROL_PLANE_API_KEY is set' };
  }
  if (env.OPENAI_API_KEY) {
    return { reference: 'env:OPENAI_API_KEY', description: 'OPENAI_API_KEY is set' };
  }

  const filePath = openAiRuntimeKeyFile(homeDir);
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { reference: '', description: `refusing non-regular key file: ${filePath}` };
    }
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      return { reference: '', description: `key file permissions are too broad; run chmod 600 ${filePath}` };
    }
    if (stat.size <= 1) {
      return { reference: '', description: `key file is empty: ${filePath}` };
    }
    return { reference: `file:${filePath}`, description: `protected key file ${filePath}` };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { reference: '', description: 'run codexpro openai-key save once' };
    }
    return { reference: '', description: error instanceof Error ? error.message : String(error) };
  }
}
