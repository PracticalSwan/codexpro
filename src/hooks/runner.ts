import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSensitiveText } from "../redact.js";
import { projectTrustStatus } from "../projectTrust.js";
import { readGlobalHookSettings } from "./globalSettings.js";
import { readHookConfig } from "./store.js";
import type { HookCommand, HookEvent, HookRequest, HookRunResult } from "./types.js";

const stagedCommitSafetyScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/check-staged-commit.mjs");

function isManagedStagedCommitCommand(command: HookCommand): boolean {
  const executable = path.basename(command.command).toLowerCase();
  if (executable !== "node" && executable !== "node.exe") return false;
  const firstArg = command.args[0]?.replaceAll("\\", "/") ?? "";
  return /(?:^|\/)scripts\/check-staged-commit\.mjs$/i.test(firstArg);
}

function safeEnvironment(event: HookEvent): NodeJS.ProcessEnv {
  const allowed = ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"];
  const env: NodeJS.ProcessEnv = { CODEXPRO_HOOK_EVENT: event };
  for (const key of allowed) if (process.env[key]) env[key] = process.env[key];
  return env;
}

function boundedMessage(stdout: string, stderr: string): string | undefined {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join(" | ");
  return combined ? redactSensitiveText(combined).replace(/\s+/g, " ").slice(0, 2_000) : undefined;
}

async function runOne(event: HookEvent, root: string, command: HookCommand, request: HookRequest): Promise<HookRunResult> {
  const timeoutMs = Math.max(100, Math.min(30_000, command.timeoutMs ?? request.timeoutMs ?? 5_000));
  const maxOutputBytes = Math.max(1_024, Math.min(1_000_000, request.maxOutputBytes ?? 64_000));
  const input = JSON.stringify({ event, ...(request.input ?? {}) }).slice(0, 32_000);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let observed = 0;
    let settled = false;
    let outputLimited = false;
    const child = spawn(command.command, command.args, {
      cwd: root,
      env: safeEnvironment(event),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    const finish = (exitCode: number | null, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let status: HookRunResult["status"] = "allowed";
      if (event === "before_tool" && exitCode === 2) status = "blocked";
      else if (exitCode !== 0 || outputLimited || reason) status = "warning";
      const message = boundedMessage(stdout, stderr) ?? reason;
      resolve({ event, status, exitCode, ...(message ? { message } : {}) });
    };
    const collect = (kind: "stdout" | "stderr", chunk: Buffer) => {
      observed += chunk.length;
      if (observed > maxOutputBytes) {
        outputLimited = true;
        child.kill();
        return;
      }
      if (kind === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8");
    };
    child.stdout?.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.once("error", (error) => finish(null, redactSensitiveText(error.message).slice(0, 500)));
    child.once("exit", (code) => finish(code, outputLimited ? `Hook output exceeded ${maxOutputBytes} bytes.` : undefined));
    const timer = setTimeout(() => {
      child.kill();
      finish(null, `Hook timed out after ${timeoutMs} ms.`);
    }, timeoutMs);
    timer.unref();
    child.stdin?.end(input + "\n");
  });
}

async function runGlobalStagedCommitHook(event: HookEvent, request: HookRequest): Promise<HookRunResult | null> {
  if (event !== "before_tool" || request.input?.tool !== "git_commit") return null;
  let enabled = false;
  try { enabled = readGlobalHookSettings().stagedCommitSafety; }
  catch (error) {
    return { event, status: "blocked", exitCode: 2, message: `Global staged-commit safety hook settings are invalid: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000) };
  }
  if (!enabled) return null;
  const result = await runOne(event, request.root, { command: process.execPath, args: [stagedCommitSafetyScript], timeoutMs: 5_000 }, request);
  if (result.status === "allowed") return result;
  return { ...result, status: "blocked", exitCode: result.exitCode ?? 2, message: result.message ?? "Global staged-commit safety hook failed closed." };
}

export async function runHooks(event: HookEvent, request: HookRequest): Promise<HookRunResult[]> {
  const globalResult = await runGlobalStagedCommitHook(event, request);
  if (globalResult?.status === "blocked") return [globalResult];
  const results: HookRunResult[] = globalResult ? [globalResult] : [];
  const loaded = await readHookConfig(request.root);
  if (!loaded) return results;
  const trust = await projectTrustStatus(request.root, loaded.bytes, request.trustDir);
  let commands = loaded.config.hooks[event] ?? [];
  if (globalResult && event === "before_tool" && request.input?.tool === "git_commit") {
    commands = commands.filter((command) => !isManagedStagedCommitCommand(command));
  }
  if (!commands.length) return results;
  if (!trust.trusted) return [...results, { event, status: "skipped", exitCode: null, message: trust.changed ? "Project hook trust is stale because the hook file changed." : "Project hooks are not trusted." }];
  for (const command of commands) results.push(await runOne(event, request.root, command, request));
  return results;
}
