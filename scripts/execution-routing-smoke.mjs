import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { serverInstructions } from '../dist/server.js';
import { classifyExecutionHint, executionThresholds } from '../dist/executionGuidance.js';

const saved = process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN;
process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = '1';
try {
  const config = loadConfig([]);
  const thresholds = executionThresholds(config.syncCallDeadlineMs);
  assert.equal(config.syncCallDeadlineMs, 1_200_000);
  assert.equal(thresholds.syncPreferredMs, 300_000);
  assert.equal(thresholds.asyncPreferredMs, 900_000);
  assert.equal(classifyExecutionHint({ deadlineMs: 1_200_000, expectedDurationMs: 240_000 }).executionClass, 'sync_preferred');
  assert.equal(classifyExecutionHint({ deadlineMs: 1_200_000, expectedDurationMs: 600_000 }).executionClass, 'sync_allowed');
  assert.equal(classifyExecutionHint({ deadlineMs: 1_200_000, expectedDurationMs: 960_000 }).executionClass, 'async_preferred');
  const twelve = executionThresholds(720_000);
  assert.equal(twelve.syncPreferredMs, 180_000);
  assert.equal(twelve.asyncPreferredMs, 540_000);
  assert.equal(classifyExecutionHint({ deadlineMs: 720_000, expectedDurationMs: 120_000 }).executionClass, 'sync_preferred');
  assert.equal(classifyExecutionHint({ deadlineMs: 720_000, expectedDurationMs: 300_000 }).executionClass, 'sync_allowed');
  assert.equal(classifyExecutionHint({ deadlineMs: 720_000, expectedDurationMs: 600_000 }).executionClass, 'async_preferred');
  assert.equal(classifyExecutionHint({ deadlineMs: 1_200_000, highVariance: true, category: 'verification' }).executionClass, 'async_preferred');
  assert.equal(classifyExecutionHint({ deadlineMs: 1_200_000, category: 'multi_stage', hasDependencyGraph: true, requiresReviewProjection: true }).executionClass, 'durable_goal_candidate');

  const bounded = serverInstructions(config);
  assert.match(bounded, /20 minutes/i);
  assert.match(bounded, /transport boundary/i);
  assert.match(bounded, /never a task-quality target/i);
  assert.match(bounded, /start_workspace_process/);
  assert.match(bounded, /start_checks.*start_verification/i);
  assert.match(bounded, /Durable Goals/i);
  assert.match(bounded, /material.*progress/i);
  assert.match(bounded, /condition-based/i);
  const observe = serverInstructions({ ...config, syncCallDeadlineMode: 'observe', syncCallDeadlineMs: 1_200_000 });
  assert.match(observe, /Unlimited.*observe/i);
  assert.match(observe, /discovery/i);
  assert.match(observe, /conservative.*routing/i);
  assert.match(observe, /never rush|do not rush|never reduce/i);
  console.log('execution routing smoke passed');
} finally {
  if (saved === undefined) delete process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN;
  else process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN = saved;
}
