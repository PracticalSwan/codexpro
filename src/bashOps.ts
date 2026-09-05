import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { analyse } from "chardet";
import iconv from "iconv-lite";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";
import { redactSensitiveText } from "./redact.js";

export type BashRuntimeKind = "native-bash" | "wsl" | "unix-bash" | "unavailable";

export interface BashRuntimeInfo {
  available: boolean;
  executable: string | null;
  runtime: BashRuntimeKind;
  source: "configured" | "git-for-windows" | "path" | "system" | "unavailable";
  error?: string;
}

export interface BashToolInfo {
  path: string | null;
  version: string | null;
}

export interface BashToolchainInfo {
  runtime: BashRuntimeInfo;
  cwd: string | null;
  tools: Record<"node" | "npm" | "npx" | "git" | "rg", BashToolInfo>;
}

export type BashTerminationReason = "normal" | "timeout" | "output_limit" | "signal";

export interface BashResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  terminationReason: BashTerminationReason;
  observedStdoutBytes: number;
  observedStderrBytes: number;
  observedOutputBytes: number;
  retainedStdoutBytes: number;
  retainedStderrBytes: number;
  stdoutEncoding: string;
  stderrEncoding: string;
  bashExecutable: string;
  bashRuntime: BashRuntimeKind;
  bashRuntimeSource: BashRuntimeInfo["source"];
  bashSessionId?: string;
}

const SAFE_ALLOWED_PREFIXES = [
  "pwd",
  "ls",
  "find",
  "git status",
  "git diff",
  "git log",
  "git show",
  "git branch",
  "git rev-parse",
  "git ls-files",
  "npm test",
  "npm run test",
  "npm run typecheck",
  "npm run lint",
  "npm run build",
  "npm run check",
  "pnpm test",
  "pnpm run test",
  "pnpm run typecheck",
  "pnpm run lint",
  "pnpm run build",
  "pnpm run check",
  "yarn test",
  "yarn run test",
  "yarn run typecheck",
  "yarn run lint",
  "yarn run build",
  "yarn run check",
  "bun test",
  "bun run test",
  "bun run typecheck",
  "bun run lint",
  "bun run build",
  "pytest",
  "python -m pytest",
  "python3 -m pytest",
  "uv run pytest",
  "go test",
  "cargo test",
  "cargo check",
  "cargo clippy",
  "tsc",
  "npx tsc",
  "eslint",
  "npx eslint",
  "biome check",
  "npx biome check"
];

