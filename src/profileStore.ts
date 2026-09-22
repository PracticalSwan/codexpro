import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BashMode, BashRuntimePreference, BashTranscriptMode, CodexSessionsMode, ToolMode, WriteMode } from "./config.js";
import { expandHome } from "./config.js";
import type { SyncCallDeadlineMode } from "./deadline.js";

export type TunnelMode = "openai" | "none" | "cloudflare" | "cloudflare-named" | "ngrok" | "tailscale";
export type ConnectorMode = "agent" | "handoff" | "pro";

export interface WorkspaceProfile {
  version?: number;
  root?: string;
  updatedAt?: string;
  profilePath?: string;
  port?: string;
  mode?: ConnectorMode | string;
  tunnel?: TunnelMode | string;
  hostname?: string;
  tunnelName?: string;
  ngrokConfig?: string;
  ngrokFallbackHostname?: string;
  ngrokFallbackConfig?: string;
  openaiTunnelId?: string;
  tunnelClient?: string;
  cloudflareConfig?: string;
  cloudflareTokenFile?: string;
  cloudflareToken?: string;
  token?: string;
  bash?: BashMode | string;
  bashRuntime?: BashRuntimePreference | string;
  bashExecutable?: string;
  gitExecutable?: string;
  bashTranscript?: BashTranscriptMode | string;
  codexSessions?: CodexSessionsMode | string;
  codexDir?: string;
  bashSession?: string;
  requireBashSession?: boolean;
  write?: WriteMode | string;
  toolMode?: ToolMode | string;
  toolCards?: boolean;
  syncCallDeadlineMode?: SyncCallDeadlineMode;
  syncCallDeadlineMs?: number;
  widgetDomain?: string;
  analysisEnabled?: boolean;
  artifactExportEnabled?: boolean;
  localServiceProbeEnabled?: boolean;
  goalsEnabled?: boolean;
  codeGraphEnabled?: boolean;
  codeGraphExecutable?: string;
  codeGraphArgs?: string[];
  lspEnabled?: boolean;
  lspExecutable?: string;
  lspArgs?: string[];
  allowGitPush?: boolean;
  inheritEnv?: boolean;
  connectionTest?: boolean;
  noInstallCloudflared?: boolean;
  allowedRoots?: string[];
}

export interface RuntimeConnection {
  version?: number;
  root?: string;
  pid?: number;
  pidStartKey?: string;
  updatedAt?: string;
  endpoint?: string;
  localBase?: string;
  localStatusUrl?: string;
  runtimePid?: number | null;
  runtimePidStartKey?: string | null;
  tunnel?: TunnelMode | string;
  mode?: ConnectorMode | string;
  bash?: BashMode | string;
  bashTranscript?: BashTranscriptMode | string;
  codexSessions?: CodexSessionsMode | string;
  bashSession?: string;
  requireBashSession?: boolean;
  write?: WriteMode | string;
  toolMode?: ToolMode | string;
  toolCards?: boolean;
  syncCallDeadlineMode?: SyncCallDeadlineMode;
  syncCallDeadlineMs?: number;
  runtimeGenerationId?: string;
  transportState?: "ready" | "unavailable" | "unknown";
  analysisEnabled?: boolean;
  artifactExportEnabled?: boolean;
  localServiceProbeEnabled?: boolean;
  goalsEnabled?: boolean;
  codeGraphEnabled?: boolean;
  lspEnabled?: boolean;
  allowGitPush?: boolean;
  inheritEnv?: boolean;
}

export function codexProHome(): string {
  const customHome = process.env.CODEXPRO_HOME;
  return customHome ? path.resolve(expandHome(customHome)) : path.join(os.homedir(), ".codexpro");
}

function userProbePreference(): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(codexProHome(), "user-preferences.json"), "utf8")) as unknown;
    return Boolean(raw && typeof raw === "object" && !Array.isArray(raw) && (raw as { localServiceProbeEnabled?: unknown }).localServiceProbeEnabled === true);
  } catch {
    return false; // Missing/invalid preferences never turn on the default-off probe.
  }
}

function userDefaultProfile(): WorkspaceProfile {
  return userProbePreference() ? { localServiceProbeEnabled: true } : {};
}

export function profileDir(): string {
  return path.join(codexProHome(), "profiles");
}

function canonicalRootForIdentity(root: string): string {
  const resolved = path.resolve(root);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

export function profileIdForRoot(root: string): string {
  return createHash("sha256").update(canonicalRootForIdentity(root)).digest("hex").slice(0, 24);
}

export function profilePathForRoot(root: string): string {
  return path.join(profileDir(), `${profileIdForRoot(root)}.json`);
}

export function runtimeDir(): string {
  return path.join(codexProHome(), "runtime");
}

export function runtimeStatusPathForRoot(root: string): string {
  return path.join(runtimeDir(), `${profileIdForRoot(root)}.json`);
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

export function readWorkspaceProfile(root: string): WorkspaceProfile {
  const inherited = userDefaultProfile();
  const profilePath = profilePathForRoot(root);
  if (!fs.existsSync(profilePath)) return inherited;
  const profile = readJsonFile(profilePath);
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return inherited;
  const typed = profile as WorkspaceProfile;
  if (typed.root && canonicalRootForIdentity(typed.root) !== canonicalRootForIdentity(root)) return inherited;
  return { ...inherited, ...typed, profilePath };
}

export function saveWorkspaceProfile(root: string, profile: WorkspaceProfile): string {
  const canonicalRoot = canonicalRootForIdentity(root);
  const dir = profileDir();
  const filePath = profilePathForRoot(canonicalRoot);
  const { profilePath: _profilePath, ...rest } = profile;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const payload: WorkspaceProfile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...userDefaultProfile(),
    ...rest,
    root: canonicalRoot
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort permission repair for filesystems that support chmod.
  }
  return filePath;
}

export function sanitizeWorkspaceProfile(profile: WorkspaceProfile): WorkspaceProfile {
  if (!profile || !Object.keys(profile).length) return {};
  const { token, cloudflareToken, ...rest } = profile;
  return {
    ...rest,
    ...(token ? { token: "<saved>" } : {}),
    ...(cloudflareToken ? { cloudflareToken: "<saved>" } : {})
  };
}

export function readRuntimeConnection(root: string): RuntimeConnection {
  const runtimePath = runtimeStatusPathForRoot(root);
  if (!fs.existsSync(runtimePath)) return {};
  const runtime = readJsonFile(runtimePath);
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) return {};
  const typed = runtime as RuntimeConnection;
  if (typed.root && canonicalRootForIdentity(typed.root) !== canonicalRootForIdentity(root)) return {};
  if (typeof typed.pid === "number" && !processIsAlive(typed.pid)) {
    try {
      fs.rmSync(runtimePath, { force: true });
    } catch {
      // Best-effort stale runtime cleanup.
    }
    return {};
  }
  return typed;
}

function processIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}
