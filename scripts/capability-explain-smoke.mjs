import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config.js';
import { explainCapabilities } from '../dist/capabilityExplain.js';

const config = loadConfig(['--tool-mode', 'full', '--write', 'off', '--bash', 'off']);
const capabilities = explainCapabilities({
  config: { ...config, analysisEnabled: true, codeGraphEnabled: true, lspEnabled: true, localServiceProbeEnabled: false },
  registeredTools: ['job_status', 'start_checks', 'inspect_workspace', 'codegraph_sync', 'code_intelligence_status'],
  providerStatuses: [{ id: 'codegraph', available: false, detail: 'fixture unavailable' }, { id: 'lsp', available: true }]
});
assert.equal(capabilities.find((item) => item.id === 'workspace_write')?.state, 'disabled');
assert.equal(capabilities.find((item) => item.id === 'codegraph')?.state, 'unavailable');
assert.equal(capabilities.find((item) => item.id === 'lsp')?.state, 'available');
const unknown = explainCapabilities({ config: { ...config, codeGraphEnabled: true }, registeredTools: ['codegraph_sync'] });
assert.equal(unknown.find((item) => item.id === 'codegraph')?.state, 'degraded');
console.log('capability explanation smoke passed');