const SAFE_BLOCKED_PATTERNS = [
  /(^|\s)rm\s+/,
  /(^|\s)mv\s+/,
  /(^|\s)cp\s+/,
  /(^|\s)dd\s+/,
  /(^|\s)sudo\s+/,
  /(^|\s)chmod\s+/,
  /(^|\s)chown\s+/,
  /(^|\s)kill\s+/,
  /(^|\s)pkill\s+/,
  /(^|\s)curl\s+/,
  /(^|\s)wget\s+/,
  /(^|\s)ssh\s+/,
  /(^|\s)scp\s+/,
  /(^|\s)rsync\s+/,
  /(^|\s)docker\s+/,
  /(^|\s)podman\s+/,
  /(^|\s)git\s+push\b/,
  /(^|\s)git\s+reset\b/,
  /(^|\s)git\s+clean\b/,
  /(^|\s)git\s+checkout\b/,
  /(^|\s)git\s+switch\b/,
  /(^|\s)git\s+restore\b/,
  /(^|\s)(npm|pnpm|yarn)\s+publish\b/,
  /(^|\s)--no-index\b/,
  /(^|\s)--fix\b/,
  /(^|\s)(\/|~(?:\/|\s|$))/,
  /(^|\s)\.\.(?:\/|\s|$)/,
  /\$/,
  process.platform === "win32"
    ? /(^|[\s:])(?:\.env(?:[./\s:]|$)|\.git(?:[\/\s:]|$)|node_modules(?:[\/\s:]|$)|\.ssh(?:[\/\s:]|$)|id_rsa(?:[.\s:]|$)|id_ed25519(?:[.\s:]|$)|[^\s:]*\.(?:pem|key)(?:[\s:]|$))/i
    : /(^|[\s:])(?:\.env(?:[./\s:]|$)|\.git(?:[\/\s:]|$)|node_modules(?:[\/\s:]|$)|\.ssh(?:[\/\s:]|$)|id_rsa(?:[.\s:]|$)|id_ed25519(?:[.\s:]|$)|[^\s:]*\.(?:pem|key)(?:[\s:]|$))/,
  /(^|\s)['"]?-exec(?:['"]|\s|$)/,
  /(^|\s)['"]?-execdir(?:['"]|\s|$)/,
  /(^|\s)['"]?-delete(?:['"]|\s|$)/,
  /(^|\s)['"]?-ok(?:['"]|\s|$)/,
  /(^|\s)['"]?-okdir(?:['"]|\s|$)/,
  /(^|\s)['"]?-fprint0?(?:['"]|\s|$)/,
  /(^|\s)['"]?-fprintf(?:['"]|\s|$)/,
  /(^|\s)['"]?-fls(?:['"]|\s|$)/,
  /(^|\s)['"]?--output(?:=|['"]|\s|$)/,
  /(^|\s)(sed|perl)\s+.*(^|\s)-i(\s|$)/,
  /(^|\s)(cat|grep|rg|head|tail|wc)\s+/,
  /[;&|<>`]/,
  /[\r\n]/
];

function compact(command: string): string {
  return command.trim().replace(/\s+/g, " ");
}

function startsWithAllowedPrefix(command: string): boolean {
  const normalized = compact(command);
  return isAllowedPackageScript(normalized) || SAFE_ALLOWED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix} `));
}

function isAllowedPackageScript(command: string): boolean {
  const packageScriptPattern =
    /^(?:npm|pnpm|yarn|bun)\s+run\s+(?:test|typecheck|lint|build|check)(?::[A-Za-z0-9._-]+)*(?:\s+--\s+[A-Za-z0-9._:= -]+)?$/;
  return packageScriptPattern.test(command);
}

export function assertBashCommandAllowed(config: CodexProConfig, command: string): void {
  if (config.bashMode === "off") {
    throw new CodexProError("bash tool is disabled. Start with CODEXPRO_BASH_MODE=safe or CODEXPRO_BASH_MODE=full to enable it.");
  }
  if (config.bashMode === "full") return;

  const raw = command.trim();
  const normalized = compact(command);
  for (const pattern of SAFE_BLOCKED_PATTERNS) {
    if (pattern.test(raw) || pattern.test(normalized)) {
      throw new CodexProError(
        `Command is blocked in CODEXPRO_BASH_MODE=safe: ${normalized}\n` +
          "Use separate read/search/git tools, or restart with CODEXPRO_BASH_MODE=full only for trusted repos."
      );
    }
  }
  if (!startsWithAllowedPrefix(normalized)) {
    throw new CodexProError(
      `Command is not in the safe bash allowlist: ${normalized}\n` +
        "Allowed examples: ls, find, git status, git diff, npm test, npm run typecheck, npm run build:clients, pytest, go test, cargo test. Use read/search tools for file contents. " +
        "Use CODEXPRO_BASH_MODE=full for trusted local automation."
    );
  }
}

export function assertBashSession(config: CodexProConfig, sessionId?: string): string | undefined {
  const requested = sessionId?.trim();
  if (!config.bashSessionId) {
    if (config.requireBashSession) {
      throw new CodexProError("bash session guard is enabled but no server bash session id is configured.");
    }
    return undefined;
  }
  if (!requested) {
    if (config.requireBashSession) {
      throw new CodexProError(`bash session id is required. Retry with session_id="${config.bashSessionId}".`);
    }
    return config.bashSessionId;
  }
  if (requested !== config.bashSessionId) {
    throw new CodexProError(`bash session id mismatch. This CodexPro server accepts session_id="${config.bashSessionId}".`);
  }
  return config.bashSessionId;
}

function isUsableAbsoluteDir(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (!trimmed) return undefined;
  if (!path.isAbsolute(trimmed) && !path.win32.isAbsolute(trimmed)) return undefined;
  try {
    const resolved = path.resolve(trimmed);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  } catch {
    // Ignore unreadable candidates and keep searching.
  }
  return undefined;
}

/** Resolve a usable absolute home for restricted child processes. Rejects relative junk like "=". */
export function resolveUsableHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    isUsableAbsoluteDir(env.USERPROFILE) ??
    isUsableAbsoluteDir(env.HOME) ??
    isUsableAbsoluteDir(os.homedir()) ??
    path.resolve(os.homedir())
  );
}

export function makeRestrictedBashEnv(
  config: CodexProConfig,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  if (config.inheritEnv) {
    return { ...env, NO_COLOR: "1", CI: env.CI ?? "1" };
  }
  const home = resolveUsableHomeDir(env);
  const restricted: NodeJS.ProcessEnv = {
    PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    USER: env.USER ?? env.USERNAME ?? "",
    SHELL: env.SHELL ?? "/bin/bash",
    TMPDIR: isUsableAbsoluteDir(env.TMPDIR) ?? isUsableAbsoluteDir(env.TMP) ?? os.tmpdir(),
    TERM: "dumb",
    NO_COLOR: "1",
    CI: "1"
  };
  if (process.platform === "win32") {
    restricted.USERPROFILE = home;
    const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? env.WINDIR;
    const defaultComSpec = systemRoot ? path.win32.join(systemRoot, 'System32', 'cmd.exe') : undefined;
    const comSpec = env.ComSpec ?? env.COMSPEC ?? defaultComSpec;
    if (comSpec && path.win32.isAbsolute(comSpec) && fs.existsSync(comSpec)) restricted.ComSpec = comSpec;
    if (systemRoot && path.win32.isAbsolute(systemRoot)) {
      restricted.SystemRoot = systemRoot;
      restricted.WINDIR = env.WINDIR ?? systemRoot;
    }
    if (env.PATHEXT) restricted.PATHEXT = env.PATHEXT;
    const appData = isUsableAbsoluteDir(env.APPDATA);
    const localAppData = isUsableAbsoluteDir(env.LOCALAPPDATA);
    if (appData) restricted.APPDATA = appData;
    if (localAppData) restricted.LOCALAPPDATA = localAppData;
    if (env.USERNAME) restricted.USERNAME = env.USERNAME;
    if (env.HOMEDRIVE && env.HOMEPATH && path.win32.isAbsolute(path.win32.join(env.HOMEDRIVE, env.HOMEPATH))) {
      restricted.HOMEDRIVE = env.HOMEDRIVE;
      restricted.HOMEPATH = env.HOMEPATH;
    }
  }
  return restricted;
}

function makeEnv(config: CodexProConfig): NodeJS.ProcessEnv {
  return makeRestrictedBashEnv(config);
}

function usableExecutableFile(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined;
  try {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return undefined;
    return fs.realpathSync.native(resolved);
  } catch {
    return undefined;
  }
}

function commandPaths(command: string): string[] {
  const lookup = process.platform === "win32"
    ? spawnSync("where.exe", [command], { encoding: "utf8", windowsHide: true })
    : spawnSync("/bin/sh", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  if (lookup.error || lookup.status !== 0) return [];
  return String(lookup.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isWindowsWslLauncher(executable: string, env: NodeJS.ProcessEnv): boolean {
  const normalized = path.win32.normalize(executable).toLowerCase();
  const systemRoot = path.win32.normalize(env.SystemRoot || env.WINDIR || "C:\\Windows").toLowerCase();
  return (
    normalized === path.win32.join(systemRoot, "System32", "bash.exe").toLowerCase() ||
    normalized === path.win32.join(systemRoot, "Sysnative", "bash.exe").toLowerCase() ||
    normalized.includes("\\windowsapps\\bash.exe")
  );
}

function gitForWindowsBashCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  for (const gitPath of commandPaths("git")) {
    const parent = path.win32.dirname(gitPath);
    const parentName = path.win32.basename(parent).toLowerCase();
    if (parentName === "cmd" || parentName === "bin") {
      candidates.push(path.win32.join(path.win32.dirname(parent), "bin", "bash.exe"));
    }
  }
  for (const base of [env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]]) {
    if (base) candidates.push(path.win32.join(base, "Git", "bin", "bash.exe"));
  }
  return [...new Set(candidates)];
}

export function resolveBashRuntime(config: CodexProConfig, env: NodeJS.ProcessEnv = process.env): BashRuntimeInfo {
  if (config.bashExecutable) {
    const executable = usableExecutableFile(config.bashExecutable);
    if (!executable) {
      return {
        available: false,
        executable: null,
        runtime: "unavailable",
        source: "configured",
        error: `Configured Bash executable is unavailable: ${config.bashExecutable}`
      };
    }
    return {
      available: true,
      executable,
      runtime: process.platform === "win32" && isWindowsWslLauncher(executable, env) ? "wsl" : process.platform === "win32" ? "native-bash" : "unix-bash",
      source: "configured"
    };
  }

  if (process.platform === "win32") {
    for (const candidate of gitForWindowsBashCandidates(env)) {
      const executable = usableExecutableFile(candidate);
      if (executable) return { available: true, executable, runtime: "native-bash", source: "git-for-windows" };
    }
    for (const candidate of commandPaths("bash")) {
      const executable = usableExecutableFile(candidate);
      if (!executable || isWindowsWslLauncher(executable, env)) continue;
      return { available: true, executable, runtime: "native-bash", source: "path" };
    }
    const wslLauncher = commandPaths("bash")
      .map((candidate) => usableExecutableFile(candidate))
      .find((candidate): candidate is string => Boolean(candidate && isWindowsWslLauncher(candidate, env)));
    return {
      available: false,
      executable: null,
      runtime: "unavailable",
      source: "unavailable",
      error: wslLauncher
        ? "Only the Windows WSL bash launcher was found. CodexPro does not auto-select WSL for a Windows-native workspace; install Git for Windows or set CODEXPRO_BASH_EXECUTABLE explicitly to opt in."
        : "No Bash executable was found. Install Git for Windows or set CODEXPRO_BASH_EXECUTABLE to an absolute Bash path."
    };
  }

  const systemBash = usableExecutableFile("/bin/bash");
  if (systemBash) return { available: true, executable: systemBash, runtime: "unix-bash", source: "system" };
  const pathBash = commandPaths("bash").map((candidate) => usableExecutableFile(candidate)).find(Boolean);
  if (pathBash) return { available: true, executable: pathBash, runtime: "unix-bash", source: "path" };
  return { available: false, executable: null, runtime: "unavailable", source: "unavailable", error: "No Bash executable was found." };
}

function probeThroughBash(runtime: BashRuntimeInfo, cwd: string, env: NodeJS.ProcessEnv, command: string): string | null {
  if (!runtime.available || !runtime.executable) return null;
  const result = spawnSync(runtime.executable, ["-lc", command], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 2_000,
    maxBuffer: 32_000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) return null;
  return String(result.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}

export function probeBashToolchain(config: CodexProConfig, workspace: Workspace): BashToolchainInfo {
  const runtime = resolveBashRuntime(config);
  const env = makeEnv(config);
  const tools = {} as BashToolchainInfo["tools"];
  const cwd = probeThroughBash(runtime, workspace.root, env, "pwd");
  for (const tool of ["node", "npm", "npx", "git", "rg"] as const) {
    tools[tool] = {
      path: probeThroughBash(runtime, workspace.root, env, `command -v ${tool}`),
      version: probeThroughBash(runtime, workspace.root, env, `${tool} --version`)
    };
  }
  return { runtime, cwd, tools };
}

function utf8PrefixByBytes(value: string, maxBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const char of value) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (bytes + charBytes > maxBytes) break;
    bytes += charBytes;
    end += char.length;
  }
  return value.slice(0, end);
}

function trimOutput(value: string, maxBytes: number, forceTruncated = false): { value: string; truncated: boolean } {
  const byteLength = Buffer.byteLength(value, "utf8");
  if (byteLength <= maxBytes && !forceTruncated) return { value, truncated: false };
  const sliced = byteLength > maxBytes ? utf8PrefixByBytes(value, maxBytes) : value;
  return { value: `${sliced}\n...[output truncated to ${maxBytes} retained bytes]`, truncated: true };
}

export type BashEncodingCandidate = { name: string; confidence: number };
export type BashEncodingDetector = (input: Buffer) => BashEncodingCandidate[];
export interface DecodedBashOutput { text: string; encoding: string }

function decodeLikelyUtf16(bytes: Buffer): DecodedBashOutput | undefined {
  if (bytes.length < 4) return undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: iconv.decode(bytes.subarray(2), "utf16le"), encoding: "utf16le" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: iconv.decode(bytes.subarray(2), "utf16-be"), encoding: "utf16be" };
  if (bytes.length % 2 !== 0) return undefined;

  const pairs = bytes.length / 2;
  let evenNuls = 0;
  let oddNuls = 0;
  for (let index = 0; index < bytes.length; index += 2) {
    if (bytes[index] === 0) evenNuls += 1;
    if (bytes[index + 1] === 0) oddNuls += 1;
  }
  const evenRatio = evenNuls / pairs;
  const oddRatio = oddNuls / pairs;
  if (oddRatio >= 0.3 && oddRatio >= evenRatio + 0.2) return { text: iconv.decode(bytes, "utf16le"), encoding: "utf16le" };
  if (evenRatio >= 0.3 && evenRatio >= oddRatio + 0.2) return { text: iconv.decode(bytes, "utf16-be"), encoding: "utf16be" };
  return undefined;
}

export function decodeBashOutputDetailed(
  bytes: Buffer,
  platform: NodeJS.Platform = process.platform,
  allowTrailingIncompleteUtf8 = false,
  detect: BashEncodingDetector = analyse
): DecodedBashOutput {
  const utf8Fallback = (encoding = "utf8") => ({ text: bytes.toString("utf8"), encoding });
  const decodeUtf8 = (): DecodedBashOutput | undefined => {
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return { text: decoder.decode(bytes, { stream: allowTrailingIncompleteUtf8 }), encoding: "utf8" };
    } catch {
      return undefined;
    }
  };
  if (bytes.length === 0) return utf8Fallback();
  if (platform !== "win32") return decodeUtf8() ?? utf8Fallback("utf8-fallback");

  const utf16 = decodeLikelyUtf16(bytes);
  if (utf16 !== undefined) return utf16;

  const utf8 = decodeUtf8();
  if (utf8) return utf8;

  try {
    const candidate = detect(bytes)[0];
    if (!candidate || candidate.confidence < 80 || !iconv.encodingExists(candidate.name)) return utf8Fallback("utf8-fallback");
    return { text: iconv.decode(bytes, candidate.name), encoding: candidate.name };
  } catch {
    return utf8Fallback("utf8-fallback");
  }
}

/** Decode one completed bash output stream without allowing a detected encoding to affect another stream. */
export function decodeBashOutput(
  bytes: Buffer,
  platform: NodeJS.Platform = process.platform,
  allowTrailingIncompleteUtf8 = false,
  detect: BashEncodingDetector = analyse
): string {
  return decodeBashOutputDetailed(bytes, platform, allowTrailingIncompleteUtf8, detect).text;
}

export function terminateProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    // Windows does not provide Unix-style cooperative signals to process trees.
    // Force the full tree while the parent PID still identifies its descendants;
    // otherwise the shell can exit first and orphan an output-heavy grandchild.
    const args = ["/pid", String(child.pid), "/t", "/f"];
    const result = spawnSync("taskkill", args, { stdio: "ignore", windowsHide: true });
    if (result.status !== 0) child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(signal);
  }
}

export async function runBash(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  command: string,
  options: { cwd?: string; timeoutMs?: number; sessionId?: string } = {}
): Promise<BashResult> {
  if (!command?.trim()) throw new CodexProError("command is required.");
  const bashSessionId = assertBashSession(config, options.sessionId);
  assertBashCommandAllowed(config, command);
  const cwdResolved = guard.resolve(workspace, options.cwd ?? ".");
  const cwd = cwdResolved.absPath;
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 30_000, config.maxBashTimeoutMs));
  const start = Date.now();
  const bashRuntime = resolveBashRuntime(config);
  if (!bashRuntime.available || !bashRuntime.executable) {
    throw new CodexProError(bashRuntime.error || "Bash is unavailable.");
  }
  const bashExecutable = bashRuntime.executable;

  return new Promise((resolve, reject) => {
    const child = spawn(bashExecutable, ["-lc", command], {
      cwd,
      env: makeEnv(config),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let killedByTimeout = false;
    let killedByOutputLimit = false;
    let closed = false;
    let terminationStarted = false;
    let killTimer: NodeJS.Timeout | undefined;
    let observedStdoutBytes = 0;
    let observedStderrBytes = 0;
    let retainedStdoutBytes = 0;
    let retainedStderrBytes = 0;
    let retainedBytes = 0;
    const retainedOutputBytes = config.maxOutputBytes + 1;
    const observedOutputLimit = Math.max(retainedOutputBytes, config.maxBashObservedOutputBytes);

    const terminate = (signal: NodeJS.Signals) => {
      if (closed) return;
      terminationStarted = true;
      terminateProcessTree(child, signal);
    };
    const terminateWithEscalation = () => {
      if (terminationStarted || closed) return;
      terminate("SIGTERM");
      killTimer = setTimeout(() => terminate("SIGKILL"), 1_500);
      killTimer.unref();
    };
    const appendBounded = (stream: "stdout" | "stderr", chunks: Buffer[], chunk: Buffer) => {
      if (stream === "stdout") observedStdoutBytes += chunk.byteLength;
      else observedStderrBytes += chunk.byteLength;
      const remaining = retainedOutputBytes - retainedBytes;
      if (remaining <= 0) return;
      const retained = chunk.subarray(0, remaining);
      chunks.push(retained);
      retainedBytes += retained.byteLength;
      if (stream === "stdout") retainedStdoutBytes += retained.byteLength;
      else retainedStderrBytes += retained.byteLength;
    };
    const enforceObservedOutputLimit = () => {
      const observed = observedStdoutBytes + observedStderrBytes;
      if (!killedByOutputLimit && observed > observedOutputLimit) {
        killedByOutputLimit = true;
        terminateWithEscalation();
      }
    };

    const timer = setTimeout(() => {
      killedByTimeout = true;
      terminateWithEscalation();
    }, timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk) => {
      appendBounded("stdout", stdoutChunks, Buffer.from(chunk));
      enforceObservedOutputLimit();
    });
    child.stderr.on("data", (chunk) => {
      appendBounded("stderr", stderrChunks, Buffer.from(chunk));
      enforceObservedOutputLimit();
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      closed = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const observedOutputBytes = observedStdoutBytes + observedStderrBytes;
      const captureTruncated = observedOutputBytes > retainedBytes;
      const allowTrailingIncompleteUtf8 = killedByTimeout || killedByOutputLimit || captureTruncated;
      const decodedStdout = decodeBashOutputDetailed(Buffer.concat(stdoutChunks), process.platform, allowTrailingIncompleteUtf8);
      const decodedStderr = decodeBashOutputDetailed(Buffer.concat(stderrChunks), process.platform, allowTrailingIncompleteUtf8);
      let stderr = decodedStderr.text;
      if (killedByTimeout) {
        stderr += `\n[codexpro] Command timed out after ${timeoutMs} ms.`;
      } else if (killedByOutputLimit) {
        stderr += `\n[codexpro] Command terminated after exceeding ${observedOutputLimit} observed output bytes.`;
      }
      const out = trimOutput(
        redactSensitiveText(decodedStdout.text),
        config.maxOutputBytes,
        observedStdoutBytes > retainedStdoutBytes
      );
      const err = trimOutput(
        redactSensitiveText(stderr),
        config.maxOutputBytes,
        observedStderrBytes > retainedStderrBytes
      );
      const terminationReason: BashTerminationReason = killedByOutputLimit
        ? "output_limit"
        : killedByTimeout
          ? "timeout"
          : signal
            ? "signal"
            : "normal";
      resolve({
        command,
        cwd: path.relative(workspace.root, cwd) || ".",
        exitCode,
        signal,
        durationMs: Date.now() - start,
        stdout: out.value,
        stderr: err.value,
        truncated: captureTruncated || out.truncated || err.truncated,
        terminationReason,
        observedStdoutBytes,
        observedStderrBytes,
        observedOutputBytes,
        retainedStdoutBytes,
        retainedStderrBytes,
        stdoutEncoding: decodedStdout.encoding,
        stderrEncoding: decodedStderr.encoding,
        bashExecutable,
        bashRuntime: bashRuntime.runtime,
        bashRuntimeSource: bashRuntime.source,
        ...(bashSessionId ? { bashSessionId } : {})
      });
    });
  });
}
