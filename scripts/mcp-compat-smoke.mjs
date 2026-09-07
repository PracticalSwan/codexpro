import assert from "node:assert/strict";

async function main() {
  const compat = await import("../dist/mcpCompat.js");
  assert.deepEqual(compat.mcpRuntimeCapabilities(), {
    sdkLine: "v2",
    protocolEra: "2025",
    supportsInputRequired: false,
    supportsTaskExtension: false
  });

  const stdio = compat.createStdioTransportCompat();
  assert.ok(stdio && typeof stdio === "object", "stdio transport should construct");

  const http = compat.createHttpTransportCompat({
    sessionIdGenerator: () => "test-session"
  });
  assert.ok(http && typeof http === "object", "HTTP transport should construct");

  const calls = [];
  compat.registerToolCompat({
    registerTool(name, options, handler) { calls.push({ name, options, handler }); }
  }, "compat_test", { description: "compat" }, async () => ({ ok: true }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "compat_test");
  assert.equal(typeof calls[0].handler, "function");
}

main().then(() => {
  console.log("mcp compat smoke passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
