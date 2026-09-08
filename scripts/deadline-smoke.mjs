import assert from 'node:assert/strict';
import {
  DEFAULT_SYNC_CALL_DEADLINE_MS,
  MIN_SYNC_CALL_DEADLINE_MS,
  MAX_SYNC_CALL_DEADLINE_MS,
  DeadlineBudget,
  normalizeSyncCallDeadlineConfig,
  withSyncCallDeadline,
  currentSyncCallDeadline
} from '../dist/deadline.js';
import { loadConfig } from '../dist/config.js';

assert.equal(DEFAULT_SYNC_CALL_DEADLINE_MS, 1_200_000);
assert.equal(MIN_SYNC_CALL_DEADLINE_MS, 300_000);
assert.equal(MAX_SYNC_CALL_DEADLINE_MS, 3_600_000);
assert.deepEqual(normalizeSyncCallDeadlineConfig(undefined), { mode: 'bounded', deadlineMs: 1_200_000 });
assert.deepEqual(normalizeSyncCallDeadlineConfig('unlimited'), { mode: 'observe', deadlineMs: 1_200_000 });
assert.deepEqual(normalizeSyncCallDeadlineConfig({ mode: 'observe', deadlineMs: 720_000 }), { mode: 'observe', deadlineMs: 720_000 });
assert.deepEqual(normalizeSyncCallDeadlineConfig({ mode: 'bounded', deadlineMs: 300_000 }), { mode: 'bounded', deadlineMs: 300_000 });
assert.deepEqual(normalizeSyncCallDeadlineConfig({ mode: 'bounded', deadlineMs: 3_600_000 }), { mode: 'bounded', deadlineMs: 3_600_000 });

for (const value of [299_999, 3_600_001, NaN, Infinity, 'banana']) {
  assert.throws(() => normalizeSyncCallDeadlineConfig(value));
}
let now = 1_000;
const bounded = new DeadlineBudget('bounded', 300_000, { now: () => now });
assert.equal(bounded.remainingMs(), 300_000);
now += 100_000;
assert.equal(bounded.remainingMs(), 200_000);
assert.equal(bounded.handoffReserveMs(), 15_000);
assert.equal(bounded.childTimeoutMs(250_000), 185_000);
assert.equal(bounded.shouldYield(185_001), true);

const observe = new DeadlineBudget('observe', 720_000, { now: () => now });
now += 50_000;
assert.equal(observe.elapsedMs(), 50_000);
assert.equal(observe.remainingMs(), Infinity);
assert.equal(observe.shouldYield(Number.MAX_SAFE_INTEGER), false);
assert.equal(observe.childTimeoutMs(123_456), 123_456);

await withSyncCallDeadline('bounded', 300_000, async () => {
  const outer = currentSyncCallDeadline();
  assert(outer);
  await Promise.resolve();
  assert.equal(currentSyncCallDeadline(), outer);
});

const savedMode = process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE;
const savedMs = process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS;
try {
  delete process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE;
  delete process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS;
  let config = loadConfig(['--root', process.cwd()]);
  assert.equal(config.syncCallDeadlineMode, 'bounded');
  assert.equal(config.syncCallDeadlineMs, 1_200_000);
  process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE = 'observe';
  process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS = '720000';
  config = loadConfig(['--root', process.cwd()]);
  assert.equal(config.syncCallDeadlineMode, 'observe');
  assert.equal(config.syncCallDeadlineMs, 720_000);
  process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS = '299999';
  assert.throws(() => loadConfig(['--root', process.cwd()]));
} finally {
  if (savedMode === undefined) delete process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE; else process.env.CODEXPRO_SYNC_CALL_DEADLINE_MODE = savedMode;
  if (savedMs === undefined) delete process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS; else process.env.CODEXPRO_SYNC_CALL_DEADLINE_MS = savedMs;
}

console.log('✓ deadline smoke test passed');
