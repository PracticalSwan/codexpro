import type { GoalRecord, GoalTask } from "./types.js";
import type { GoalStore } from "./store.js";
import { boundedGoalError } from "./types.js";

export interface GoalTaskExecution { ok: boolean; summary: string; operationId?: string; durationMs?: number; exitCode?: number | null; }
export type GoalTaskExecutor = (goal: GoalRecord, task: GoalTask) => Promise<GoalTaskExecution>;

export class GoalScheduler {
  private readonly maxWorkers: number;
  constructor(private readonly store: GoalStore, private readonly executeTask: GoalTaskExecutor, options: { maxWorkers?: number } = {}) {
    this.maxWorkers=Math.max(1,Math.min(8,Math.floor(options.maxWorkers??4)));
  }

  async runUntilBoundary(goalId: string): Promise<GoalRecord> {
    const release=await this.store.acquireScheduler(goalId);
    try {
      let goal=await this.store.update(goalId,(record)=>{
        if (!["approved","running","paused"].includes(record.state)) throw new Error(`Goal cannot start from state ${record.state}.`);
        if (record.tasks.some((task)=>task.state==="running")) {
          record.state="failed"; record.error="Previous Goal worker exited while a task was running; task was not duplicated.";
          for(const task of record.tasks) if(task.state==="running") task.state="failed";
          return record;
        }
        if(record.state==="approved") { record.control="run"; record.state="running"; }
        else if(record.state==="running") { record.control="run"; }
        return record;
      });
      if(goal.state==="failed") return goal;
      while(true) {
        goal=await this.store.require(goalId);
        if(goal.control==="cancel"||goal.state==="canceled") return this.cancelPending(goalId);
        if(goal.control==="pause"||goal.state==="paused") { await this.store.update(goalId,(r)=>{r.state="paused";return r;}); await new Promise((resolve)=>setTimeout(resolve,100)); continue; }
        const failed=goal.tasks.filter((task)=>task.state==="failed");
        if(failed.length) return this.failGoal(goalId,`Task failed: ${failed[0].id}`);
        if(goal.tasks.every((task)=>task.state==="succeeded")) return this.store.update(goalId,(r)=>{ if(r.control==="run") r.state="awaiting_review"; return r; });
        const succeeded=new Set(goal.tasks.filter((task)=>task.state==="succeeded").map((task)=>task.id));
        const ready=goal.tasks.filter((task)=>task.state==="pending"&&task.dependsOn.every((dep)=>succeeded.has(dep))).slice(0,Math.min(this.maxWorkers,goal.maxWorkers));
        if(!ready.length) return this.failGoal(goalId,"No dependency-ready tasks remain; the Goal DAG cannot make progress.");
        await this.store.update(goalId,(record)=>{
          const readyIds=new Set(ready.map((task)=>task.id));
          if(record.control!=="run") return record;
          for(const task of record.tasks) if(readyIds.has(task.id)&&task.state==="pending") task.state="running";
          return record;
        });
        const executions=await Promise.all(ready.map(async(task)=>{
          try { return { id:task.id, result:await this.executeTask(await this.store.require(goalId),task) }; }
          catch(error) { return { id:task.id, error }; }
        }));
        await this.store.update(goalId,(record)=>{
          for(const execution of executions){
            const task=record.tasks.find((item)=>item.id===execution.id); if(!task) continue;
            if(record.control==="cancel"){ task.state="canceled"; continue; }
            if("error" in execution){ task.state="failed"; record.error=boundedGoalError(execution.error); continue; }
            const result=execution.result;
            task.operationId=result.operationId;
            task.verification={ok:result.ok,summary:result.summary.slice(0,480),...(result.durationMs!==undefined?{durationMs:result.durationMs}:{}),...(result.exitCode!==undefined?{exitCode:result.exitCode}:{})};
            task.state=result.ok?"succeeded":"failed";
            if(!result.ok) record.error=`Task failed: ${task.id}`;
          }
          if(record.control==="cancel"){
            record.state="canceled";
            for(const task of record.tasks) if(task.state==="pending"||task.state==="running") task.state="canceled";
          }
          return record;
        });
      }
    } finally { await release(); }
  }

  private async cancelPending(goalId:string):Promise<GoalRecord>{
    return this.store.update(goalId,(record)=>{
      record.control="cancel"; record.state="canceled";
      for(const task of record.tasks) if(task.state==="pending"||task.state==="running") task.state="canceled";
      return record;
    });
  }

  private async failGoal(goalId:string,message:string):Promise<GoalRecord>{
    return this.store.update(goalId,(record)=>{
      record.state="failed"; record.error=boundedGoalError(message);
      for(const task of record.tasks) if(task.state==="pending"||task.state==="running") task.state="canceled";
      return record;
    });
  }
}
