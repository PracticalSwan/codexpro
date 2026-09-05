import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../dist/config.js';
import { PathGuard, WorkspaceManager } from '../dist/guard.js';
import { sha256 } from '../dist/fsOps.js';
import { OperationStore } from '../dist/operations/store.js';
import { OperationManager } from '../dist/operations/manager.js';
import { ResourceBudget, OperationBudgetError } from '../dist/operations/budget.js';
import { withWorkspaceLease } from '../dist/operations/locks.js';
import { prepareChangeSet, applyChangeSet, revertOperation } from '../dist/operations/changesets.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function rejects(fn, pattern, label) {
  try { await fn(); }
  catch (error) {
    if (pattern.test(String(error?.message ?? error))) return;
    throw new Error(`${label} failed for wrong reason: ${error?.message ?? error}`);
  }
  throw new Error(`${label} was accepted`);
}

class McpClient {
  constructor(args, env) {
    this.child = spawn('node', args, { cwd: path.resolve('.'), env });
    this.buffer = ''; this.nextId = 1; this.pending = new Map();
    this.child.stdout.on('data', (chunk) => this.onData(String(chunk)));
    this.child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }
  onData(chunk) {
    this.buffer += chunk;
    while (true) {
      const index = this.buffer.indexOf('\n'); if (index < 0) return;
      const line = this.buffer.slice(0,index).replace(/\r$/,''); this.buffer=this.buffer.slice(index+1); if(!line.trim()) continue;
      const msg=JSON.parse(line); const pending=this.pending.get(msg.id); if(!pending) continue;
      clearTimeout(pending.timer); this.pending.delete(msg.id); msg.error ? pending.reject(new Error(msg.error.message)) : pending.resolve(msg.result);
    }
  }
  request(method, params) {
    const id=this.nextId++; this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    return new Promise((resolve,reject)=>{ const timer=setTimeout(()=>reject(new Error(`timeout waiting for ${method}`)),15000); timer.unref(); this.pending.set(id,{resolve,reject,timer}); });
  }
  notify(method,params={}) { this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n'); }
  close(){ this.child.kill('SIGTERM'); }
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-operation-'));
const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-operation-state-'));
const config = loadConfig(['--root', root, '--allow-root', root, '--write', 'workspace', '--tool-mode', 'full']);
const workspaces = new WorkspaceManager(config);
const workspace = workspaces.selectDefaultWorkspace();
const guard = new PathGuard(config);
const store = new OperationStore({ baseDir: stateDir, maxReceipts: 32 });
const manager = new OperationManager(store, workspace.id);
const started = await manager.start({ kind: 'write', idempotencyKey: 'lost-response-1' });
assert(started.state === 'started' && !started.reused, 'new operation did not start');
const completed = await manager.complete(started.id, { paths: ['demo.txt'], bytes: 12, note: 'completed safely' });
assert(completed.state === 'completed', 'operation did not complete');
const recoveredManager = new OperationManager(new OperationStore({ baseDir: stateDir, maxReceipts: 32 }), workspace.id);
const replayed = await recoveredManager.start({ kind: 'write', idempotencyKey: 'lost-response-1' });
assert(replayed.id === completed.id && replayed.state === 'completed' && replayed.reused, 'idempotency did not recover completed operation');
const recoveredStatus = await recoveredManager.status(completed.id);
assert(recoveredStatus?.state === 'completed', 'completed operation was not durable across manager recreation');

const secretMarker = 'sk-test-secret-operation-marker-1234567890';
const sensitive = await manager.start({ kind: 'diagnostic' });
await manager.complete(sensitive.id, { note: `OPENAI_API_KEY=${secretMarker}`, paths: ['safe.txt'] });
const journalText = await readAllFiles(stateDir);
assert(!journalText.includes(secretMarker), 'operation journal persisted a raw secret');
assert(!journalText.includes('OPENAI_API_KEY='), 'operation journal persisted secret-bearing detail');

const budget = new ResourceBudget({ maxBytes: 10, maxItems: 2, maxDurationMs: 1000 });
budget.consumeBytes(8);
let budgetReason = '';
try { budget.consumeBytes(3); }
catch (error) {
  assert(error instanceof OperationBudgetError, 'budget exhaustion used wrong error type');
  budgetReason = error.reason;
}
assert(budgetReason === 'bytes_exhausted', `unexpected budget reason: ${budgetReason}`);

let active = 0;
let peak = 0;
const locked = (resources, delay) => withWorkspaceLease(workspace.id, resources, async () => {
  active += 1;
  peak = Math.max(peak, active);
  await new Promise((resolve) => setTimeout(resolve, delay));
  active -= 1;
});
await Promise.race([
  Promise.all([locked(['b', 'a'], 40), locked(['a', 'b'], 10)]),
  new Promise((_, reject) => setTimeout(() => reject(new Error('workspace leases deadlocked')), 2000))
]);
assert(peak === 1, `overlapping workspace leases ran concurrently (peak=${peak})`);
await fs.writeFile(path.join(root, 'a.txt'), 'alpha\n');
await fs.writeFile(path.join(root, 'b.txt'), 'bravo\n');
const alphaSha = sha256('alpha\n');
const bravoSha = sha256('bravo\n');
const stalePrepared = await prepareChangeSet({
  operationManager: manager,
  config,
  guard,
  workspace,
  idempotencyKey: 'changeset-stale',
  changes: [
    { path: 'a.txt', content: 'alpha-2\n', expectedSha256: alphaSha },
    { path: 'b.txt', content: 'bravo-2\n', expectedSha256: bravoSha }
  ]
});
assert(stalePrepared.paths.length === 2, 'change set did not prepare both files');
await fs.writeFile(path.join(root, 'b.txt'), 'user-edit\n');
await rejects(() => applyChangeSet(stalePrepared.id), /stale|changed|sha/i, 'stale change set');
assert(await fs.readFile(path.join(root, 'a.txt'), 'utf8') === 'alpha\n', 'stale transaction partially modified first file');
assert(await fs.readFile(path.join(root, 'b.txt'), 'utf8') === 'user-edit\n', 'stale transaction overwrote user edit');

const currentBSha = sha256('user-edit\n');
const appliedPrepared = await prepareChangeSet({
  operationManager: manager,
  config,
  guard,
  workspace,
  idempotencyKey: 'changeset-apply',
  changes: [
    { path: 'a.txt', content: 'alpha-3\n', expectedSha256: alphaSha },
    { path: 'b.txt', content: 'bravo-3\n', expectedSha256: currentBSha }
  ]
});
const applied = await applyChangeSet(appliedPrepared.id);
assert(applied.state === 'completed', 'change set did not complete');
assert(await fs.readFile(path.join(root, 'a.txt'), 'utf8') === 'alpha-3\n', 'change set did not update a.txt');
assert(await fs.readFile(path.join(root, 'b.txt'), 'utf8') === 'bravo-3\n', 'change set did not update b.txt');
const appliedReplay = await applyChangeSet(appliedPrepared.id);
assert(appliedReplay.id === applied.id && appliedReplay.reused, 'change set retry did not return existing receipt');
await fs.writeFile(path.join(root, 'a.txt'), 'later-user-edit\n');
await rejects(() => revertOperation(applied.id), /stale|changed|hash/i, 'revert over later user edit');
assert(await fs.readFile(path.join(root, 'a.txt'), 'utf8') === 'later-user-edit\n', 'failed revert overwrote later user edit');

await fs.writeFile(path.join(root, 'a.txt'), 'revert-base\n');
const revertPrepared = await prepareChangeSet({
  operationManager: manager,
  config,
  guard,
  workspace,
  idempotencyKey: 'changeset-revert',
  changes: [{ path: 'a.txt', content: 'revert-after\n', expectedSha256: sha256('revert-base\n') }]
});
const revertApplied = await applyChangeSet(revertPrepared.id);
const reverted = await revertOperation(revertApplied.id);
assert(reverted.state === 'completed' && reverted.kind === 'revert', 'revert did not produce a completed receipt');
assert(await fs.readFile(path.join(root, 'a.txt'), 'utf8') === 'revert-base\n', 'revert did not restore prior file text');

const sourceMarker = 'UNIQUE_SOURCE_CONTENT_MUST_NOT_PERSIST_93842';
await fs.writeFile(path.join(root, 'c.txt'), 'c-before\n');
const privacyPrepared = await prepareChangeSet({
  operationManager: manager,
  config,
  guard,
  workspace,
  idempotencyKey: 'changeset-privacy',
  changes: [{ path: 'c.txt', content: `${sourceMarker}\n`, expectedSha256: sha256('c-before\n') }]
});
await applyChangeSet(privacyPrepared.id);
const postJournal = await readAllFiles(stateDir);
assert(!postJournal.includes(sourceMarker), 'journal persisted change-set source content');
assert(Buffer.byteLength(postJournal, 'utf8') < 200_000, 'bounded journal exceeded expected test ceiling');

const boundedConfig = { ...config, maxOperationReceipts: 8 };
let firstBoundedId = '';
for (let i = 0; i < 9; i += 1) {
  const prepared = await prepareChangeSet({
    operationManager: manager, config: boundedConfig, guard, workspace,
    changes: [{ path: `bounded-${i}.txt`, content: `value-${i}\n` }]
  });
  if (i === 0) firstBoundedId = prepared.id;
}
const { getPreparedChangeSet } = await import('../dist/operations/changesets.js');
assert(getPreparedChangeSet(firstBoundedId) === null, 'prepared change-set cache was not bounded');

const mcpStateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-operation-mcp-state-'));
const mcpClient = new McpClient(['dist/stdio.js','--root',root,'--allow-root',root,'--write','workspace','--tool-mode','full'], {
  ...process.env, CODEXPRO_ROOT: root, CODEXPRO_ALLOWED_ROOTS: root, CODEXPRO_OPERATION_DIR: mcpStateDir, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1'
});
await mcpClient.request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'operation-smoke',version:'0.1.0'}});
mcpClient.notify('notifications/initialized');
const listed=await mcpClient.request('tools/list',{});
for (const name of ['operation_status','prepare_change_set','apply_change_set','revert_operation']) assert(listed.tools.some((tool)=>tool.name===name), `missing operation tool ${name}`);
const firstWrite=await mcpClient.request('tools/call',{name:'write',arguments:{path:'mcp-operation.txt',content:'one\n',idempotency_key:'mcp-write-1'}});
assert(firstWrite.structuredContent.operation?.state==='completed','write did not return completed operation receipt');
const secondWrite=await mcpClient.request('tools/call',{name:'write',arguments:{path:'mcp-operation.txt',content:'two\n',idempotency_key:'mcp-write-1'}});
assert(secondWrite.structuredContent.replayed===true,'write retry did not report replay');
assert(await fs.readFile(path.join(root,'mcp-operation.txt'),'utf8')==='one\n','write retry duplicated mutation');
const opStatus=await mcpClient.request('tools/call',{name:'operation_status',arguments:{operation_id:firstWrite.structuredContent.operation.id}});
assert(opStatus.structuredContent.operation?.state==='completed','operation_status did not return durable receipt');
await fs.writeFile(path.join(root,'mcp-tx.txt'),'base\n','utf8');
const txPrepared=await mcpClient.request('tools/call',{name:'prepare_change_set',arguments:{changes:[{path:'mcp-tx.txt',content:'changed\n',expected_sha256:sha256('base\n')}],idempotency_key:'mcp-tx-1'}});
const txId=txPrepared.structuredContent.change_set?.id;
assert(txId,'prepare_change_set did not return an id');
const txApplied=await mcpClient.request('tools/call',{name:'apply_change_set',arguments:{change_set_id:txId}});
assert(txApplied.structuredContent.operation?.state==='completed','apply_change_set did not complete through MCP');
assert(await fs.readFile(path.join(root,'mcp-tx.txt'),'utf8')==='changed\n','MCP transaction did not change file');
const txReverted=await mcpClient.request('tools/call',{name:'revert_operation',arguments:{operation_id:txApplied.structuredContent.operation.id}});
assert(txReverted.structuredContent.operation?.state==='completed','revert_operation did not complete through MCP');
assert(await fs.readFile(path.join(root,'mcp-tx.txt'),'utf8')==='base\n','MCP revert did not restore file');
mcpClient.close();

console.log('✓ operation core smoke test passed');

async function readAllFiles(dir) {
  let out = '';
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out += await readAllFiles(full);
    else out += await fs.readFile(full, 'utf8');
  }
  return out;
}
