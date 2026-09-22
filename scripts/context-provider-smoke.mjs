import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';
import { registerAnalysisProvider } from '../dist/analysis/providers.js';
import { gatherContextV2 } from '../dist/contextOps.js';

const fixture = await createFixture('codexpro-context-provider-');
try {
  await fs.writeFile(`${fixture.root}/src/related.ts`, 'export const related = true;\n');
  registerAnalysisProvider({
    id: 'fixture-provider',
    async availability() { return { available: true }; },
    async search() { return { matches: [{ path: 'src/related.ts', group: 'related', score: 740, source: 'fixture-provider' }] }; }
  });
  const result = await gatherContextV2({ config: fixture.config, guard: fixture.guard, workspace: fixture.workspace, strategy: 'symbol', targetPath: 'src/main.ts', targetSymbol: 'related', changedPaths: ['src/related.ts'], includeTests: true });
  const item = result.selectedItems.find((candidate) => candidate.path === 'src/related.ts');
  assert.ok(item);
  assert.ok(item.reasons.some((reason) => reason.includes('fixture-provider structural related evidence')));
  console.log('context provider smoke passed');
} finally {
  await removeFixture(fixture);
}
