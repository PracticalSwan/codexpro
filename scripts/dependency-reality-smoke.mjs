import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';
import { inspectDependency } from '../dist/dependencyOps.js';

const fixture = await createFixture('codexpro-dependency-');
const fixtureSecret = `secret-${'x'.repeat(16)}`;
let outsidePath = '';
try {
  const packageRoot = path.join(fixture.root, 'node_modules', 'demo-dep');
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.writeFile(path.join(fixture.root, 'package.json'), JSON.stringify({ name: 'fixture-app', dependencies: { 'demo-dep': '^1.2.0', missing: '^1.0.0', escaped: '^1.0.0', 'in-workspace': '^1.0.0' } }));
  await fs.writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: 'demo-dep', version: '1.2.3', main: 'index.js', types: 'index.d.ts' }));
  await fs.writeFile(path.join(packageRoot, 'index.js'), 'export const demoSymbol = 1;\n');
  await fs.writeFile(path.join(packageRoot, 'index.d.ts'), 'export declare const demoSymbol: number;\n');
  await fs.writeFile(path.join(packageRoot, 'README.md'), `Authorization: Bearer ${fixtureSecret}\n`);
  const inspected = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'demo-dep', symbol: 'demoSymbol' });
  assert.equal(inspected.installedVersion, '1.2.3');
  assert.equal(inspected.symbol?.status, 'found');
  assert.doesNotMatch(JSON.stringify(inspected), new RegExp(fixtureSecret));
  const undeclared = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'not-declared' });
  assert.equal(undeclared.installedVersion, null);
  assert.ok(undeclared.warnings.some((warning) => warning.includes('declared_not_installed')));
  const missing = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'missing' });
  assert.equal(missing.installedVersion, null);
  const outside = path.join(fixture.root, '..', `${path.basename(fixture.root)}-outside`);
  outsidePath = outside;
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(outside, 'package.json'), JSON.stringify({ name: 'escaped', version: '9.9.9' }));
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  let symlinksAvailable = true;
  try { await fs.symlink(outside, path.join(fixture.root, 'node_modules', 'escaped'), linkType); } catch { symlinksAvailable = false; }
  if (symlinksAvailable) {
    const escaped = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'escaped' });
    assert.ok(escaped.warnings.some((warning) => warning.includes('dependency_root_escape')));
  }
  const store = path.join(fixture.root, '.pnpm-store', 'in-workspace');
  await fs.mkdir(store, { recursive: true });
  await fs.writeFile(path.join(store, 'package.json'), JSON.stringify({ name: 'in-workspace', version: '2.0.0' }));
  if (symlinksAvailable) {
    await fs.symlink(store, path.join(fixture.root, 'node_modules', 'in-workspace'), linkType);
    const linked = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'in-workspace' });
    assert.equal(linked.installedVersion, '2.0.0');
    const realReadme = path.join(packageRoot, 'README.real.md');
    await fs.rename(path.join(packageRoot, 'README.md'), realReadme);
    await fs.writeFile(path.join(outside, 'README.md'), `Authorization: Bearer ${fixtureSecret}\n`);
    let readmeLink = true;
    try { await fs.symlink(path.join(outside, 'README.md'), path.join(packageRoot, 'README.md'), 'file'); } catch { readmeLink = false; }
    if (readmeLink) {
      const linkedReadme = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'demo-dep' });
      assert.equal(linkedReadme.readme, undefined);
      assert.ok(linkedReadme.warnings.some((warning) => warning.includes('readme_symlink_omitted')));
      await fs.rm(path.join(packageRoot, 'README.md'), { force: true });
    }
    await fs.rename(realReadme, path.join(packageRoot, 'README.md'));
  }
  await fs.writeFile(path.join(fixture.root, '.pnp.cjs'), 'module.exports = {};\n');
  const pnp = await inspectDependency(fixture.config, fixture.guard, fixture.workspace, { packageName: 'demo-dep' });
  assert.ok(pnp.warnings.some((warning) => warning.includes('unsupported_pnp_layout')));
  console.log('dependency reality smoke passed');
} finally {
  await removeFixture(fixture);
  if (outsidePath) await fs.rm(outsidePath, { recursive: true, force: true });
}
