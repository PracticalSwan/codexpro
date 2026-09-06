import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { loadConfig } from '../dist/config.js';
import { WorkspaceManager, PathGuard } from '../dist/guard.js';
import { ContextCache } from '../dist/contextCache.js';
import { gatherContextV2, prepareSubtaskContext } from '../dist/contextOps.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-context-v2-'));
await fs.mkdir(path.join(root, 'src'), { recursive: true });
await fs.mkdir(path.join(root, 'test'), { recursive: true });
await fs.writeFile(path.join(root, 'AGENTS.md'), '# Instructions\n\nKeep changes focused.\n');
await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export function alpha() { return 1; }\n');
await fs.writeFile(path.join(root, 'src', 'b.ts'), "import { alpha } from './a.js';\nexport const beta = alpha();\n");
await fs.writeFile(path.join(root, 'test', 'a.test.ts'), "import { alpha } from '../src/a.js';\nalpha();\n");
spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
const config = { ...loadConfig(['--root', root, '--allow-root', root, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full']), analysisEnabled: true };
const workspace = new WorkspaceManager(config).defaultWorkspace();
const guard = new PathGuard(config);
const cache = new ContextCache(8);
const first = await gatherContextV2({ config, guard, workspace, cache, strategy: 'task', targetPath: 'src/a.ts', includeTests: true, maxBytes: 6000, targetTokens: 1200 });
assert.equal(first.strategy, 'task');
assert.ok(first.bytes <= 6000, `byte budget exceeded: ${first.bytes}`);
assert.ok(first.estimatedTokens <= Math.ceil(first.bytes / 4) + 1);
assert.equal(first.cache.hit, false);
assert.ok(first.selectedItems.some((item) => item.kind === 'instructions'));
assert.ok(first.selectedItems.some((item) => item.kind === 'target' && item.path === 'src/a.ts'));
assert.ok(first.selectedItems.some((item) => item.kind === 'test' && item.path === 'test/a.test.ts'));
assert.ok(first.selectedItems.every((item) => item.reasons.length > 0 && Number.isFinite(item.score)));

const cached = await gatherContextV2({ config, guard, workspace, cache, strategy: 'task', targetPath: 'src/a.ts', includeTests: true, maxBytes: 6000, targetTokens: 1200 });
assert.equal(cached.cache.hit, true);
const symbol = await gatherContextV2({ config, guard, workspace, cache, strategy: 'symbol', targetSymbol: 'alpha', targetPath: 'src/a.ts', maxBytes: 6000 });
assert.equal(symbol.strategy, 'symbol');
assert.ok(symbol.selectedItems.some((item) => item.path === 'src/a.ts' && item.reasons.some((reason) => /symbol/i.test(reason))));
const changed = await gatherContextV2({ config, guard, workspace, cache, strategy: 'change', changedPaths: ['src/a.ts'], includeTests: true, includeRecentChanges: true, maxBytes: 6000 });
assert.equal(changed.strategy, 'change');
assert.ok(changed.selectedItems.some((item) => item.path === 'test/a.test.ts'));
assert.ok(changed.sections.some((section) => section.kind === 'git'));

const subtask = await prepareSubtaskContext({ config, guard, workspace, cache, strategy: 'task', targetPath: 'src/a.ts', maxBytes: 3000 });
assert.equal(subtask.bundleType, 'subtask_context');
assert.ok(subtask.bytes <= 3000);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', root, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full'],
  env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1', CODEXPRO_OPERATION_DIR: path.join(root, '.ops'), CODEXPRO_CHECKPOINT_DIR: path.join(root, '.checkpoints') }
});
const client = new Client({ name: 'context-v2-smoke', version: '0.1.0' });
await client.connect(transport);
const publicFirst = await client.callTool({ name: 'gather_context', arguments: { target_path: 'src/a.ts', strategy: 'task', max_bytes: 6000 } });
assert.equal(publicFirst.structuredContent.cache.hit, false);
const publicCached = await client.callTool({ name: 'gather_context', arguments: { target_path: 'src/a.ts', strategy: 'task', max_bytes: 6000 } });
assert.equal(publicCached.structuredContent.cache.hit, true);
const write = await client.callTool({ name: 'write', arguments: { path: 'src/new.ts', content: 'export const fresh = true;\n' } });
assert.equal(write.isError, undefined);
const afterWrite = await client.callTool({ name: 'gather_context', arguments: { target_path: 'src/a.ts', strategy: 'task', max_bytes: 6000 } });
assert.equal(afterWrite.structuredContent.cache.hit, false, 'CodexPro mutation must invalidate context cache');
const publicSubtask = await client.callTool({ name: 'prepare_subtask_context', arguments: { target_path: 'src/a.ts', max_bytes: 3000 } });
assert.equal(publicSubtask.structuredContent.bundleType, 'subtask_context');
assert.ok(publicSubtask.structuredContent.bytes <= 3000);
await client.close();
console.log('context v2 smoke passed');
