import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildIdentity, displayVersion } from '../dist/buildIdentity.js';
import { loadConfig } from '../dist/config.js';
import { explainCapabilities } from '../dist/capabilityExplain.js';
import { WorkspaceManager, PathGuard } from '../dist/guard.js';
import { readNotebook } from '../dist/notebookOps.js';
import { inspectTable } from '../dist/tableOps.js';
import { inspectDependency } from '../dist/dependencyOps.js';
import { composeWorkspaceBriefing } from '../dist/workspaceBriefing.js';
import { composeVerificationFailureContext } from '../dist/verificationFailureContext.js';
import { probeLocalService } from '../dist/localServiceProbe.js';
import { toolNamesForMode } from '../dist/server.js';

const assertIncludes = (value, item, message) => assert.ok(value.includes(item) || value.some?.((entry) => String(entry).includes(item)), `${message}: ${item}`);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-roadmap-38-46-'));
await fs.mkdir(path.join(root, 'node_modules', 'demo-dep'), { recursive: true });
await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture-app', dependencies: { 'demo-dep': '^1.2.0' } }, null, 2));
await fs.writeFile(path.join(root, 'node_modules', 'demo-dep', 'package.json'), JSON.stringify({ name: 'demo-dep', version: '1.2.3', main: 'index.js', types: 'index.d.ts', exports: { '.': { require: './index.js', types: './index.d.ts' } } }, null, 2));
await fs.writeFile(path.join(root, 'node_modules', 'demo-dep', 'index.js'), 'export function actualSymbol() { return 1; }\n');
await fs.writeFile(path.join(root, 'node_modules', 'demo-dep', 'index.d.ts'), 'export declare function actualSymbol(): number;\n');
await fs.writeFile(path.join(root, 'node_modules', 'demo-dep', 'README.md'), `# demo-dep\nToken Authorization: Bearer ${'x'.repeat(12)}\n`);
await fs.writeFile(path.join(root, 'data.csv'), 'name,value,note\n"alpha,one",1,"line one\nline two"\n beta,2,ok\n');
await fs.writeFile(path.join(root, 'events.jsonl'), '{"ok":true,"n":1}\nnot-json\n[1,2]\n');
await fs.writeFile(path.join(root, 'demo.ipynb'), JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { display_name: 'Python 3' }, language_info: { name: 'python' } }, cells: [
  { cell_type: 'markdown', source: ['# Title'] },
  { cell_type: 'code', execution_count: 2, source: ['print("ok")'], outputs: [{ output_type: 'stream', text: ['ok\\n'] }, { output_type: 'display_data', data: { 'image/png': 'base64-should-not-appear', 'text/plain': '2' } }] }
] }, null, 2));

const base = loadConfig(['--root', root, '--allow-root', root, '--tool-mode', 'full', '--write', 'workspace', '--bash', 'safe']);
const config = { ...base, analysisEnabled: true, localServiceProbeEnabled: true };
const workspace = new WorkspaceManager(config).defaultWorkspace();
const guard = new PathGuard(config);

const identity = buildIdentity();
assert.equal(identity.packageName, 'codexpro-full');
assert.equal(displayVersion(identity).split('+')[0], identity.version);

const capabilities = explainCapabilities({ config, registeredTools: ['job_status', 'start_checks', 'inspect_workspace', 'codegraph_sync', 'code_intelligence_status', 'propose_goal', 'git_push', 'export_file', 'probe_local_service'] });
assert.equal(capabilities.find((item) => item.id === 'local_service_probe')?.state, 'available');
assert.equal(toolNamesForMode({ ...config, localServiceProbeEnabled: false }).includes('probe_local_service'), false);
assert.equal(toolNamesForMode(config).includes('probe_local_service'), true);

const notebook = await readNotebook(config, guard, workspace, { path: 'demo.ipynb', includeOutputs: true, cellIndices: [1] });
assert.equal(notebook.cellCount, 2);
assert.equal(notebook.selectedCells[0].executionCount, 2);
assert.equal(notebook.selectedCells[0].outputs?.[1].mimeTypes?.includes('image/png'), true);
assert.equal(JSON.stringify(notebook).includes('base64-should-not-appear'), false);

