import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../dist/config.js";
import { PathGuard } from "../dist/guard.js";
import { gitBlame } from "../dist/gitOps.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-git-blame-bounds-"));
const run = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
};

try {
  const text = Array.from({ length: 5000 }, (_, index) => `line-${String(index + 1).padStart(4, "0")} ${"x".repeat(40)}`).join("\n") + "\n";
  await fs.writeFile(path.join(root, "large.txt"), text, "utf8");
  run(["init"]);
  run(["add", "large.txt"]);
  run(["-c", "user.email=blame@example.com", "-c", "user.name=Blame Smoke", "commit", "-m", "large blame fixture"]);

  const config = { ...loadConfig(["--root", root, "--allow-root", root]), maxOutputBytes: 32_000 };
  const workspace = { id: "ws_git_blame_bounds", root, openedAt: new Date().toISOString() };
  const guard = new PathGuard(config);
  const result = gitBlame(config, guard, workspace, { path: "large.txt", maxLines: 5 });
  assert.equal(result.lines.length, 5);
  assert.deepEqual(result.lines.map((line) => line.line), [1, 2, 3, 4, 5]);
  assert.equal(result.truncated, true);
  console.log("git blame bounds smoke passed");
} finally {
  await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
}
