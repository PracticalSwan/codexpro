import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { projectTrustStatus, trustProjectHooks } from '../dist/projectTrust.js';
import { runHooks } from '../dist/hooks/runner.js';
import { readGlobalHookSettings, saveGlobalHookSettings } from '../dist/hooks/globalSettings.js';

const originalCodexProHome = process.env.CODEXPRO_HOME;
const globalHookHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-global-hooks-'));
process.env.CODEXPRO_HOME = globalHookHome;
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-hooks-'));
const trustDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-trust-'));
const marker = path.join(root, 'marker.txt');
const hookPath = path.join(root, '.codexpro-hooks.json');
const hook = {
  version: 1,
  hooks: { before_tool: [{ command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`] }] }
};
await fs.writeFile(hookPath, JSON.stringify(hook));
let status = await projectTrustStatus(root, undefined, trustDir);
assert.equal(status.trusted, false);
let results = await runHooks('before_tool', { root, trustDir, input: { tool: 'write' } });
assert.equal(results[0]?.status, 'skipped');
await assert.rejects(fs.access(marker));
await trustProjectHooks(root, trustDir);
status = await projectTrustStatus(root, undefined, trustDir);
assert.equal(status.trusted, true);
results = await runHooks('before_tool', { root, trustDir, input: { tool: 'write' } });
assert.equal(results[0]?.status, 'allowed');
assert.equal(await fs.readFile(marker, 'utf8'), 'ran');
hook.hooks.before_tool = [{ command: process.execPath, args: ['-e', 'process.exit(2)'] }];
await fs.writeFile(hookPath, JSON.stringify(hook));
status = await projectTrustStatus(root, undefined, trustDir);
assert.equal(status.trusted, false, 'hook mutation should invalidate trust');
await trustProjectHooks(root, trustDir);
results = await runHooks('before_tool', { root, trustDir, input: { tool: 'write' } });
assert.equal(results[0]?.status, 'blocked');
hook.hooks.before_tool = [{ command: process.execPath, args: ['-e', 'process.exit(3)'] }];
await fs.writeFile(hookPath, JSON.stringify(hook));
await trustProjectHooks(root, trustDir);
results = await runHooks('before_tool', { root, trustDir, input: { tool: 'write' } });
assert.equal(results[0]?.status, 'warning');
process.env.CODEXPRO_HOOK_SECRET_TEST = 'hook-secret-must-not-pass';
hook.hooks.before_tool = [{ command: process.execPath, args: ['-e', "process.stdout.write(String(process.env.CODEXPRO_HOOK_SECRET_TEST ?? 'missing'))"] }];
await fs.writeFile(hookPath, JSON.stringify(hook));
await trustProjectHooks(root, trustDir);
results = await runHooks('before_tool', { root, trustDir, input: { tool: 'read' } });
assert.equal(results[0]?.status, 'allowed');
assert.match(results[0]?.message ?? '', /missing/);
assert.ok(!JSON.stringify(results).includes('hook-secret-must-not-pass'));
delete process.env.CODEXPRO_HOOK_SECRET_TEST;
hook.hooks.before_tool = [{ command: process.execPath, args: ['-e', 'process.exit(2)'] }];
await fs.writeFile(hookPath, JSON.stringify(hook));
await fs.writeFile(path.join(root, 'visible.txt'), 'visible\n');
await trustProjectHooks(root, trustDir);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', root, '--bash', 'off', '--write', 'off', '--tool-mode', 'standard'],
  env: { ...process.env, CODEXPRO_TRUST_DIR: trustDir, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1' }
});
const client = new Client({ name: 'hooks-smoke', version: '0.1.0' });
await client.connect(transport);
const exposed = await client.callTool({ name: 'project_trust_status', arguments: {} });
assert.equal(exposed.structuredContent.trusted, true);
const blocked = await client.callTool({ name: 'read', arguments: { path: 'visible.txt' } });
assert.equal(blocked.isError, true);
assert.match(JSON.stringify(blocked), /before_tool hook blocked/i);
await client.close();
const policyMarker = path.join(root, 'policy-marker.txt');
hook.hooks.before_tool = [{ command: process.execPath, args: ['-e', `require('fs').writeFileSync(${JSON.stringify(policyMarker)}, 'unexpected')`] }];
await fs.writeFile(hookPath, JSON.stringify(hook));
await fs.writeFile(path.join(root, '.codexpro-policy.json'), JSON.stringify({ version: 2, toolRules: [{ action: 'read', resource: 'visible.txt', effect: 'deny' }] }));
await trustProjectHooks(root, trustDir);
const policyTransport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', root, '--bash', 'off', '--write', 'off', '--tool-mode', 'standard'],
  env: { ...process.env, CODEXPRO_TRUST_DIR: trustDir, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1' }
});
const policyClient = new Client({ name: 'hooks-policy-smoke', version: '0.1.0' });
await policyClient.connect(policyTransport);
const policyBlocked = await policyClient.callTool({ name: 'read', arguments: { path: 'visible.txt' } });
assert.equal(policyBlocked.isError, true);
assert.match(JSON.stringify(policyBlocked), /denied by workspace policy/i);
await assert.rejects(fs.access(policyMarker));
await policyClient.close();
const globalRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-global-hook-repo-'));
for (const args of [['init'], ['config', 'user.email', 'hooks@example.invalid'], ['config', 'user.name', 'Hooks Smoke']]) {
  const git = spawnSync('git', args, { cwd: globalRoot, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr || git.stdout);
}
await fs.writeFile(path.join(globalRoot, 'safe.txt'), 'safe\n');
let git = spawnSync('git', ['add', 'safe.txt'], { cwd: globalRoot, encoding: 'utf8' });
assert.equal(git.status, 0, git.stderr || git.stdout);
assert.equal(readGlobalHookSettings(globalHookHome).stagedCommitSafety, false);
let globalResults = await runHooks('before_tool', { root: globalRoot, input: { tool: 'git_commit' } });
assert.equal(globalResults.length, 0, 'global staged-commit hook must be opt-in');
saveGlobalHookSettings({ stagedCommitSafety: true }, globalHookHome);
globalResults = await runHooks('before_tool', { root: globalRoot, input: { tool: 'git_commit' } });
assert.equal(globalResults.length, 1);
assert.equal(globalResults[0]?.status, 'allowed');
await fs.mkdir(path.join(globalRoot, 'secrets'));
await fs.writeFile(path.join(globalRoot, 'secrets', 'token.txt'), 'not-a-real-secret\n');
git = spawnSync('git', ['add', 'secrets/token.txt'], { cwd: globalRoot, encoding: 'utf8' });
assert.equal(git.status, 0, git.stderr || git.stdout);
globalResults = await runHooks('before_tool', { root: globalRoot, input: { tool: 'git_commit' } });
assert.equal(globalResults[0]?.status, 'blocked');
assert.match(globalResults[0]?.message ?? '', /Blocked staged path/i);
saveGlobalHookSettings({ stagedCommitSafety: false }, globalHookHome);
globalResults = await runHooks('before_tool', { root: globalRoot, input: { tool: 'git_commit' } });
assert.equal(globalResults.length, 0);

const dedupRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-global-hook-dedup-'));
for (const args of [['init'], ['config', 'user.email', 'hooks@example.invalid'], ['config', 'user.name', 'Hooks Smoke']]) {
  const result = spawnSync('git', args, { cwd: dedupRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
await fs.writeFile(path.join(dedupRoot, 'safe.txt'), 'safe\n');
spawnSync('git', ['add', 'safe.txt'], { cwd: dedupRoot, encoding: 'utf8' });
await fs.writeFile(path.join(dedupRoot, '.codexpro-hooks.json'), JSON.stringify({ version: 1, hooks: { before_tool: [{ command: 'node', args: ['scripts/check-staged-commit.mjs'], timeoutMs: 5000 }] } }));
await trustProjectHooks(dedupRoot, trustDir);
saveGlobalHookSettings({ stagedCommitSafety: true }, globalHookHome);
const dedupResults = await runHooks('before_tool', { root: dedupRoot, trustDir, input: { tool: 'git_commit' } });
assert.equal(dedupResults.length, 1, 'managed staged-commit project hook should be de-duplicated');
assert.equal(dedupResults[0]?.status, 'allowed');
await fs.writeFile(path.join(dedupRoot, '.codexpro-hooks.json'), JSON.stringify({ version: 1, hooks: { before_tool: [{ command: 'git', args: ['scripts/check-staged-commit.mjs'], timeoutMs: 5000 }] } }));
await trustProjectHooks(dedupRoot, trustDir);
const unrelatedResults = await runHooks('before_tool', { root: dedupRoot, trustDir, input: { tool: 'git_commit' } });
assert.equal(unrelatedResults.length, 2, 'global hook must not suppress a different trusted project command that merely names the managed script path');

const cliRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-hooks-cli-'));
const cliTrustDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-trust-cli-'));
await fs.writeFile(path.join(cliRoot, '.codexpro-hooks.json'), JSON.stringify({ version: 1, hooks: { before_tool: [] } }));
const cliHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-hooks-cli-home-'));
const cliEnv = { ...process.env, CODEXPRO_HOME: cliHome, CODEXPRO_TRUST_DIR: cliTrustDir };
let cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'trust', 'hooks', '--root', cliRoot], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'trust', 'status', '--root', cliRoot], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /Trusted\s+yes/i);
cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'hooks', 'staged-commit', 'enable'], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /Staged-commit safety\s+enabled/i);
cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'hooks', 'status'], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /Staged-commit safety\s+enabled/i);
cli = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'hooks', 'staged-commit', 'disable'], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
assert.match(cli.stdout, /Staged-commit safety\s+disabled/i);
if (originalCodexProHome === undefined) delete process.env.CODEXPRO_HOME; else process.env.CODEXPRO_HOME = originalCodexProHome;
console.log('hooks smoke passed');
