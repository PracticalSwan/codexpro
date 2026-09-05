import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoalStore } from "../dist/goals/store.js";
import { proposeGoal, approveGoal } from "../dist/goals/runner.js";
import { GoalScheduler } from "../dist/goals/scheduler.js";

const base = await fs.mkdtemp(path.join(os.tmpdir(), "codexpro-goals-smoke-"));
const store = new GoalStore({ baseDir: base, maxGoals: 32 });
const workspace = { id: "ws_goal_smoke", root: base, openedAt: new Date().toISOString() };
try {
  const proposed = await proposeGoal(store, {
    workspace,
    title: "Build safely",
    summary: "deterministic smoke goal",
    maxWorkers: 2,
    tasks: [
      { id: "a", title: "first", kind: "command", command: "node -e \"process.exit(0)\"", dependsOn: [] },
      { id: "b", title: "second", kind: "command", command: "node -e \"process.exit(0)\"", dependsOn: ["a"] },
      { id: "c", title: "third", kind: "command", command: "node -e \"process.exit(0)\"", dependsOn: ["a"] }
    ]
  });
  assert.equal(proposed.state, "proposed");
  await assert.rejects(() => approveGoal(store, proposed.id, "bad"), /fingerprint/i);
  const approved = await approveGoal(store, proposed.id, proposed.fingerprint);
  assert.equal(approved.state, "approved");

  let active = 0; let maxActive = 0; const order = [];
  const scheduler = new GoalScheduler(store, async (goal, task) => {
    active += 1; maxActive = Math.max(maxActive, active); order.push(`start:${task.id}`);
    await new Promise((resolve) => setTimeout(resolve, task.id === "a" ? 30 : 10));
    active -= 1; order.push(`end:${task.id}`);
    return { ok: true, summary: `${task.id} ok` };
  }, { maxWorkers: 2 });
  const completed = await scheduler.runUntilBoundary(approved.id);
  assert.equal(completed.state, "awaiting_review");
  assert(maxActive <= 2);
  assert(order.indexOf("end:a") < order.indexOf("start:b"));
  assert(order.indexOf("end:a") < order.indexOf("start:c"));
  assert(completed.tasks.every((task) => task.state === "succeeded"));

  await assert.rejects(() => proposeGoal(store, {
    workspace, title: "cycle", tasks: [
      { id: "x", title: "x", kind: "command", command: "echo x", dependsOn: ["y"] },
      { id: "y", title: "y", kind: "command", command: "echo y", dependsOn: ["x"] }
    ]
  }), /cycle/i);
  await assert.rejects(() => proposeGoal(store, {
    workspace, title: "secret", tasks: [{ id: "s", title: "s", kind: "command", command: "OPENAI_API_KEY=sk-realSecretValue123456789", dependsOn: [] }]
  }), /secret/i);
  console.log("goals smoke passed");
} finally {
  await fs.rm(base, { recursive: true, force: true });
}