const csv = await inspectTable(config, guard, workspace, { path: 'data.csv' });
assert.equal(csv.rowsScanned, 2);
assert.equal(csv.sampleRows[0].name, 'alpha,one');
const jsonl = await inspectTable(config, guard, workspace, { path: 'events.jsonl' });
assert.equal(jsonl.malformedRows, 2);

const dependency = await inspectDependency(config, guard, workspace, { packageName: 'demo-dep', symbol: 'actualSymbol', includeReadme: true });
assert.equal(dependency.kind, 'installed');
assert.equal(dependency.installedVersion, '1.2.3');
assert.equal(dependency.symbol?.status, 'found');
assert.equal(dependency.readme?.text.includes('secret-fixture-value'), false);
const undeclared = await inspectDependency(config, guard, workspace, { packageName: 'not-declared' });
assert.equal(undeclared.installedVersion, null);
assertIncludes(undeclared.warnings, 'declared_not_installed', 'undeclared dependency was not rejected');

const briefing = composeWorkspaceBriefing({
  workspace: { id: 'fixture', pathLabel: 'fixture' },
  gitStatus: '## main...origin/main [behind 2]\n M src/a.ts\n?? data.csv',
  recentCommits: [{ sha: 'a'.repeat(40), shortSha: 'abcdef1', author: 'fixture', date: '2026-01-01', subject: 'fixture' }],
  instructions: [{ path: 'AGENTS.md', scope: '.' }],
  project: { languages: ['typescript'], projectTypes: ['node'], entrypoints: ['src/index.ts'] },
  checks: [],
  activeWork: { processes: 0, jobs: 1, batches: 0, goals: 0 },
  capabilities
});
assertIncludes(briefing.attention_required.map((item) => item.code), 'dirty_worktree', 'briefing missed dirty work');
assertIncludes(briefing.attention_required.map((item) => item.code), 'branch_behind', 'briefing missed upstream drift');

const failureContexts = composeVerificationFailureContext({ changedPaths: ['src/a.ts'], relatedTests: [{ path: 'test/a.test.ts' }], dependentFiles: [{ path: 'src/b.ts', reasons: ['imports changed file'] }] }, [{ check: { id: 'check_test', command: 'npm test', source: 'package.json', reasons: [], framework: 'node' }, exitCode: 1, signal: null, durationMs: 1, terminationReason: 'normal', ok: false, structured: { failed: 1, truncated: false, failures: [{ file: 'src/a.ts', line: 4, column: 2, message: 'expected value' }] } }]);
assert.equal(failureContexts[0].primaryFailure.path, 'src/a.ts');
assert.equal(failureContexts[0].contextLocations.some((item) => item.path === 'test/a.test.ts'), true);

const service = http.createServer((request, response) => {
  if (request.url === '/redirect') { response.writeHead(302, { location: '/json' }); response.end(); return; }
  response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, nested: { value: 'safe' } }));
});
await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
const port = service.address().port;
const probe = await probeLocalService({ url: `http://127.0.0.1:${port}/json`, method: 'GET' });
assert.equal(probe.status, 200);
assert.equal(probe.body.kind, 'json');
const redirect = await probeLocalService({ url: `http://127.0.0.1:${port}/redirect`, method: 'GET' });
assert.equal(redirect.status, 302);
assertIncludes(redirect.warnings, 'Redirect was reported but not followed.', 'probe followed a redirect');
await new Promise((resolve) => service.close(resolve));

const cliEnv = { ...process.env, CODEXPRO_HOME: await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-profile-home-')) };
const status = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'status', '--root', root, '--json'], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(status.status, 0, status.stderr);
assert.equal(JSON.parse(status.stdout).state, 'stopped');
const profiles = spawnSync(process.execPath, ['scripts/codexpro.mjs', 'profiles', 'show', '--current', '--root', root, '--json'], { cwd: path.resolve('.'), env: cliEnv, encoding: 'utf8' });
assert.equal(profiles.status, 0, profiles.stderr);
assert.deepEqual(JSON.parse(profiles.stdout), {});

console.log('roadmap 38-46 smoke passed');
