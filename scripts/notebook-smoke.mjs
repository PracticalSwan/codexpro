import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';
import { readNotebook } from '../dist/notebookOps.js';

const fixture = await createFixture('codexpro-notebook-');
const fixtureSecret = `secret-${'x'.repeat(16)}`;
try {
  const notebook = { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { display_name: 'Python 3' } }, cells: [{ cell_type: 'markdown', source: ['# title'] }, { cell_type: 'code', execution_count: 1, source: ['print(1)'], outputs: [{ output_type: 'display_data', data: { 'image/png': fixtureSecret, 'text/plain': '1' } }] }] };
  await fs.writeFile(`${fixture.root}/demo.ipynb`, JSON.stringify(notebook));
  const result = await readNotebook(fixture.config, fixture.guard, fixture.workspace, { path: 'demo.ipynb', includeOutputs: true, cellIndices: [1] });
  assert.equal(result.cellCount, 2);
  assert.equal(result.selectedCells[0].outputs?.[0].mimeTypes?.[0], 'image/png');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(fixtureSecret));
  await fs.writeFile(`${fixture.root}/too-large.ipynb`, JSON.stringify({ cells: Array.from({ length: 10_001 }, () => ({ cell_type: 'code', source: [] })) }));
  await assert.rejects(() => readNotebook(fixture.config, fixture.guard, fixture.workspace, { path: 'too-large.ipynb' }), /too many cells/i);
  console.log('notebook smoke passed');
} finally {
  await removeFixture(fixture);
}
