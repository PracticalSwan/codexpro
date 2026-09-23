import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
    server.on('error', reject);
  });
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-doctor-smoke-'));
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-doctor-home-'));
let invalidRoot;
try {
  const port = await getFreePort();
  const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
  for (const args of [['--version'], ['-v'], ['version'], ['start', '--version']]) {
    const version = spawnSync(process.execPath, ['scripts/codexpro.mjs', ...args], {
      cwd: path.resolve('.'),
      env: { ...process.env, CODEXPRO_HOME: home },
      encoding: 'utf8'
    });
    if (version.status !== 0 || version.stdout.trim() !== packageJson.version) {
      throw new Error(`codexpro ${args.join(' ')} did not print version ${packageJson.version}\nstdout:\n${version.stdout}\nstderr:\n${version.stderr}`);
    }
  }
  const result = spawnSync(process.execPath, [
    'scripts/codexpro.mjs',
    'doctor',
    '--root',
    root,
    '--port',
    String(port),
    '--tunnel',
    'none'
  ], {
    cwd: path.resolve('.'),
    env: { ...process.env, CODEXPRO_HOME: home },
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(`doctor failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  const output = `${result.stdout}\n${result.stderr}`;
  for (const expected of ['CodexPro doctor', 'Node', 'Build artifacts', 'Local port', 'Ready']) {
    if (!output.includes(expected)) {
      throw new Error(`doctor output missing ${expected}\n${output}`);
    }
  }

  // A live runtime from this workspace is not an unrelated port conflict.
  const ownRoot = await fs.realpath(root);
  const ownId = createHash('sha256').update(ownRoot).digest('hex').slice(0, 24);
  const runtimeFile = path.join(home, 'runtime', `${ownId}.json`);
  const busyServer = net.createServer();
  await new Promise((resolve, reject) => {
    busyServer.once('error', reject);
    busyServer.listen(0, '127.0.0.1', resolve);
  });
  const busyPort = busyServer.address().port;
  const startProbe = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-Process -Id ${process.pid}).StartTime.ToUniversalTime().Ticks`], { encoding: 'utf8' })
    : spawnSync('ps', ['-o', 'lstart=', '-p', String(process.pid)], { encoding: 'utf8' });
  if (startProbe.status !== 0 || !startProbe.stdout.trim()) throw new Error('Could not establish test process identity');
  const ownedRuntime = {
    version: 1, root: ownRoot, pid: process.pid,
    pidStartKey: process.platform === 'win32' ? `win:${startProbe.stdout.trim()}` : `${process.platform}:${startProbe.stdout.trim()}`,
    runtimePid: process.pid, runtimePidStartKey: process.platform === 'win32' ? `win:${startProbe.stdout.trim()}` : `${process.platform}:${startProbe.stdout.trim()}`,
    transportState: 'ready', localBase: `http://127.0.0.1:${busyPort}`
  };
  await fs.mkdir(path.dirname(runtimeFile), { recursive: true });
  await fs.writeFile(runtimeFile, JSON.stringify(ownedRuntime), 'utf8');
  const doctorAt = (portNumber) => spawnSync(process.execPath, [
    'scripts/codexpro.mjs', 'doctor', '--root', root, '--port', String(portNumber), '--tunnel', 'none'
  ], { cwd: path.resolve('.'), env: { ...process.env, CODEXPRO_HOME: home }, encoding: 'utf8' });
  try {
    const runningDoctor = doctorAt(busyPort);
    if (runningDoctor.status !== 0 || !runningDoctor.stdout.includes('Existing runtime detected')) {
      throw new Error(`doctor misclassified the existing runtime as a port blocker\n${runningDoctor.stdout}\n${runningDoctor.stderr}`);
    }
    await fs.writeFile(runtimeFile, JSON.stringify({ ...ownedRuntime, pid: 999999 }), 'utf8');
    const staleDoctor = doctorAt(busyPort);
    if (staleDoctor.status === 0 || !staleDoctor.stdout.includes('Local port')) {
      throw new Error('doctor incorrectly accepted a port used by an unrelated process');
    }
  } finally {
    await new Promise((resolve, reject) => busyServer.close((error) => error ? reject(error) : resolve()));
  }

  invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-doctor-invalid-'));
  const invalidRealRoot = await fs.realpath(invalidRoot);
  const invalidId = createHash('sha256').update(invalidRealRoot).digest('hex').slice(0, 24);
  await fs.mkdir(path.join(home, 'profiles'), { recursive: true });
  await fs.writeFile(path.join(home, 'profiles', `${invalidId}.json`), JSON.stringify({
    version: 1,
    root: invalidRealRoot,
    updatedAt: new Date().toISOString(),
    tunnel: 'none',
    bash: 'banana',
    write: 'banana',
    toolMode: 'banana'
  }, null, 2), 'utf8');
  const invalidDoctor = spawnSync(process.execPath, [
    'scripts/codexpro.mjs',
    'doctor',
    '--root',
    invalidRoot,
    '--port',
    String(await getFreePort())
  ], {
    cwd: path.resolve('.'),
    env: { ...process.env, CODEXPRO_HOME: home },
    encoding: 'utf8'
  });
  const invalidOutput = `${invalidDoctor.stdout}\n${invalidDoctor.stderr}`;
  if (invalidDoctor.status === 0 || !invalidOutput.includes('Bash mode') || !invalidOutput.includes('Write mode') || !invalidOutput.includes('Tool mode')) {
    throw new Error(`doctor did not reject invalid saved profile\nstdout:\n${invalidDoctor.stdout}\nstderr:\n${invalidDoctor.stderr}`);
  }

} finally {
  await Promise.all([
    fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    fs.rm(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    ...(invalidRoot ? [fs.rm(invalidRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })] : [])
  ]);
}
console.log('✓ doctor smoke test passed');
