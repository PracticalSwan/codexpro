import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_ANALYSIS_LIMITS, type AnalysisLimits } from "./analysis/types.js";

export type BashMode = "off" | "safe" | "full";
export type BashTranscriptMode = "compact" | "full";
export type CodexSessionsMode = "off" | "metadata" | "read";
export type WriteMode = "off" | "handoff" | "workspace";
export type ToolMode = "minimal" | "standard" | "full";
export const MIN_HTTP_TOKEN_BYTES = 24;

export interface CodexProConfig {
  defaultRoot: string;
  allowedRoots: string[];
  host: string;
  port: number;
  widgetDomain: string;
  authToken?: string;
  requireHttpToken: boolean;
  bashMode: BashMode;
  bashExecutable?: string;
  bashTranscript: BashTranscriptMode;
  bashSessionId?: string;
  requireBashSession: boolean;
  codexSessions: CodexSessionsMode;
  codexDir: string;
  writeMode: WriteMode;
  toolMode: ToolMode;
  inheritEnv: boolean;
  maxReadBytes: number;
  maxWriteBytes: number;
  maxOutputBytes: number;
  maxBashObservedOutputBytes: number;
  maxBashTimeoutMs: number;
  maxWorkspaceProcesses: number;
  maxProcessOutputBytes: number;
  maxProcessReadBytes: number;
  maxCheckOutputBytes: number;
  maxImportBytes: number;
  maxSearchResults: number;
  maxHttpSessions: number;
  httpSessionTtlMs: number;
  maxOperationBytes: number;
  maxOperationFiles: number;
  maxOperationDurationMs: number;
  maxOperationReceipts: number;
  operationDir: string;
  projectTrustDir: string;
  hookTimeoutMs: number;
  hookMaxOutputBytes: number;
  blockedGlobs: string[];
  contextDir: string;
  toolCards: boolean;
  connectionTest: boolean;
  allowGitPush: boolean;
  codeGraphEnabled: boolean;
  codeGraphExecutable?: string;
  codeGraphArgs: string[];
  codeGraphMaxStaleMs: number;
  lspEnabled: boolean;
  lspExecutable?: string;
  lspArgs: string[];
  lspTimeoutMs: number;
  maxArchiveCompressedBytes: number;
  maxArchiveEntries: number;
  maxArchiveExpandedBytes: number;
  maxArchiveCompressionRatio: number;
  maxDocumentBytes: number;
  maxDocumentOutputBytes: number;
  artifactExportEnabled: boolean;
  maxExportBytes: number;
  goalsEnabled: boolean;
  goalDir: string;
  maxGoals: number;
  maxGoalTasks: number;
  maxGoalWorkers: number;
  analysisEnabled: boolean;
  analysisLimits: AnalysisLimits;
}

const DEFAULT_BLOCKED_GLOBS = [
  ".git",
  ".git/**",
  "**/.git/**",
  "node_modules",
  "node_modules/**",
  "**/node_modules/**",
  ".env",
  ".env/**",
  ".env.*",
  ".env.*/**",
  "**/.env",
  "**/.env/**",
  "**/.env.*",
  "**/.env.*/**",
  "**/*.pem",
  "**/*.key",
  "**/id_rsa",
  "**/id_rsa.*",
  "**/id_ed25519",
  "**/id_ed25519.*",
  "**/.ssh/**",
  "dist",
  "dist/**",
  "**/dist/**",
  "build",
  "build/**",
  "**/build/**",
  ".next",
  ".next/**",
  "**/.next/**",
  "coverage",
  "coverage/**",
  "**/coverage/**",
  ".cache",
  ".cache/**",
  "**/.cache/**"
];

