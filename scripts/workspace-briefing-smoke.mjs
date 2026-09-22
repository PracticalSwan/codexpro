import assert from 'node:assert/strict';
import { composeWorkspaceBriefing } from '../dist/workspaceBriefing.js';

const base = { workspace: { id: 'fixture', pathLabel: 'fixture' }, recentCommits: [], instructions: [], checks: [], capabilities: [] };
const unavailable = composeWorkspaceBriefing({ ...base, gitStatus: 'fatal: not a git repository (or any parent up to mount point)', warnings: [] });
assert.equal(unavailable.git.dirty, false);
assert.ok(unavailable.attention_required.some((item) => item.code === 'git_status_unavailable'));
const normal = composeWorkspaceBriefing({ ...base, gitStatus: '## main...origin/main [ahead 1, behind 2]\n M src/a.ts', instructions: [{ path: 'AGENTS.md', scope: '.' }], checks: [{ id: 'test', label: 'npm test' }], capabilities: [{ id: 'analysis', state: 'degraded', reason: 'not queried', source: 'dependency' }], recentCommits: [{ sha: 'a'.repeat(40), shortSha: 'abcdef1', author: 'fixture', date: '2026-01-01', subject: 'fixture' }] });
assert.ok(normal.attention_required.some((item) => item.code === 'dirty_worktree'));
assert.ok(normal.attention_required.some((item) => item.code === 'branch_ahead'));
assert.ok(normal.attention_required.some((item) => item.code === 'branch_behind'));
assert.ok(normal.attention_required.some((item) => item.code === 'capability_analysis'));
console.log('workspace briefing smoke passed');
