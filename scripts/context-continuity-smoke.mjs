import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { readMany, searchMany, gatherContext } from '../dist/contextOps.js';
import { instructionsForPath } from '../dist/instructionOps.js';
import { WorkspaceEventTracker } from '../dist/workspaceEvents.js';
import { TaskStateStore } from '../dist/taskStateOps.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-context-continuity-'));
const taskDir = path.join(root, '.task-state');
const keys = ['CODEXPRO_ROOT','CODEXPRO_ALLOWED_ROOTS','CODEXPRO_ALLOW_NO_HTTP_TOKEN','CODEXPRO_OPERATION_DIR'];
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
process.env.CODEXPRO_ROOT = root;
process.env.CODEXPRO_ALLOWED_ROOTS = root;
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
process.env.CODEXPRO_OPERATION_DIR = path.join(root, '.ops');
await fs.mkdir(path.join(root, 'src', 'feature'), { recursive: true });
await fs.writeFile(path.join(root, 'AGENTS.md'), '# Root Rules\nroot instruction\n');
await fs.writeFile(path.join(root, 'src', 'AGENTS.md'), '# Src Rules\nsrc instruction\n');
await fs.writeFile(path.join(root, 'src', 'feature', 'a.ts'), 'export const alpha = 1;\nneedle alpha\n');
await fs.writeFile(path.join(root, 'src', 'feature', 'b.ts'), 'export const beta = 2;\nneedle beta\n');const config = loadConfig([]);
const workspaces = new WorkspaceManager(config);
const workspace = workspaces.selectDefaultWorkspace();
const guard = new PathGuard(config);

try {
  const reads = await readMany({
    config, guard, workspace,
    items: [{ path: 'src/feature/a.ts' }, { path: 'missing.ts' }, { path: 'src/feature/b.ts' }],
    maxTotalBytes: 6000
  });
  assert.equal(reads.items.length, 3);
  assert.equal(reads.items.filter((item) => item.ok).length, 2);
  assert.equal(reads.items.filter((item) => !item.ok).length, 1);
  assert(Buffer.byteLength(JSON.stringify(reads), 'utf8') < 9000);

  const searches = await searchMany({
    config, guard, workspace,
    items: [{ query: 'needle', root: 'src' }, { query: 'alpha', root: 'missing-dir' }],
    maxTotalResults: 8,
    maxTotalBytes: 6000
  });
  assert.equal(searches.items.length, 2);
  assert.equal(searches.items[0].ok, true);
  assert.equal(searches.items[1].ok, false);
  assert(searches.totalResults <= 8);

  const instructions = await instructionsForPath(config, guard, workspace, 'src/feature/a.ts');
  assert.deepEqual(instructions.sources, ['AGENTS.md', 'src/AGENTS.md']);
  assert(instructions.text.includes('root instruction') && instructions.text.includes('src instruction'));

  const context = await gatherContext({ config, guard, workspace, targetPath: 'src/feature/a.ts', maxBytes: 12000 });
  assert(context.sections.length >= 2);
  assert(Buffer.byteLength(context.text, 'utf8') <= 12000);
  assert.equal(context.sections[0].kind, 'instructions');
  const events = new WorkspaceEventTracker(config, guard, workspace, { maxFiles: 100 });
  const baseline = await events.page();
  assert.equal(baseline.events.length, 0);
  await fs.rename(path.join(root, 'src', 'feature', 'b.ts'), path.join(root, 'src', 'feature', 'renamed.ts'));
  await fs.writeFile(path.join(root, 'src', 'feature', 'a.ts'), 'export const alpha = 3;\nneedle alpha\n');
  await fs.writeFile(path.join(root, 'src', 'feature', 'new.ts'), 'new file\n');
  await fs.mkdir(path.join(root, '.codexpro-live-validation'), { recursive: true });
  await fs.writeFile(path.join(root, '.codexpro-live-validation', 'event-test.txt'), 'hidden but allowed\n');
  await fs.mkdir(path.join(root, '.git'), { recursive: true });
  await fs.writeFile(path.join(root, '.git', 'blocked-event.txt'), 'must stay hidden\n');
  const changed = await events.page(baseline.cursor);
  assert(changed.events.some((event) => event.kind === 'rename' && event.path === 'src/feature/renamed.ts'));
  assert(changed.events.some((event) => event.kind === 'edit' && event.path === 'src/feature/a.ts'));
  assert(changed.events.some((event) => event.kind === 'create' && event.path === 'src/feature/new.ts'));
  assert(changed.events.some((event) => event.kind === 'create' && event.path === '.codexpro-live-validation/event-test.txt'));
  assert(!changed.events.some((event) => event.path.includes('.git')));

  const store = new TaskStateStore({ baseDir: taskDir, maxSnapshots: 16 });
  const savedTask = await store.save({
    goal: 'Complete bounded context work',
    filesInspected: ['src/feature/a.ts'],
    verification: ['context smoke pending'],
    decisions: ['keep state bounded'],
    remainingWork: ['run broad smoke']
  });
  assert.match(savedTask.id, /^task_/);
  const loaded = await store.load(savedTask.id);
  assert.equal(loaded?.goal, 'Complete bounded context work');
  await assert.rejects(
    () => store.save({ goal: 'bad', filesInspected: [], verification: [], decisions: [], remainingWork: [], chainOfThought: 'secret reasoning' }),
    /unknown|chain|field/i
  );

  console.log('context continuity smoke passed');
} finally {
  for (const key of keys) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
  await fs.rm(root, { recursive: true, force: true });
}
