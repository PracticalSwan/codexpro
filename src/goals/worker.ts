import { GoalStore } from "./store.js";
import { GoalScheduler } from "./scheduler.js";
import { createGoalTaskExecutor } from "./runner.js";
import { boundedGoalError } from "./types.js";

function arg(name:string):string{
  const index=process.argv.indexOf(name); const value=index>=0?process.argv[index+1]:undefined;
  if(!value) throw new Error(`${name} is required.`); return value;
}

async function main():Promise<void>{
  const goalDir=arg("--goal-dir"), goalId=arg("--goal-id");
  const store=new GoalStore({baseDir:goalDir});
  const goal=await store.require(goalId);
  if(!goal.isolation) throw new Error("Goal isolation is missing.");
  const config=await store.readRuntime(goalId);
  const scheduler=new GoalScheduler(store,createGoalTaskExecutor(config,store,goal),{maxWorkers:goal.maxWorkers});
  await scheduler.runUntilBoundary(goalId);
}

main().catch(async(error)=>{
  try{
    const goalDir=arg("--goal-dir"), goalId=arg("--goal-id");
    const store=new GoalStore({baseDir:goalDir});
    await store.update(goalId,(record)=>{
      if(!["canceled","projected","awaiting_review","awaiting_projection"].includes(record.state)) { record.state="failed"; record.error=boundedGoalError(error); }
      return record;
    });
  }catch{}
  process.exitCode=1;
});
