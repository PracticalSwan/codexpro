import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { GoalRecord } from "./types.js";
import type { CodexProConfig } from "../config.js";

const MAX_GOAL_BYTES = 256 * 1024;
function safeId(value: string): string {
  if (!/^goal_[A-Za-z0-9-]{1,80}$/.test(value)) throw new Error("Invalid goal id.");
  return value;
}
function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}
async function delay(ms: number): Promise<void> { await new Promise((resolve) => setTimeout(resolve, ms)); }

export interface GoalStoreOptions { baseDir: string; maxGoals?: number; }
export class GoalStore {
  readonly baseDir: string;
  readonly maxGoals: number;
  constructor(options: GoalStoreOptions) {
    this.baseDir = path.resolve(options.baseDir);
    this.maxGoals = Math.max(1, Math.min(1024, Math.floor(options.maxGoals ?? 128)));
  }
  private recordsDir(): string { return path.join(this.baseDir, "records"); }
  private runtimeDir(): string { return path.join(this.baseDir, "runtime"); }
  private recordPath(id: string): string { return path.join(this.recordsDir(), `${safeId(id)}.json`); }
  private runtimePath(id: string): string { return path.join(this.runtimeDir(), `${safeId(id)}.json`); }
  private editLockDir(id: string): string { return path.join(this.baseDir, "locks", `${safeId(id)}.edit.lock`); }
  worktreeDir(id: string): string { return path.join(this.baseDir, "worktrees", safeId(id)); }
  schedulerLockPath(id: string): string { return path.join(this.baseDir, "locks", `${safeId(id)}.scheduler.lock`); }

  private async ensureDirs(): Promise<void> {
    await Promise.all([
      fsp.mkdir(this.recordsDir(), { recursive: true, mode: 0o700 }),
      fsp.mkdir(this.runtimeDir(), { recursive: true, mode: 0o700 }),
      fsp.mkdir(path.join(this.baseDir, "locks"), { recursive: true, mode: 0o700 }),
      fsp.mkdir(path.join(this.baseDir, "worktrees"), { recursive: true, mode: 0o700 })
    ]);
  }

  async save(record: GoalRecord): Promise<GoalRecord> {
    await this.ensureDirs();
    const json = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(json, "utf8") > MAX_GOAL_BYTES) throw new Error("Goal record exceeded bounded storage limit.");
    const target = this.recordPath(record.id);
    const temp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp, json, { encoding: "utf8", mode: 0o600 });
    try { await fsp.rename(temp, target); }
    catch (error) { await fsp.rm(temp, { force: true }).catch(() => undefined); throw error; }
    await this.prune();
    return record;
  }

  async get(id: string): Promise<GoalRecord | null> {
    try { return JSON.parse(await fsp.readFile(this.recordPath(id), "utf8")) as GoalRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }

  async require(id: string): Promise<GoalRecord> {
    const record = await this.get(id); if (!record) throw new Error(`Unknown goal id: ${id}`); return record;
  }

  async saveRuntime(id: string, config: CodexProConfig): Promise<void> {
    await this.ensureDirs();
    const safe: CodexProConfig = { ...config, authToken: undefined, requireHttpToken: false, bashSessionId: undefined, requireBashSession: false, toolCards: false, connectionTest: false, allowGitPush: false, codeGraphEnabled: false, lspEnabled: false, artifactExportEnabled: false, codexSessions: "off" };
    const json = `${JSON.stringify(safe)}\n`;
    if (Buffer.byteLength(json, "utf8") > MAX_GOAL_BYTES) throw new Error("Goal runtime snapshot exceeded bounded storage limit.");
    const target=this.runtimePath(id), temp=`${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await fsp.writeFile(temp,json,{encoding:"utf8",mode:0o600});
    try { await fsp.rename(temp,target); } catch(error) { await fsp.rm(temp,{force:true}).catch(()=>undefined); throw error; }
  }

  async readRuntime(id: string): Promise<CodexProConfig> {
    return JSON.parse(await fsp.readFile(this.runtimePath(id),"utf8")) as CodexProConfig;
  }

  async list(workspaceId?: string): Promise<GoalRecord[]> {
    await this.ensureDirs(); let names: string[] = [];
    try { names = await fsp.readdir(this.recordsDir()); } catch {}
    const records: GoalRecord[] = [];
    for (const name of names.filter((value) => value.endsWith(".json")).slice(0, this.maxGoals * 2)) {
      try { const record = JSON.parse(await fsp.readFile(path.join(this.recordsDir(), name), "utf8")) as GoalRecord; if (!workspaceId || record.workspaceId === workspaceId) records.push(record); } catch {}
    }
    return records.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, this.maxGoals);
  }

  async update(id: string, mutate: (record: GoalRecord) => GoalRecord | Promise<GoalRecord>): Promise<GoalRecord> {
    return this.withRecordLock(id, async () => {
      const current = await this.require(id);
      const next = await mutate(structuredClone(current));
      next.updatedAt = new Date().toISOString();
      return this.save(next);
    });
  }

  private async withRecordLock<T>(id: string, task: () => Promise<T>): Promise<T> {
    await this.ensureDirs(); const lockDir = this.editLockDir(id); const deadline = Date.now() + 10_000;
    while (true) {
      try {
        await fsp.mkdir(lockDir, { mode: 0o700 });
        await fsp.writeFile(path.join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        let ownerPid = 0; try { ownerPid = Number(JSON.parse(await fsp.readFile(path.join(lockDir,"owner.json"),"utf8")).pid); } catch {}
        if (ownerPid && !pidAlive(ownerPid)) { await fsp.rm(lockDir,{recursive:true,force:true}).catch(()=>undefined); continue; }
        if (Date.now() >= deadline) throw new Error(`Goal record lock is busy: ${id}`);
        await delay(25);
      }
    }
    try { return await task(); } finally { await fsp.rm(lockDir,{recursive:true,force:true}).catch(()=>undefined); }
  }

  async acquireScheduler(id: string): Promise<() => Promise<void>> {
    await this.ensureDirs(); const target = this.schedulerLockPath(id);
    try {
      const handle = await fsp.open(target, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`, "utf8");
      await handle.close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      let pid = 0; try { pid = Number(JSON.parse(await fsp.readFile(target,"utf8")).pid); } catch {}
      if (pid && pidAlive(pid)) throw new Error(`Goal scheduler already has a live owner: ${id}`);
      await fsp.rm(target,{force:true}); return this.acquireScheduler(id);
    }
    return async () => { await fsp.rm(target,{force:true}).catch(()=>undefined); };
  }

  async schedulerOwnerAlive(id: string): Promise<boolean> {
    try { const pid=Number(JSON.parse(await fsp.readFile(this.schedulerLockPath(id),"utf8")).pid); return pidAlive(pid); } catch { return false; }
  }

  private async prune(): Promise<void> {
    let names:string[]=[]; try { names=await fsp.readdir(this.recordsDir()); } catch { return; }
    const records:GoalRecord[]=[];
    for(const name of names.filter((value)=>value.endsWith(".json"))){
      try { records.push(JSON.parse(await fsp.readFile(path.join(this.recordsDir(),name),"utf8")) as GoalRecord); } catch {}
    }
    records.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    let retained=0;
    for(const record of records){
      const protectedState=["running","paused","awaiting_review","awaiting_projection"].includes(record.state);
      if(protectedState||retained<this.maxGoals){retained+=1;continue;}
      await fsp.rm(this.recordPath(record.id),{force:true}).catch(()=>undefined);
      await fsp.rm(this.runtimePath(record.id),{force:true}).catch(()=>undefined);
    }
  }
}
