import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mcpRuntimeCapabilities } from '../dist/mcpCompat.js';
import { loadWorkspacePolicyStateSync } from '../dist/policyOps.js';

const caps = mcpRuntimeCapabilities();
assert.equal(caps.sdkLine, 'v2');
assert.equal(caps.protocolEra, '2025');
assert.equal(caps.supportsInputRequired, false);
assert.equal(caps.supportsTaskExtension, false);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-approval-gate-'));
try {
  await fs.writeFile(path.join(root, '.codexpro-policy.json'), JSON.stringify({
    version: 2,
    toolRules: [{ action: 'write', resource: 'src/**', effect: 'ask' }]
  }));
  assert.throws(() => loadWorkspacePolicyStateSync(root), /invalid workspace policy/i,
    'unsupported ask policy must fail closed');

  await fs.writeFile(path.join(root, '.codexpro-policy.json'), JSON.stringify({
    version: 2,
    toolRules: [{ action: 'write', resource: 'src/**', effect: 'deny' }]
  }));
  assert.equal(loadWorkspacePolicyStateSync(root)?.policy.version, 2);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('MCP approvals capability gate smoke passed');
