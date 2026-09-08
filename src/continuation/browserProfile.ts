import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export type ManagedBrowserKind = "chrome" | "edge";
export type BrowserAuthState = "unknown" | "signed_out" | "signed_in" | "authentication_required" | "ambiguous";

export interface ManagedBrowserProfile {
  browser: ManagedBrowserKind;
  profileLabel: string;
  profileRoot: string;
  userDataDir: string;
  metadataFile: string;
}
export interface BrowserProfileMetadata {
  schemaVersion: 1;
  browser: ManagedBrowserKind;
  profileLabel: string;
  createdAt: string;
  updatedAt: string;
  pid?: number;
  processStartKey?: string;
  authState: BrowserAuthState;
}

const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const AUTH_STATES = new Set<BrowserAuthState>(["unknown", "signed_out", "signed_in", "authentication_required", "ambiguous"]);
function normalizeBrowser(value: unknown): ManagedBrowserKind {
  if (value === "chrome" || value === "edge") return value;
  throw new Error(`Unsupported browser: ${String(value)}.`);
}
function safeProfileLabel(value: unknown): string {
  const label = String(value ?? "").trim();
  if (!PROFILE_PATTERN.test(label)) throw new Error("Invalid managed browser profile label.");
  return label;
}
function sameOrInside(candidate: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
function executableExists(file: string): boolean {
  try { return fs.statSync(file).isFile(); } catch { return false; }
}

export function discoverBrowserExecutable(options: { browser: string; override?: string; platform?: NodeJS.Platform; exists?: (file: string) => boolean }): string {
  const browser = normalizeBrowser(options.browser);
  const exists = options.exists ?? executableExists;
  if (options.override) {
    const explicit = path.resolve(options.override);
    if (!exists(explicit)) throw new Error(`Configured browser executable was not found: ${explicit}`);
    return explicit;
  }
  const platform = options.platform ?? process.platform;
  const candidates = platform === "win32"
    ? browser === "chrome"
      ? ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]
      : ["C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
    : [];
  if (platform === "darwin") candidates.push(browser === "chrome" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  if (platform === "linux") candidates.push(...(browser === "chrome" ? ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"] : ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable"]));
  const found = candidates.find(exists);
  if (!found) throw new Error(`Installed ${browser} browser executable was not found.`);
  return path.resolve(found);
}

export function resolveManagedBrowserProfile(options: { homeDir: string; profileLabel: string; browser: string; sourceRoots?: string[] }): ManagedBrowserProfile {
  const browser = normalizeBrowser(options.browser);
  const label = safeProfileLabel(options.profileLabel);
  const profileRoot = path.resolve(options.homeDir, "browser", "chatgpt", label);
  const userDataDir = path.join(profileRoot, "user-data");
  for (const sourceRoot of options.sourceRoots ?? []) {
    if (sameOrInside(profileRoot, sourceRoot) || sameOrInside(sourceRoot, profileRoot)) throw new Error("Managed browser profile must remain outside every source workspace.");
  }
  fs.mkdirSync(profileRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
  return { browser, profileLabel: label, profileRoot, userDataDir, metadataFile: path.join(profileRoot, "profile.json") };
}

function normalizeMetadata(value: unknown, profile: ManagedBrowserProfile): BrowserProfileMetadata {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<BrowserProfileMetadata> : {};
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, browser: profile.browser, profileLabel: profile.profileLabel,
    createdAt: typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : now,
    ...(Number.isInteger(raw.pid) && Number(raw.pid) > 0 ? { pid: Number(raw.pid) } : {}),
    ...(typeof raw.processStartKey === "string" && raw.processStartKey.length <= 160 ? { processStartKey: raw.processStartKey } : {}),
    authState: raw.authState && AUTH_STATES.has(raw.authState) ? raw.authState : "unknown"
  };
}

export async function readBrowserProfileMetadata(profile: ManagedBrowserProfile): Promise<BrowserProfileMetadata> {
  try {
    const raw = JSON.parse(await fsp.readFile(profile.metadataFile, "utf8"));
    return normalizeMetadata(raw, profile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return normalizeMetadata({}, profile);
  }
}

export async function writeBrowserProfileMetadata(
  profile: ManagedBrowserProfile,
  patch: Partial<Pick<BrowserProfileMetadata, "pid" | "processStartKey" | "authState">>
): Promise<BrowserProfileMetadata> {
  const current = await readBrowserProfileMetadata(profile);
  const next = normalizeMetadata({ ...current, ...patch, updatedAt: new Date().toISOString() }, profile);
  await fsp.mkdir(profile.profileRoot, { recursive: true, mode: 0o700 });
  const temp = `${profile.metadataFile}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(next)}\n`, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(temp, profile.metadataFile);
  return next;
}
export function classifyBrowserAuthState(input: {
  url?: string;
  composerAvailable: boolean;
  loginVisible: boolean;
  previousAuthState?: BrowserAuthState;
}): BrowserAuthState {
  if (input.composerAvailable && input.loginVisible) return "ambiguous";
  if (input.composerAvailable) return "signed_in";
  const authRoute = /chatgpt\.com\/(?:auth|login|signup)(?:[/?#]|$)/i.test(input.url ?? "");
  if (input.loginVisible || authRoute) {
    return input.previousAuthState === "signed_in" ? "authentication_required" : "signed_out";
  }
  return "unknown";
}

export async function browserProfileStatus(input: {
  profile: ManagedBrowserProfile;
  pidAlive?: (pid: number) => boolean;
  processIdentity?: (pid: number) => string | null;
  paired: boolean;
}): Promise<Record<string, unknown>> {
  const metadata = await readBrowserProfileMetadata(input.profile);
  const pidAlive = input.pidAlive ?? ((pid: number) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  });
  const identity = input.processIdentity ?? (() => null);
  const running = Boolean(metadata.pid && metadata.processStartKey && pidAlive(metadata.pid) && identity(metadata.pid) === metadata.processStartKey);
  return {
    browser: input.profile.browser,
    profile_label: input.profile.profileLabel,
    running,
    paired: input.paired,
    auth_state: running ? metadata.authState : "unknown"
  };
}

export async function existingManagedBrowserProfile(homeDir: string, profileLabel: string): Promise<ManagedBrowserProfile | undefined> {
  const label = safeProfileLabel(profileLabel);
  const profileRoot = path.resolve(homeDir, "browser", "chatgpt", label);
  const metadataFile = path.join(profileRoot, "profile.json");
  let raw: unknown;
  try { raw = JSON.parse(await fsp.readFile(metadataFile, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
  const browser = normalizeBrowser((raw as Record<string, unknown>)?.browser);
  return { browser, profileLabel: label, profileRoot, userDataDir: path.join(profileRoot, "user-data"), metadataFile };
}