function parseArgs(argv: string[]): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;
    const withoutPrefix = raw.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");
    let key: string;
    let value: string | boolean;
    if (eqIndex >= 0) {
      key = withoutPrefix.slice(0, eqIndex);
      value = withoutPrefix.slice(eqIndex + 1);
    } else {
      key = withoutPrefix;
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }

    if (key === "allow-root") {
      const prev = out[key];
      if (Array.isArray(prev)) prev.push(String(value));
      else if (prev) out[key] = [String(prev), String(value)];
      else out[key] = [String(value)];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function expandHome(input: string): string {
  if (!input || input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function splitList(value: string | undefined, delimiter: string = path.delimiter): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitRoots(value: string | undefined): string[] {
  return splitList(value, path.delimiter);
}

function toRealDir(input: string): string {
  const expanded = expandHome(input);
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${resolved}`);
  }
  return fs.realpathSync.native(resolved);
}

function numberFrom(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function bashModeFrom(value: string | undefined): BashMode {
  if (value === "off" || value === "safe" || value === "full") return value;
  return "safe";
}

function bashExecutableFrom(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const expanded = expandHome(raw);
  if (!path.isAbsolute(expanded) && !path.win32.isAbsolute(expanded)) {
    throw new Error("CODEXPRO_BASH_EXECUTABLE must be an absolute path to a Bash executable.");
  }
  const resolved = path.resolve(expanded);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`CODEXPRO_BASH_EXECUTABLE does not point to a file: ${resolved}`);
  }
  return fs.realpathSync.native(resolved);
}

function bashTranscriptFrom(value: string | undefined): BashTranscriptMode {
  if (value === "compact" || value === "full") return value;
  return "compact";
}

function codexSessionsFrom(value: string | undefined): CodexSessionsMode {
  if (value === "metadata" || value === "read") return value;
  if (value === "1" || value === "true" || value === "yes" || value === "on") return "metadata";
  return "off";
}

function bashSessionIdFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(trimmed)) {
    throw new Error("CODEXPRO_BASH_SESSION_ID must be 1-64 characters using letters, numbers, dot, underscore, or dash, and must start with a letter or number.");
  }
  return trimmed;
}

function writeModeFrom(value: string | undefined): WriteMode {
  if (value === "off" || value === "handoff" || value === "workspace") return value;
  return "workspace";
}

function toolModeFrom(value: string | undefined): ToolMode {
  if (value === "minimal" || value === "standard" || value === "full") return value;
  return "standard";
}

function widgetDomainFrom(value: string | undefined): string {
  const raw = value?.trim() || "https://rebel0789.github.io";
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`CODEXPRO_WIDGET_DOMAIN must be a valid origin URL, got: ${raw}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error("CODEXPRO_WIDGET_DOMAIN must use https.");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("CODEXPRO_WIDGET_DOMAIN must be an origin only, for example https://widgets.example.com.");
  }
  return parsed.origin;
}

function contextDirFrom(value: string | undefined): string {
  const raw = (value?.trim() || ".ai-bridge").replaceAll("\\", "/");
  if (path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw new Error("CODEXPRO_CONTEXT_DIR must be a workspace-relative hidden directory, for example .ai-bridge.");
  }

  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must stay inside the workspace.");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must be a simple relative directory path.");
  }
  if (!parts[0].startsWith(".")) {
    throw new Error("CODEXPRO_CONTEXT_DIR must start with a hidden directory such as .ai-bridge.");
  }

  const blocked = new Set([".git", ".ssh", ".gnupg", ".cache", "node_modules", "src", "dist", "build", ".next", "coverage"]);
  if (parts.some((part) => blocked.has(part))) {
    throw new Error("CODEXPRO_CONTEXT_DIR cannot point at source, dependency, build, cache, or credential directories.");
  }
  return normalized;
}

