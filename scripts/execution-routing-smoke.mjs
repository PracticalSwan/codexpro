import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { serverInstructions } from '../dist/server.js';
import { classifyExecutionHint } from '../dist/executionGuidance.js';

const saved = process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN;
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
try {
  const config = loadConfig([]);
  assert(!('syncCallDeadlineMs' in config));
  assert.equal(classifyExecutionHint({ expectedDurationMs: 240_000 }).executionClass, 'sync_allowed');
  assert.equal(classifyExecutionHint({ highVariance: true, category: 'verification' }).executionClass, 'async_preferred');
  assert.equal(classifyExecutionHint({ category: 'multi_stage', hasDependencyGraph: true, requiresReviewProjection: true }).executionClass, 'durable_goal_candidate');
  const instructions = serverInstructions(config);
  assert.doesNotMatch(instructions, /deadline routing|unlimited\/observe|sync.preferred|transport boundary/i);
  assert.match(instructions, /managed workspace processes/i);
  assert.match(instructions, /structured verification jobs/i);
  assert.match(instructions, /durable Goals/i);
  assert.match(instructions, /condition-based/i);
  console.log('execution routing smoke passed');
} finally {
  if (saved === undefined) delete process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN;
  else process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = saved;
}
