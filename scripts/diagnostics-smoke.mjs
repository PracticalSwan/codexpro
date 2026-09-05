import { TelemetryRegistry } from '../dist/telemetry.js';
import { connectionDiagnostics, toolSurfaceDiagnostics } from '../dist/diagnosticsOps.js';
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

console.log('✓ diagnostics smoke test passed');
