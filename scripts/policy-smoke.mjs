import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { WORKSPACE_POLICY_FILE, applyWorkspacePolicy, loadWorkspacePolicy } from '../dist/policyOps.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class McpStdioClient {
  constructor(command, args, options) {
    this.child = spawn(command, args, options);
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
    this.child.stdout.on('data', (chunk) => this.onData(String(chunk)));
    this.child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    this.child.on('exit', (code) => {
      for (const { reject } of this.pending.values()) reject(new Error(`server exited ${code}`));
    });
  }
  onData(chunk) {
    this.buffer += chunk;
    for (;;) {
      const index = this.buffer.indexOf('\n');
      if (index < 0) return;
      const line = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id);
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(new Error(msg.error.message));
        else pending.resolve(msg.result);
      }
    }
  }
  request(method, params) {
    const id = this.nextId++;
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15000);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
    });
  }
  notify(method, params = {}) {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }
  close() { this.child.kill('SIGTERM'); }
}

const missingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-missing-'));
assert(await loadWorkspacePolicy(missingRoot) === null, 'missing policy changed behavior');

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-'));
const config = { ...loadConfig(['--root', root, '--allow-root', root, '--bash', 'full', '--write', 'workspace', '--tool-mode', 'full', '--codex-sessions', 'read']), goalsEnabled: true, maxGoals: 100, maxGoalTasks: 50, maxGoalWorkers: 6 };
const policy = {
  version: 1,
  blockedGlobs: ['private/**'],
  importantFiles: ['AGENTS.md'],
  recommendedVerification: ['npm run smoke'],
  bashMode: 'safe',
  writeMode: 'handoff',
  toolMode: 'standard',
  codexSessions: 'metadata',
  analysisEnabled: false,
  goalsEnabled: false,
  limits: {
    maxReadBytes: 8000,
    maxWriteBytes: 9000,
    maxOutputBytes: 4000,
    maxBashObservedOutputBytes: 5000,
    maxBashTimeoutMs: 5000,
    maxImportBytes: 10000,
    maxGoals: 10,
    maxGoalTasks: 12,
    maxGoalWorkers: 2,
    maxSearchResults: 10
  }
};
await fs.writeFile(path.join(root, WORKSPACE_POLICY_FILE), JSON.stringify(policy, null, 2));
const loaded = await loadWorkspacePolicy(root);
assert(loaded?.version === 1, 'valid policy was not loaded');
const effective = applyWorkspacePolicy(config, loaded);
assert(effective.bashMode === 'safe' && effective.writeMode === 'handoff' && effective.toolMode === 'standard', 'policy did not tighten runtime modes');
assert(effective.codexSessions === 'metadata' && effective.analysisEnabled === false && effective.goalsEnabled === false, 'policy did not tighten optional capabilities');
assert(effective.maxReadBytes === 8000 && effective.maxOutputBytes === 4000 && effective.maxSearchResults === 10, 'policy did not lower resource ceilings');
assert(effective.maxGoals === 10 && effective.maxGoalTasks === 12 && effective.maxGoalWorkers === 2, 'policy did not lower Goal ceilings');
assert(effective.blockedGlobs.includes('private/**'), 'policy blocked glob was not added');
assert(JSON.stringify(effective.allowedRoots) === JSON.stringify(config.allowedRoots), 'policy broadened allowed roots');
assert(effective.authToken === config.authToken, 'policy changed HTTP authority');

const restrictive = { ...config, bashMode: 'off', writeMode: 'off', toolMode: 'minimal', codexSessions: 'off', analysisEnabled: false, goalsEnabled: false, maxReadBytes: 4096 };
const attemptedBroadening = applyWorkspacePolicy(restrictive, {
  version: 1,
  bashMode: 'full', writeMode: 'workspace', toolMode: 'full', codexSessions: 'read', analysisEnabled: true, goalsEnabled: true,
  limits: { maxReadBytes: 500000, maxGoals: 500, maxGoalTasks: 200, maxGoalWorkers: 8 }
});
assert(attemptedBroadening.bashMode === 'off' && attemptedBroadening.writeMode === 'off' && attemptedBroadening.toolMode === 'minimal', 'policy broadened a disabled capability');
assert(attemptedBroadening.codexSessions === 'off' && attemptedBroadening.analysisEnabled === false && attemptedBroadening.goalsEnabled === false && attemptedBroadening.maxReadBytes === 4096, 'policy broadened a resource/capability ceiling');
assert(attemptedBroadening.maxGoals === restrictive.maxGoals && attemptedBroadening.maxGoalTasks === restrictive.maxGoalTasks && attemptedBroadening.maxGoalWorkers === restrictive.maxGoalWorkers, 'policy broadened Goal ceilings');

const invalidRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-invalid-'));
await fs.writeFile(path.join(invalidRoot, WORKSPACE_POLICY_FILE), JSON.stringify({ version: 1, allowedRoots: ['C:/'] }));
await assertRejects(() => loadWorkspacePolicy(invalidRoot), /invalid workspace policy|unrecognized|allowedroots/i, 'unknown authority field');

const oversizedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-oversized-'));
await fs.writeFile(path.join(oversizedRoot, WORKSPACE_POLICY_FILE), JSON.stringify({ version: 1, recommendedVerification: ['x'.repeat(70000)] }));
await assertRejects(() => loadWorkspacePolicy(oversizedRoot), /too large|65536/i, 'oversized policy');

const symlinkRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-symlink-'));
const policyTarget = path.join(symlinkRoot, 'real-policy.json');
await fs.writeFile(policyTarget, JSON.stringify({ version: 1 }));
try {
  await fs.symlink(policyTarget, path.join(symlinkRoot, WORKSPACE_POLICY_FILE), 'file');
  await assertRejects(() => loadWorkspacePolicy(symlinkRoot), /symlink/i, 'symlinked policy');
} catch (error) {
  if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
}

const secondaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-policy-secondary-'));
await fs.writeFile(path.join(secondaryRoot, WORKSPACE_POLICY_FILE), JSON.stringify({ version: 1, toolMode: 'minimal', writeMode: 'off', bashMode: 'off' }, null, 2));
await fs.writeFile(path.join(secondaryRoot, 'visible.txt'), 'secondary workspace\n', 'utf8');

const client = new McpStdioClient('node', ['dist/stdio.js', '--root', root, '--allow-root', root, '--allow-root', secondaryRoot, '--bash', 'full', '--write', 'workspace', '--tool-mode', 'full', '--codex-sessions', 'read'], {
  cwd: path.resolve('.'),
  env: { ...process.env, CODEXPRO_ROOT: root, CODEXPRO_ALLOWED_ROOTS: root, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1' }
});
await client.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codexpro-policy-smoke', version: '0.1.0' } });
client.notify('notifications/initialized');
const tools = await client.request('tools/list', {});
const names = tools.tools.map((tool) => tool.name);
assert(names.includes('effective_policy'), `effective_policy missing: ${names.join(', ')}`);
assert(!names.includes('write') && !names.includes('edit') && !names.includes('apply_patch') && !names.includes('import_file'), `policy did not hide write tools: ${names.join(', ')}`);
assert(names.includes('bash'), 'safe bash should remain visible');
assert(!names.includes('read_codex_session'), 'metadata policy should hide transcript reads');
const exposed = await client.request('tools/call', { name: 'effective_policy', arguments: {} });
assert(exposed.structuredContent.policy_present === true, 'effective_policy did not report loaded policy');
assert(exposed.structuredContent.effective.writeMode === 'handoff' && exposed.structuredContent.effective.maxReadBytes === 8000, 'effective_policy exposed wrong effective values');
assert(!JSON.stringify(exposed).includes(root), 'effective_policy leaked an absolute workspace path');
const secondary = await client.request('tools/call', { name: 'open_workspace', arguments: { root: secondaryRoot, include_tree: false } });
const secondaryId = secondary.structuredContent.workspace_id;
assert(secondaryId, `secondary workspace did not open: ${JSON.stringify(secondary)}`);
const secondaryTree = await client.request('tools/call', { name: 'tree', arguments: { workspace_id: secondaryId } });
assert(secondaryTree.isError === true && /disabled by the effective policy/i.test(JSON.stringify(secondaryTree)), `secondary minimal policy did not block a globally advertised standard tool: ${JSON.stringify(secondaryTree)}`);
const secondaryPolicy = await client.request('tools/call', { name: 'effective_policy', arguments: { workspace_id: secondaryId } });
assert(secondaryPolicy.structuredContent.effective.toolMode === 'minimal' && secondaryPolicy.structuredContent.effective.bashMode === 'off', 'secondary effective policy was not resolved independently');
client.close();
console.log('? workspace policy smoke test passed');

async function assertRejects(fn, pattern, label) {
  try {
    await fn();
  } catch (error) {
    if (pattern.test(String(error?.message ?? error))) return;
    throw new Error(`${label} failed for wrong reason: ${error?.message ?? error}`);
  }
  throw new Error(`${label} was accepted`);
}
