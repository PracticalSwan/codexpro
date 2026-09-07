import assert from 'node:assert/strict';
import { evaluatePolicyRules, normalizePolicyResource, policyResourcesForTool } from '../dist/policyRules.js';

const rules = [
  { action: '*', resource: '*', effect: 'allow' },
  { action: 'write', resource: 'secrets/**', effect: 'deny' },
  { action: 'write', resource: 'secrets/public.txt', effect: 'allow' }
];

assert.equal(evaluatePolicyRules(rules, 'write', ['secrets/key.txt']).effect, 'deny');
assert.equal(evaluatePolicyRules(rules, 'write', ['secrets/public.txt']).effect, 'allow');
assert.equal(evaluatePolicyRules(rules, 'write', ['src/a.ts', 'secrets/key.txt']).effect, 'deny');
assert.equal(evaluatePolicyRules(rules, 'edit', ['secrets/key.txt']).effect, 'deny');
assert.equal(evaluatePolicyRules(rules, 'apply_patch', ['secrets/key.txt']).effect, 'deny');
assert.equal(evaluatePolicyRules(rules, 'apply_change_set', ['secrets/key.txt']).effect, 'deny');
assert.equal(evaluatePolicyRules([], 'write', ['src/a.ts']).effect, 'allow');
assert.equal(normalizePolicyResource('path', '.\\src\\a.ts'), 'src/a.ts');
assert.equal(normalizePolicyResource('bash', ' npm   test  '), 'npm test');
assert.equal(normalizePolicyResource('git', 'origin/main'), 'origin/main');
assert.deepEqual(policyResourcesForTool('prepare_change_set', { changes: [{ path: 'a.txt' }, { path: 'b.txt' }] }), ['a.txt', 'b.txt']);
assert.deepEqual(policyResourcesForTool('git_push', { remote: 'origin', branch: 'main' }), ['origin/main']);
console.log('policy rules smoke passed');
