import { spawn } from "node:child_process";
import { processStartIdentity as defaultProcessStartIdentity } from "../jobs/runner.js";
import fs from "node:fs";
import path from "node:path";
import {
  readBrowserProfileMetadata,
  writeBrowserProfileMetadata,
  type ManagedBrowserProfile
} from "./browserProfile.js";

export const managedBrowserProcessStartIdentity = defaultProcessStartIdentity;

export interface BrowserLaunchResult {
  pid: number;
  reused: boolean;
  executable: string;
  profileLabel: string;
}

export function buildManagedBrowserArgs(input: {
  profile: ManagedBrowserProfile;
  extensionPath: string;
  url?: string;
  allowCommandLineExtensionLoad?: boolean;
}): string[] {
  const extensionPath = path.resolve(input.extensionPath);
  const url = input.url ?? "https://chatgpt.com/";
  if (!fs.existsSync(extensionPath)) throw new Error(`Continuation extension was not found: ${extensionPath}`);
  if (!/^https:\/\/chatgpt\.com\/(?:.*)?$/i.test(url)) throw new Error("Managed browser may open only a chatgpt.com URL.");
  return [
    `--user-data-dir=${input.profile.userDataDir}`,
    ...(input.allowCommandLineExtensionLoad ? [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] : []),
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    url
  ];
}
function defaultPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export async function launchManagedBrowser(input: {
  executable: string;
  profile: ManagedBrowserProfile;
  extensionPath: string;
  url?: string;
  pidAlive?: (pid: number) => boolean;
  processIdentity?: (pid: number) => string | null;
  spawnBrowser?: (executable: string, args: string[]) => { pid?: number };
  allowCommandLineExtensionLoad?: boolean;
}): Promise<BrowserLaunchResult> {
  const pidAlive = input.pidAlive ?? defaultPidAlive;
  const processIdentity = input.processIdentity ?? defaultProcessStartIdentity;
  const metadata = await readBrowserProfileMetadata(input.profile);
  if (metadata.pid && metadata.processStartKey && pidAlive(metadata.pid) && processIdentity(metadata.pid) === metadata.processStartKey) {
    return { pid: metadata.pid, reused: true, executable: path.resolve(input.executable), profileLabel: input.profile.profileLabel };
  }

  const executable = path.resolve(input.executable);
  if (!fs.existsSync(executable)) throw new Error(`Managed browser executable was not found: ${executable}`);
  const args = buildManagedBrowserArgs({ profile: input.profile, extensionPath: input.extensionPath, url: input.url, allowCommandLineExtensionLoad: input.allowCommandLineExtensionLoad });
  const spawned = input.spawnBrowser
    ? input.spawnBrowser(executable, args)
    : spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
  if (!Number.isInteger(spawned.pid) || Number(spawned.pid) <= 0) throw new Error("Managed browser did not return an owned process id.");
  const pid = Number(spawned.pid);
  if (!input.spawnBrowser && "unref" in spawned && typeof spawned.unref === "function") spawned.unref();
  let processStartKey: string | null = null;
  for (let attempt = 0; attempt < 8 && !processStartKey; attempt += 1) { processStartKey = processIdentity(pid); if (!processStartKey) await new Promise((resolve) => setTimeout(resolve, 40)); }
  if (!processStartKey) throw new Error("Managed browser process identity could not be established.");
  await writeBrowserProfileMetadata(input.profile, { pid, processStartKey, authState: "unknown" });
  return { pid, reused: false, executable, profileLabel: input.profile.profileLabel };
}
