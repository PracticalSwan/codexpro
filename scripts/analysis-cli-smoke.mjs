import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(projectRoot, 'scripts', 'codexpro.mjs');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-analysis-cli-'));
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-analysis-cli-home-'));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, NO_COLOR: '1', CI: '1', CODEXPRO_HOME: home }
  });
}

try {
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'test'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cli-fixture', scripts: { test: 'node --test' } }, null, 2), 'utf8');
  await fs.writeFile(path.join(root, 'src', 'auth.ts'), 'export function authenticate(user) { return Boolean(user); }\n', 'utf8');
  await fs.writeFile(path.join(root, 'test', 'auth.test.ts'), "import { authenticate } from '../src/auth.js';\nvoid authenticate('test');\n", 'utf8');
  await fs.writeFile(path.join(root, '.gitignore'), 'outputs/\n', 'utf8');
  await fs.mkdir(path.join(root, 'outputs', 'final', 'practice_deps', 'example-1.0.dist-info'), { recursive: true });
  await fs.writeFile(path.join(root, 'outputs', 'final', 'practice_deps', 'example-1.0.dist-info', 'README.md'), 'Ignored package metadata.\n', 'utf8');
  await fs.writeFile(path.join(root, 'outputs', 'final', 'practice_deps', 'vendored.py'), 'def vendored(): return True\n', 'utf8');
  for (const args of [['init'], ['add', '.']]) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  await fs.writeFile(path.join(root, 'outputs', 'retained.py'), 'TRACKED_OUTPUT = True\n', 'utf8');
  const forceTracked = spawnSync('git', ['add', '-f', 'outputs/retained.py'], { cwd: root, encoding: 'utf8' });
  assert.equal(forceTracked.status, 0, forceTracked.stderr || forceTracked.stdout);
  const commit = spawnSync('git', ['-c', 'user.email=cli@example.com', '-c', 'user.name=CLI Test', 'commit', '-m', 'fixture'], { cwd: root, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr || commit.stdout);
  await fs.writeFile(path.join(root, 'src', 'auth.ts'), 'export function authenticate(user) { return Boolean(user?.trim()); }\n', 'utf8');
  await fs.writeFile(path.join(root, 'src', 'new-untracked.ts'), 'export const untracked = true;\n', 'utf8');

  const inspect = run(['inspect', '--root', root, '--json']);
  assert.equal(inspect.status, 0, inspect.stderr || inspect.stdout || inspect.error?.message);
  const inspectJson = JSON.parse(inspect.stdout);
  assert.equal(inspectJson.schema_version, 1);
  assert(inspectJson.languages.includes('typescript'));
  assert(inspectJson.entrypoints.length >= 0);
  assert(inspectJson.files.some((file) => file.path === 'src/auth.ts'), 'tracked source missing from inventory');
  assert(inspectJson.files.some((file) => file.path === 'src/new-untracked.ts'), 'non-ignored untracked source missing from inventory');
  assert.deepEqual(inspectJson.files.filter((file) => file.path.startsWith('outputs/')).map((file) => file.path), ['outputs/retained.py'], 'ignored outputs must be excluded, but explicitly tracked files retained');
  assert(!inspectJson.important_files.some((file) => file.includes('dist-info/README.md')), 'ignored dependency metadata selected as an important project file');

  const review = run(['review', '--root', root, '--json']);
  assert.equal(review.status, 0, review.stderr || review.stdout || review.error?.message);
  const reviewJson = JSON.parse(review.stdout);
  assert.equal(reviewJson.schema_version, 1);
  assert(reviewJson.changed_files.includes('src/auth.ts'));
  assert(reviewJson.risk_signals.some((risk) => risk.id === 'authentication'));
  assert(reviewJson.related_tests.some((file) => file.path === 'test/auth.test.ts'));

  const stage = spawnSync('git', ['add', 'src/auth.ts'], { cwd: root, encoding: 'utf8' });
  assert.equal(stage.status, 0, stage.stderr || stage.stdout);
  const stagedReview = run(['review', '--root', root, '--staged', '--path', 'src/auth.ts', '--json']);
  assert.equal(stagedReview.status, 0, stagedReview.stderr || stagedReview.stdout || stagedReview.error?.message);
  const stagedReviewJson = JSON.parse(stagedReview.stdout);
  assert.deepEqual(stagedReviewJson.changed_files, ['src/auth.ts']);
  assert(stagedReviewJson.risk_signals.some((risk) => risk.id === 'authentication'));

  const human = run(['inspect', '--root', root]);
  assert.equal(human.status, 0, human.stderr || human.stdout);
  for (const heading of ['Workspace', 'Projects', 'Languages', 'Coverage']) assert(human.stdout.includes(heading));
  assert(!/\u001b\[/.test(human.stdout));

  const missing = run(['inspect', '--root', path.join(root, 'missing'), '--json']);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /does not exist/i);

  const nonGitRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-analysis-cli-non-git-'));
  try {
    await fs.writeFile(path.join(nonGitRoot, 'main.py'), 'print("non-git")\n', 'utf8');
    const nonGitInspect = run(['inspect', '--root', nonGitRoot, '--json']);
    assert.equal(nonGitInspect.status, 0, nonGitInspect.stderr || nonGitInspect.stdout);
    assert(JSON.parse(nonGitInspect.stdout).files.some((file) => file.path === 'main.py'), 'non-Git workspace inspection regressed');
    const nonGitReview = run(['review', '--root', nonGitRoot, '--json']);
    assert.notEqual(nonGitReview.status, 0);
    assert.match(nonGitReview.stderr, /Unable to read Git changes/i);
  } finally {
    await fs.rm(nonGitRoot, { recursive: true, force: true });
  }

  console.log('✓ analysis CLI smoke test passed');
} finally {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
}
