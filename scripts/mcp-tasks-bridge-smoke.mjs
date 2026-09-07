import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mcpRuntimeCapabilities } from '../dist/mcpCompat.js';

assert.equal(mcpRuntimeCapabilities().supportsTaskExtension, false);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexpro-tasks-gate-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/stdio.js', '--root', root, '--allow-root', root, '--bash', 'off', '--write', 'off', '--tool-mode', 'minimal'],
  env: { ...process.env, CODEXPRO_ALLOW_NO_HTTP_TOKEN: '1' }
});
const client = new Client({ name: 'tasks-gate-smoke', version: '0.1.0' });
try {
  await client.connect(transport);
  const caps = client.getServerCapabilities?.() ?? {};
  assert.equal(caps.extensions?.['io.modelcontextprotocol/tasks'], undefined, 'Tasks extension must not be advertised');
  const config = await client.callTool({ name: 'server_config', arguments: {} });
  assert.equal(config.structuredContent.mcp.supportsTaskExtension, false);
} finally {
  await client.close().catch(() => {});
  await fs.rm(root, { recursive: true, force: true });
}
console.log('MCP Tasks capability gate smoke passed');