function boolFrom(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function jsonStringArrayFrom(value: string | undefined, label: string): string[] {
  if (!value?.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error(`${label} must be a JSON array of strings.`); }
  if (!Array.isArray(parsed) || parsed.length > 32 || parsed.some((item) => typeof item !== "string" || item.length > 1000 || /[\0\r\n]/.test(item))) {
    throw new Error(`${label} must be a JSON array of up to 32 one-line strings.`);
  }
  return parsed as string[];
}

function optionalCommand(value: string | undefined, label: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (raw.length > 1000 || /[\0\r\n]/.test(raw)) throw new Error(`${label} must be one line.`);
  return expandHome(raw);
}

export function loadConfig(argv = process.argv.slice(2)): CodexProConfig {
  const args = parseArgs(argv);

  const rootFromArgs = typeof args.root === "string" ? args.root : undefined;
  const root = rootFromArgs ?? process.env.CODEXPRO_ROOT ?? process.env.CODEBASE_BRIDGE_REPO_ROOT ?? process.cwd();
  const defaultRoot = toRealDir(root);

  const allowRootArgs = Array.isArray(args["allow-root"])
    ? args["allow-root"]
    : typeof args["allow-root"] === "string"
      ? [args["allow-root"]]
      : [];
  const envAllowedRoots = [
    ...splitRoots(process.env.CODEXPRO_ALLOWED_ROOTS),
    ...splitRoots(process.env.CODEBASE_BRIDGE_ALLOWED_ROOTS)
  ];

  const allowHome = process.env.CODEXPRO_ALLOW_HOME === "1" || args["allow-home"] === true;
  const requestedAllowed = [defaultRoot, ...allowRootArgs, ...envAllowedRoots, ...(allowHome ? [os.homedir()] : [])];
  const allowedRoots = [...new Set(requestedAllowed.map(toRealDir))];

  const portArg = typeof args.port === "string" ? args.port : undefined;
  const hostArg = typeof args.host === "string" ? args.host : undefined;
  const bashArg = typeof args.bash === "string" ? args.bash : undefined;
  const bashTranscriptArg = typeof args["bash-transcript"] === "string" ? args["bash-transcript"] : undefined;
  const bashSessionArg = typeof args["bash-session"] === "string" ? args["bash-session"] : undefined;
  const codexSessionsArg = typeof args["codex-sessions"] === "string" ? args["codex-sessions"] : undefined;
  const codexDirArg = typeof args["codex-dir"] === "string" ? args["codex-dir"] : undefined;
  const requireBashSessionArg =
    args["require-bash-session"] === true
      ? "true"
      : typeof args["require-bash-session"] === "string"
        ? args["require-bash-session"]
        : undefined;
  const writeArg = typeof args.write === "string" ? args.write : undefined;
  const toolModeArg = typeof args["tool-mode"] === "string" ? args["tool-mode"] : undefined;
  const widgetDomainArg = typeof args["widget-domain"] === "string" ? args["widget-domain"] : undefined;
  const toolCardsArg =
    args["tool-cards"] === true
      ? "true"
      : typeof args["tool-cards"] === "string"
        ? args["tool-cards"]
        : undefined;
  const extraBlockedGlobs = splitList(process.env.CODEXPRO_BLOCKED_GLOBS, ",");
  const host = hostArg ?? process.env.CODEXPRO_HOST ?? process.env.HOST ?? "127.0.0.1";
  const authToken = process.env.CODEXPRO_HTTP_TOKEN ?? process.env.CODEBASE_BRIDGE_HTTP_TOKEN;
  if (authToken && Buffer.byteLength(authToken, "utf8") < MIN_HTTP_TOKEN_BYTES) {
    throw new Error(
      `CODEXPRO_HTTP_TOKEN must be at least ${MIN_HTTP_TOKEN_BYTES} bytes. ` +
      "Use `codexpro start` to generate a strong token."
    );
  }
  const allowNoToken = boolFrom(process.env.CODEXPRO_ALLOW_NO_HTTP_TOKEN, false) && isLoopbackHost(host);
  const requireHttpToken =
    (!authToken && !allowNoToken) ||
    boolFrom(process.env.CODEXPRO_REQUIRE_HTTP_TOKEN, false) ||
    boolFrom(process.env.CODEXPRO_TUNNEL_MODE, false) ||
    (!isLoopbackHost(host) && !allowNoToken);
  const bashSessionId = bashSessionIdFrom(bashSessionArg ?? process.env.CODEXPRO_BASH_SESSION_ID);
  const requireBashSession = boolFrom(requireBashSessionArg ?? process.env.CODEXPRO_REQUIRE_BASH_SESSION, false);
  if (requireBashSession && !bashSessionId) {
    throw new Error("CODEXPRO_REQUIRE_BASH_SESSION requires CODEXPRO_BASH_SESSION_ID or --bash-session.");
  }
  const maxReadBytes = numberFrom(process.env.CODEXPRO_MAX_READ_BYTES, 180_000, 4_000, 2_000_000);
  const maxOutputBytes = numberFrom(process.env.CODEXPRO_MAX_OUTPUT_BYTES, 120_000, 4_000, 2_000_000);
  const maxBashObservedOutputBytes = Math.max(
    maxOutputBytes + 1,
    numberFrom(process.env.CODEXPRO_MAX_BASH_OBSERVED_OUTPUT_BYTES, 16_000_000, 64_000, 500_000_000)
  );

  return {
    defaultRoot,
    allowedRoots,
    host,
    port: numberFrom(portArg ?? process.env.CODEXPRO_PORT ?? process.env.PORT, 8787, 1, 65535),
    widgetDomain: widgetDomainFrom(widgetDomainArg ?? process.env.CODEXPRO_WIDGET_DOMAIN),
    authToken,
    requireHttpToken,
    bashMode: bashModeFrom(bashArg ?? process.env.CODEXPRO_BASH_MODE),
    bashExecutable: bashExecutableFrom(process.env.CODEXPRO_BASH_EXECUTABLE),
    bashTranscript: bashTranscriptFrom(bashTranscriptArg ?? process.env.CODEXPRO_BASH_TRANSCRIPT),
    bashSessionId,
    requireBashSession,
    codexSessions: codexSessionsFrom(codexSessionsArg ?? process.env.CODEXPRO_CODEX_SESSIONS),
    codexDir: expandHome(codexDirArg || process.env.CODEXPRO_CODEX_DIR || path.join(os.homedir(), ".codex")),
    writeMode: writeModeFrom(writeArg ?? process.env.CODEXPRO_WRITE_MODE),
    toolMode: toolModeFrom(toolModeArg ?? process.env.CODEXPRO_TOOL_MODE),
    inheritEnv: process.env.CODEXPRO_INHERIT_ENV === "1",
    maxReadBytes,
    maxWriteBytes: numberFrom(process.env.CODEXPRO_MAX_WRITE_BYTES, 1_000_000, 1_000, 10_000_000),
    maxOutputBytes,
    maxBashObservedOutputBytes,
    // Default hard cap is 10 minutes. Operators can raise up to 15 minutes.
    maxBashTimeoutMs: numberFrom(process.env.CODEXPRO_MAX_BASH_TIMEOUT_MS, 600_000, 1_000, 900_000),
    maxWorkspaceProcesses: numberFrom(process.env.CODEXPRO_MAX_WORKSPACE_PROCESSES, 8, 1, 64),
    maxProcessOutputBytes: numberFrom(process.env.CODEXPRO_MAX_PROCESS_OUTPUT_BYTES, 2_000_000, 64_000, 64_000_000),
    maxProcessReadBytes: numberFrom(process.env.CODEXPRO_MAX_PROCESS_READ_BYTES, 120_000, 4_000, 2_000_000),
    maxCheckOutputBytes: numberFrom(process.env.CODEXPRO_MAX_CHECK_OUTPUT_BYTES, maxOutputBytes, 4_000, 2_000_000),
    maxImportBytes: numberFrom(process.env.CODEXPRO_MAX_IMPORT_BYTES, 5_000_000, 1_000, 50_000_000),
    maxSearchResults: numberFrom(process.env.CODEXPRO_MAX_SEARCH_RESULTS, 200, 5, 2_000),
    maxHttpSessions: numberFrom(process.env.CODEXPRO_MAX_HTTP_SESSIONS, 64, 1, 512),
    httpSessionTtlMs: numberFrom(process.env.CODEXPRO_HTTP_SESSION_TTL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000),
    maxOperationBytes: numberFrom(process.env.CODEXPRO_MAX_OPERATION_BYTES, 20_000_000, 1_000, 200_000_000),
    maxOperationFiles: numberFrom(process.env.CODEXPRO_MAX_OPERATION_FILES, 128, 1, 2_048),
    maxOperationDurationMs: numberFrom(process.env.CODEXPRO_MAX_OPERATION_DURATION_MS, 600_000, 1_000, 900_000),
    maxOperationReceipts: numberFrom(process.env.CODEXPRO_MAX_OPERATION_RECEIPTS, 256, 8, 2_048),
    operationDir: expandHome(process.env.CODEXPRO_OPERATION_DIR || path.join(os.homedir(), ".codexpro", "operations")),
    projectTrustDir: expandHome(process.env.CODEXPRO_TRUST_DIR || path.join(os.homedir(), ".codexpro", "trust")),
    hookTimeoutMs: numberFrom(process.env.CODEXPRO_HOOK_TIMEOUT_MS, 5_000, 100, 30_000),
    hookMaxOutputBytes: numberFrom(process.env.CODEXPRO_HOOK_MAX_OUTPUT_BYTES, 64_000, 1_024, 1_000_000),
    blockedGlobs: [...DEFAULT_BLOCKED_GLOBS, ...extraBlockedGlobs],
    contextDir: contextDirFrom(process.env.CODEXPRO_CONTEXT_DIR),
    toolCards: boolFrom(toolCardsArg ?? process.env.CODEXPRO_TOOL_CARDS, false),
    connectionTest: boolFrom(process.env.CODEXPRO_CONNECTION_TEST, false),
    allowGitPush: boolFrom(process.env.CODEXPRO_ALLOW_GIT_PUSH, false),
    codeGraphEnabled: boolFrom(process.env.CODEXPRO_CODEGRAPH, false),
    codeGraphExecutable: optionalCommand(process.env.CODEXPRO_CODEGRAPH_EXECUTABLE, "CODEXPRO_CODEGRAPH_EXECUTABLE"),
    codeGraphArgs: jsonStringArrayFrom(process.env.CODEXPRO_CODEGRAPH_ARGS, "CODEXPRO_CODEGRAPH_ARGS"),
    codeGraphMaxStaleMs: numberFrom(process.env.CODEXPRO_CODEGRAPH_MAX_STALE_MS, 15 * 60_000, 1_000, 7 * 24 * 60 * 60_000),
    lspEnabled: boolFrom(process.env.CODEXPRO_LSP, false),
    lspExecutable: optionalCommand(process.env.CODEXPRO_LSP_EXECUTABLE, "CODEXPRO_LSP_EXECUTABLE"),
    lspArgs: jsonStringArrayFrom(process.env.CODEXPRO_LSP_ARGS, "CODEXPRO_LSP_ARGS"),
    lspTimeoutMs: numberFrom(process.env.CODEXPRO_LSP_TIMEOUT_MS, 5_000, 500, 60_000),
    maxArchiveCompressedBytes: numberFrom(process.env.CODEXPRO_MAX_ARCHIVE_COMPRESSED_BYTES, 50_000_000, 64_000, 500_000_000),
    maxArchiveEntries: numberFrom(process.env.CODEXPRO_MAX_ARCHIVE_ENTRIES, 1_024, 1, 10_000),
    maxArchiveExpandedBytes: numberFrom(process.env.CODEXPRO_MAX_ARCHIVE_EXPANDED_BYTES, 100_000_000, 64_000, 1_000_000_000),
    maxArchiveCompressionRatio: numberFrom(process.env.CODEXPRO_MAX_ARCHIVE_COMPRESSION_RATIO, 100, 1, 10_000),
    maxDocumentBytes: numberFrom(process.env.CODEXPRO_MAX_DOCUMENT_BYTES, 20_000_000, 4_000, 200_000_000),
    maxDocumentOutputBytes: numberFrom(process.env.CODEXPRO_MAX_DOCUMENT_OUTPUT_BYTES, maxReadBytes, 1_000, 2_000_000),
    artifactExportEnabled: boolFrom(process.env.CODEXPRO_ARTIFACT_EXPORT, false),
    maxExportBytes: numberFrom(process.env.CODEXPRO_MAX_EXPORT_BYTES, 5_000_000, 1_000, 50_000_000),
    goalsEnabled: boolFrom(process.env.CODEXPRO_GOALS, false),
    goalDir: expandHome(process.env.CODEXPRO_GOAL_DIR || path.join(os.homedir(), ".codexpro", "goals")),
    maxGoals: numberFrom(process.env.CODEXPRO_MAX_GOALS, 128, 1, 1024),
    maxGoalTasks: numberFrom(process.env.CODEXPRO_MAX_GOAL_TASKS, 64, 1, 256),
    maxGoalWorkers: numberFrom(process.env.CODEXPRO_MAX_GOAL_WORKERS, 4, 1, 8),
    analysisEnabled: boolFrom(process.env.CODEXPRO_ANALYSIS, true),
    analysisLimits: {
      maxInventoryFiles: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_INVENTORY_FILES, DEFAULT_ANALYSIS_LIMITS.maxInventoryFiles, 100, 100_000),
      maxAnalyzedFiles: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_ANALYZED_FILES, DEFAULT_ANALYSIS_LIMITS.maxAnalyzedFiles, 10, 50_000),
      maxScannedBytes: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_SCANNED_BYTES, DEFAULT_ANALYSIS_LIMITS.maxScannedBytes, 1_000_000, 512 * 1024 * 1024),
      maxSymbols: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_SYMBOLS, DEFAULT_ANALYSIS_LIMITS.maxSymbols, 100, 1_000_000),
      maxRelationships: numberFrom(process.env.CODEXPRO_ANALYSIS_MAX_RELATIONSHIPS, DEFAULT_ANALYSIS_LIMITS.maxRelationships, 100, 2_000_000)
    }
  };
}
