import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { BatchStore } from '../dist/batches/store.js';
import { inspectWorkspace, inspectWorkspaceResumable, invalidateWorkspaceAnalysis } from '../dist/analysis/index.js';
import { gatherContextV2 } from '../dist/contextOps.js';
import { gatherContextResumable } from '../dist/contextBatch.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-batch-workspace-'));
const batchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-batch-state-'));
const tinyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-batch-tiny-'));
const yielding = { shouldYield() { return true; } };

async function write(rel, text) {
  const file = path.join(root, rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text);
}
try {
  await write('AGENTS.md', '# Batch fixture\n');
  await write('package.json', JSON.stringify({ scripts: { test: 'node test.cjs' } }));
  await write('src/a.ts', 'export function alpha() { return 1; }\n');
  await write('src/b.ts', "import { alpha } from './a.js';\nexport const beta = alpha();\n");
  await write('src/c.ts', "import { beta } from './b.js';\nexport const gamma = beta;\n");
  await write('test/a.test.ts', "import { alpha } from '../src/a.js';\nalpha();\n");
  spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
  const config = { ...loadConfig(['--root', root, '--allow-root', root, '--bash', 'off', '--write', 'workspace', '--tool-mode', 'full']), analysisEnabled: true, batchDir };
  const workspace = new WorkspaceManager(config).defaultWorkspace();
  const guard = new PathGuard(config);
  const store = new BatchStore(batchDir);

  await assert.rejects(() => store.create({ workspace, kind: 'unknown', requestFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) }), /unsupported batch kind/i);
  const bound = await store.create({ workspace, kind: 'inspect_workspace', requestFingerprint: 'a'.repeat(64), sourceFingerprint: 'b'.repeat(64) });
  await assert.rejects(() => store.requireForWorkspace(bound.id, { id: workspace.id, root: `${root}-other` }), /does not belong/i);
  const tiny = new BatchStore(tinyDir, 128);
  const tinyRecord = await tiny.create({ workspace, kind: 'inspect_workspace', requestFingerprint: 'c'.repeat(64), sourceFingerprint: 'd'.repeat(64) });
  await assert.rejects(() => tiny.savePrivate(tinyRecord.id, { huge: 'x'.repeat(1000) }), /bounded storage limit/i);
  invalidateWorkspaceAnalysis(workspace.id);
  const uninterrupted = await inspectWorkspace(config, guard, workspace);
  invalidateWorkspaceAnalysis(workspace.id);
  let partial = await inspectWorkspaceResumable({ config, guard, workspace, store, deadline: yielding });
  assert.equal(partial.complete, false);
  assert.match(partial.continuationToken, /^batch_/);
  assert(partial.analysis.coverage.analyzedFiles > 0, 'first inspect batch did not advance real analysis work');
  let inspectCalls = 1;
  while (!partial.complete && inspectCalls < 20) {
    partial = await inspectWorkspaceResumable({ config, guard, workspace, store, continuationToken: partial.continuationToken, deadline: yielding });
    inspectCalls += 1;
  }
  assert.equal(partial.complete, true);
  assert.deepEqual(partial.analysis.symbols, uninterrupted.symbols);
  assert.deepEqual(partial.analysis.relationships, uninterrupted.relationships);
  assert.equal(partial.analysis.fingerprint, uninterrupted.fingerprint);

  const contextFull = await gatherContextV2({ config, guard, workspace, strategy: 'task', targetPath: 'src/a.ts', includeTests: true, maxBytes: 6000 });
  let contextPart = await gatherContextResumable({ config, guard, workspace, store, strategy: 'task', targetPath: 'src/a.ts', includeTests: true, maxBytes: 6000, deadline: yielding });
  assert.equal(contextPart.complete, false);
  assert.match(contextPart.continuationToken, /^batch_/);
  let contextCalls = 1;
  while (!contextPart.complete && contextCalls < 30) {
    contextPart = await gatherContextResumable({ config, guard, workspace, store, continuationToken: contextPart.continuationToken, strategy: 'task', targetPath: 'src/a.ts', includeTests: true, maxBytes: 6000, deadline: yielding });
    contextCalls += 1;
  }
  assert.equal(contextPart.complete, true);
  assert.deepEqual(contextPart.selectedItems.map((item) => ({ path: item.path, kind: item.kind, reasons: item.reasons })), contextFull.selectedItems.map((item) => ({ path: item.path, kind: item.kind, reasons: item.reasons })));
  assert.equal(contextPart.text, contextFull.text);
  const privateText = await fs.readFile(path.join(batchDir, contextPart.batch.id, 'state.json'), 'utf8');
  assert(!privateText.includes('export function alpha'), 'batch state persisted source text');

  const staleStart = await gatherContextResumable({ config, guard, workspace, store, strategy: 'task', targetPath: 'src/a.ts', maxBytes: 6000, deadline: yielding });
  assert.equal(staleStart.complete, false);
  await fs.appendFile(path.join(root, 'src/a.ts'), 'export const changed = true;\n');
  invalidateWorkspaceAnalysis(workspace.id);
  await assert.rejects(() => gatherContextResumable({ config, guard, workspace, store, continuationToken: staleStart.continuationToken, strategy: 'task', targetPath: 'src/a.ts', maxBytes: 6000, deadline: yielding }), /stale/i);
  const staleRecord = await store.require(staleStart.continuationToken);
  assert.equal(staleRecord.state, 'stale');

  console.log('resumable batch smoke passed');
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(batchDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await fs.rm(tinyDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}
