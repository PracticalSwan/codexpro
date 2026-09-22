import assert from 'node:assert/strict';
import { composeVerificationFailureContext } from '../dist/verificationFailureContext.js';

const fixtureSecret = `secret-${'x'.repeat(16)}`;
const result = composeVerificationFailureContext({ changedPaths: ['src/main.ts', '../outside.ts', 'C:/private.txt'], relatedTests: [{ path: 'test/main.test.ts' }], dependentFiles: [{ path: 'src/helper.ts', reasons: ['dependency'] }] }, [{ check: { id: 'check', command: 'npm test', source: 'package.json', reasons: [], framework: 'node' }, exitCode: 1, signal: null, durationMs: 1, terminationReason: 'normal', ok: false, structured: { failed: 1, truncated: false, failures: [{ file: 'src/main.ts', line: 5, message: `Authorization: Bearer ${fixtureSecret}` }, { file: '../outside.ts', line: 1, message: 'outside' }] } }]);
assert.equal(result.length, 1);
assert.deepEqual(result[0].changedPaths, ['src/main.ts']);
assert.equal(result[0].primaryFailure.path, 'src/main.ts');
assert.doesNotMatch(JSON.stringify(result), new RegExp(fixtureSecret));
console.log('verification failure context smoke passed');
