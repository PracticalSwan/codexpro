import { spawn } from 'node:child_process';

// Keep the Windows record locked until the parent starts its retry probe.
export async function withWindowsExclusiveLock(filePath, holdMs, operation) {
  if (process.platform !== 'win32') throw new Error('Windows-only lock fixture');
  const escaped = filePath.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'; $f=[System.IO.File]::Open('${escaped}',[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None); try { [Console]::Out.WriteLine('LOCKED'); [Console]::Out.Flush(); if ([Console]::In.ReadLine() -ne 'RELEASE') { throw 'missing release signal' } } finally { $f.Dispose() }`;
  const shell = process.env.GITHUB_ACTIONS === 'true' ? 'pwsh' : 'powershell.exe';
  const child = spawn(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
  });
  let errorOutput = '';
  child.stderr.on('data', (data) => { errorOutput = (errorOutput + String(data)).slice(-2_000); });
  child.stdin.on('error', (error) => { errorOutput = (errorOutput + `; stdin: ${error.message}`).slice(-2_000); });
  const ready = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error); else resolve();
    };
    const timeout = setTimeout(() => finish(new Error(`lock fixture did not become ready in 30s (${shell}; ${errorOutput})`)), 30_000);
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += String(data); if (stdout.includes('LOCKED')) finish(); });
    child.once('error', (error) => finish(error));
    child.once('exit', (code) => finish(new Error(`lock fixture exited before readiness: ${code}; ${errorOutput}`)));
  });
  let releaseTimer;
  try {
    await ready;
    const started = Date.now();
    releaseTimer = setTimeout(() => child.stdin.end('RELEASE\n'), holdMs);
    const value = await operation();
    return { value, elapsedMs: Date.now() - started };
  } finally {
    clearTimeout(releaseTimer);
    if (!child.stdin.destroyed) child.stdin.end('RELEASE\n');
    let exitTimeout;
    const code = await Promise.race([
      child.exitCode !== null ? Promise.resolve(child.exitCode) : new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => {
        exitTimeout = setTimeout(() => { child.kill(); resolve(null); }, 8_000);
      })
    ]);
    clearTimeout(exitTimeout);
    if (code === null) throw new Error(`lock fixture failed to exit after release (${shell}; ${errorOutput})`);
    if (code !== 0) throw new Error(`lock fixture exited ${code} (${shell}; ${errorOutput})`);
  }
}
