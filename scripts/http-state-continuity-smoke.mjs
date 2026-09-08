import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { JobStore } from "../dist/jobs/store.js";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("no free port")));
    });
    server.on("error", reject);
  });
}

async function waitForListening(child) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error(`HTTP server did not start\n${stderr}`)), 15_000);
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.includes("HTTP MCP listening")) { clearTimeout(timer); resolve(); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`HTTP server exited early: ${code}\n${stderr}`)); });
  });
}

async function withFreshClient(url, token, fn) {
  const client = new Client({ name: "codexpro-http-state-smoke", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } }
  });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content?.find?.((part) => part.type === "text")?.text ?? JSON.stringify(result.structuredContent);
    throw new Error(`${name} failed: ${text}`);
  }
  return result.structuredContent;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-http-state-"));
const home = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-http-state-home-"));
const port = await freePort();
const token = "codexpro-http-state-token-1234567890";
const jobDir = path.join(home, "jobs");
await fs.writeFile(path.join(root, "seed.txt"), "seed\n", "utf8");
await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "node test.cjs" } }, null, 2), "utf8");
await fs.writeFile(path.join(root, "test.cjs"), "console.log(\"1 passed\");\n", "utf8");
const child = spawn(process.execPath, ["dist/http.js"], {
  cwd: path.resolve("."),
  env: {
    ...process.env,
    CODEXPRO_ROOT: root,
    CODEXPRO_ALLOWED_ROOTS: root,
    CODEXPRO_HOST: "127.0.0.1",
    CODEXPRO_PORT: String(port),
    CODEXPRO_HTTP_TOKEN: token,
    CODEXPRO_BASH_MODE: "full",
    CODEXPRO_WRITE_MODE: "workspace",
    CODEXPRO_TOOL_MODE: "full",
    CODEXPRO_HOME: home,
    CODEXPRO_JOB_DIR: jobDir
  },
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForListening(child);
  const url = `http://127.0.0.1:${port}/mcp`;
  let processId;
  let eventCursor;
  let workspaceId;
  let persistedJobId;
  let staleJobId;
  let asyncVerificationJobId;
  await withFreshClient(url, token, async (client) => {
    const opened = await callTool(client, "open_current_workspace");
    workspaceId = opened.workspace?.id ?? opened.workspace_id;
    assert(workspaceId, "workspace id missing for job continuity");
    const started = await callTool(client, "start_workspace_process", {
      command: `node -e "console.log('state-ready'); setTimeout(()=>{},10000)"`
    });
    processId = started.process.id;
    assert.match(processId, /^proc_/);
    const asyncStarted = await callTool(client, "start_verification", { changed_paths: ["seed.txt"] });
    asyncVerificationJobId = asyncStarted.job_id;
    assert.match(asyncVerificationJobId, /^job_/);
    const baseline = await callTool(client, "workspace_events");
    eventCursor = baseline.cursor;
    assert.match(eventCursor, /^evt_/);
  });
  const persistedStore = new JobStore({ baseDir: jobDir });
  const workspace = { id: workspaceId, root };
  const persistedJob = await persistedStore.create({ workspace, kind: "verification" });
  persistedJobId = persistedJob.id;
  await persistedStore.appendOutput(persistedJob.id, "persisted-across-client\n");
  const staleJob = await persistedStore.create({ workspace, kind: "verification" });
  staleJobId = staleJob.id;
  await persistedStore.update(staleJob.id, (record) => {
    record.state = "running";
    record.worker = { pid: process.pid, startedAt: new Date().toISOString(), nonceHash: "a".repeat(64), startKey: "unrelated-process-start" };
    return record;
  });
  await fs.writeFile(path.join(root, "created-after-cursor.txt"), "created\n", "utf8");
  const failures = [];
  await withFreshClient(url, token, async (client) => {
    try {
      const status = await callTool(client, "workspace_process_status", { process_id: processId });
      assert.equal(status.process.id, processId);
      assert.equal(status.process.state, "running");
      let output = "";
      for (let attempt = 0; attempt < 20 && !output.includes("state-ready"); attempt += 1) {
        const page = await callTool(client, "read_workspace_process_output", { process_id: processId, max_bytes: 2048 });
        output = `${page.stdout ?? ""}${page.stderr ?? ""}`;
        if (!output.includes("state-ready")) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.match(output, /state-ready/);
      await callTool(client, "stop_workspace_process", { process_id: processId });
    } catch (error) { failures.push(`process continuity: ${error instanceof Error ? error.message : error}`); }

    try {
      let asyncStatus;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        asyncStatus = await callTool(client, "job_status", { job_id: asyncVerificationJobId });
        if (["completed", "failed", "canceled"].includes(asyncStatus.job.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(asyncStatus.job.state, "completed");
      assert.equal(asyncStatus.job.result.complete, true);
      assert.equal(asyncStatus.job.result.ok, true);
    } catch (error) { failures.push(`async verification continuity: ${error instanceof Error ? error.message : error}`); }

    try {
      const persisted = await callTool(client, "job_status", { job_id: persistedJobId });
      assert.equal(persisted.job.id, persistedJobId);
      assert.equal(persisted.job.state, "queued");
      const output = await callTool(client, "read_job_output", { job_id: persistedJobId, cursor: 0, max_bytes: 2048 });
      assert.match(output.text, /persisted-across-client/);
      const stale = await callTool(client, "job_status", { job_id: staleJobId });
      assert.equal(stale.job.state, "interrupted");
      assert.match(stale.job.error, /no longer live|identity/i);
    } catch (error) { failures.push(`job continuity: ${error instanceof Error ? error.message : error}`); }

    try {
      const events = await callTool(client, "workspace_events", { cursor: eventCursor });
      assert(events.events.some((event) => event.kind === "create" && event.path === "created-after-cursor.txt"));
    } catch (error) { failures.push(`event continuity: ${error instanceof Error ? error.message : error}`); }
  });

  if (failures.length) throw new Error(failures.join("\n"));
  await withFreshClient(url, token, async (client) => {
    const finalStatus = await callTool(client, "workspace_process_status", { process_id: processId });
    assert.notEqual(finalStatus.process.state, "running");
  });
  console.log("http state continuity smoke passed");
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(home, { recursive: true, force: true });
}
