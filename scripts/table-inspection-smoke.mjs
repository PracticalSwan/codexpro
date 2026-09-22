import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFixture, removeFixture } from './roadmap-smoke-fixtures.mjs';
import { inspectTable } from '../dist/tableOps.js';

const fixture = await createFixture('codexpro-table-');
try {
  await fs.writeFile(`${fixture.root}/quoted.csv`, 'name,value,note\n"alpha,one",1,"line one\nline two"\n beta,2,ok\n');
  await fs.writeFile(`${fixture.root}/events.jsonl`, '{"ok":true}\nnot-json\n[1,2]\n');
  const csv = await inspectTable(fixture.config, fixture.guard, fixture.workspace, { path: 'quoted.csv', maxOutputBytes: 1800 });
  assert.equal(csv.rowsScanned, 2);
  assert.equal(csv.sampleRows[0].name, 'alpha,one');
  assert.equal(csv.truncated || JSON.stringify(csv).length <= 1800, true);
  const jsonl = await inspectTable(fixture.config, fixture.guard, fixture.workspace, { path: 'events.jsonl' });
  assert.equal(jsonl.malformedRows, 2);
  console.log('table inspection smoke passed');
} finally {
  await removeFixture(fixture);
}
