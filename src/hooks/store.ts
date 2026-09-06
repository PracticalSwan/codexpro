import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { HookConfig } from "./types.js";

export const PROJECT_HOOK_FILE = ".codexpro-hooks.json";
export const MAX_HOOK_CONFIG_BYTES = 65_536;

const oneLine = z.string().trim().min(1).max(4096).refine((value) => !/[\0\r\n]/.test(value), "must be one line without NUL bytes");
const commandSchema = z.object({
  command: oneLine,
  args: z.array(z.string().max(4096)).max(64).default([]),
  timeoutMs: z.number().int().min(100).max(30_000).optional()
}).strict();
const list = z.array(commandSchema).max(16).optional();
const schema = z.object({
  version: z.literal(1),
  hooks: z.object({
    session_start: list,
    before_tool: list,
    after_tool: list,
    task_end: list
  }).strict()
}).strict();

export interface LoadedHookConfig { path: string; bytes: Buffer; sha256: string; config: HookConfig; }

export async function readHookConfig(root: string): Promise<LoadedHookConfig | null> {
  const canonicalRoot = await fsp.realpath(root);
  const hookPath = path.join(canonicalRoot, PROJECT_HOOK_FILE);
  let stat: fs.Stats;
  try { stat = await fsp.lstat(hookPath); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${PROJECT_HOOK_FILE} must be a regular non-symlink file.`);
  if (stat.size > MAX_HOOK_CONFIG_BYTES) throw new Error(`${PROJECT_HOOK_FILE} exceeds ${MAX_HOOK_CONFIG_BYTES} bytes.`);
  const bytes = await fsp.readFile(hookPath);
  let raw: unknown;
  try { raw = JSON.parse(bytes.toString("utf8")); } catch { throw new Error(`${PROJECT_HOOK_FILE} is not valid JSON.`); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${PROJECT_HOOK_FILE}: ${parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return { path: hookPath, bytes, sha256: createHash("sha256").update(bytes).digest("hex"), config: parsed.data };
}
