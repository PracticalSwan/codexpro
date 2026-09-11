import { TelemetryRegistry } from '../dist/telemetry.js';
import { connectionDiagnostics, diagnosticsSnapshot, toolSurfaceDiagnostics } from '../dist/diagnosticsOps.js';
import { loadConfig } from '../dist/config.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function assert(condition, message) { if (!condition) throw new Error(message); }

const telemetry = new TelemetryRegistry({ maxEvents: 3, maxCounters: 16 });
let connection = connectionDiagnostics(telemetry.snapshot(), 0);
assert(connection.state === 'no_requests', `expected no_requests, got ${connection.state}`);
telemetry.record({ stage: 'request_arrival', status: 'ok' });
connection = connectionDiagnostics(telemetry.snapshot(), 0);
assert(connection.state === 'arrived_not_dispatched', `expected arrived_not_dispatched, got ${connection.state}`);
telemetry.record({ stage: 'dispatch', status: 'error', tool: 'read' });
connection = connectionDiagnostics(telemetry.snapshot(), 0);
assert(connection.state === 'dispatch_failed', `expected dispatch_failed, got ${connection.state}`);
telemetry.record({ stage: 'dispatch', status: 'ok', tool: 'read' });
telemetry.record({ stage: 'completion', status: 'ok', tool: 'read', durationMs: 12, resultBytes: 40 });
telemetry.record({ stage: 'response', status: 'error' });
connection = connectionDiagnostics(telemetry.snapshot(), 1);
assert(connection.state === 'response_failed', `expected response_failed, got ${connection.state}`);
telemetry.record({ stage: 'request_arrival', status: 'ok' });
telemetry.record({ stage: 'dispatch', status: 'ok', tool: 'read' });
telemetry.record({ stage: 'completion', status: 'ok', tool: 'read', durationMs: 4, resultBytes: 20 });
telemetry.record({ stage: 'response', status: 'ok' });
connection = connectionDiagnostics(telemetry.snapshot(), 1);
assert(connection.state === 'healthy', `expected recovered healthy state after a successful response, got ${connection.state}`);
assert(connection.response_failures === 1, `historical response failure counter should remain visible, got ${connection.response_failures}`);
assert(telemetry.snapshot().events.length === 3, 'telemetry detail records were not bounded');

const secret = 'sk-diagnostics-secret-marker-123456789';
telemetry.record({ stage: 'completion', status: 'error', tool: 'bash', errorBoundary: `Authorization: Bearer ${secret}` });
const serialized = JSON.stringify(telemetry.snapshot());
assert(!serialized.includes(secret), 'telemetry retained a token');
assert(!serialized.includes('Authorization: Bearer'), 'telemetry retained credential-bearing text');
telemetry.record({ stage: 'completion', status: 'error', tool: 'read', errorBoundary: 'failed at C:\\Users\\private-user\\secret.txt' });
assert(!JSON.stringify(telemetry.snapshot()).includes('private-user'), 'telemetry retained an absolute path');
for (let i = 0; i < 100; i += 1) telemetry.record({ stage: 'backend', status: 'ok', backend: `backend-${i}` });
assert(Object.keys(telemetry.snapshot().counters).length <= telemetry.maxCounters, 'telemetry counters were not bounded');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-diagnostics-'));
const config = loadConfig(['--root', root, '--allow-root', root, '--tool-mode', 'full', '--write', 'workspace', '--bash', 'safe']);
const surface = toolSurfaceDiagnostics(config, ['read', 'write', 'unexpected_tool'], ['read', 'write', 'bash']);
assert(surface.missing_tools.includes('bash'), 'tool diagnostics did not identify missing expected tool');
assert(surface.unexpected_tools.includes('unexpected_tool'), 'tool diagnostics did not identify unexpected registered tool');
assert(surface.configured.tool_mode === 'full' && surface.configured.write_mode === 'workspace', 'tool diagnostics omitted configured modes');
const surfaceText = JSON.stringify(surface);
assert(!surfaceText.includes(root), 'tool diagnostics leaked absolute workspace path');

const continuationDiag = diagnosticsSnapshot(
  { ...config, continuationEnabled: true }, telemetry.snapshot(), ['read'], ['read'], 2,
  {
    savedDeadlineMode: 'bounded', savedDeadlineMs: 720_000, activeStructuredJobs: 1,
    continuationFeatureEnabled: true, browserPaired: true, browserAuthState: 'signed_in',
    activeContinuationTasks: 1, userActionRequired: true,
    runtimeGenerationId: 'runtime-test-generation', runtimeDeadlineMode: 'bounded', runtimeDeadlineMs: 1_200_000,
    runtimeTransportState: 'ready'
  }
);
assert(continuationDiag.continuation?.enabled === true, 'diagnostics omitted continuation enabled state');
assert(continuationDiag.continuation?.browser?.paired === true && continuationDiag.continuation?.browser?.auth_state === 'signed_in', 'diagnostics omitted coarse browser state');
assert(continuationDiag.continuation?.active_task_count === 1 && continuationDiag.continuation?.user_action_required === true, 'diagnostics omitted continuation task/action state');
assert(continuationDiag.continuation?.current_runtime?.generation_id === 'runtime-test-generation', 'diagnostics omitted current runtime generation');
assert(continuationDiag.continuation?.current_runtime?.deadline_ms === 1_200_000 && continuationDiag.continuation?.current_runtime?.transport === 'ready', 'diagnostics omitted current runtime deadline/transport');
assert(continuationDiag.continuation?.saved_next_run_deadline?.ms === 720_000, 'diagnostics did not separately label saved-next-run deadline');
const continuationDiagText = JSON.stringify(continuationDiag);
for (const forbidden of ['conversation_route', 'route_fingerprint', 'browser_credential', 'authorization_token']) {
  assert(!continuationDiagText.includes(forbidden), `diagnostics exposed private continuation field: ${forbidden}`);
}

console.log('✓ diagnostics smoke test passed');
