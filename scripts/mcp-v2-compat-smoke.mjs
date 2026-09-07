import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mcpRuntimeCapabilities } from '../dist/mcpCompat.js';

assert.equal(typeof McpServer, 'function');
assert.equal(typeof StdioServerTransport, 'function');
assert.equal(typeof NodeStreamableHTTPServerTransport, 'function');
assert.equal(typeof Client, 'function');
assert.equal(typeof StdioClientTransport, 'function');
assert.deepEqual(mcpRuntimeCapabilities(), {
  sdkLine: 'v2', protocolEra: '2025',
  supportsInputRequired: false, supportsTaskExtension: false
});
console.log('MCP v2 compatibility smoke passed');
