import { createHash } from "node:crypto";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import { currentSyncCallDeadline, type DeadlineBudget } from "./deadline.js";
import { classifyExecutionHint, executionHintPublic } from "./executionGuidance.js";
import { CodexProError, type PathGuard, type Workspace } from "./guard.js";
import { runBash } from "./bashOps.js";
import { discoverVerificationCommands, reviewWorkspaceChanges } from "./analysis/impact.js";
import type { ChangeAnalysis } from "./analysis/types.js";
import { parseTestOutput, type StructuredTestResult, type TestFramework } from "./testResultOps.js";
import { buildVerificationRepairContract, type VerificationRepairContract } from "./verificationEvidence.js";

export interface TrustedCheck {
  id: string;
  command: string;
  source: string;
  reasons: string[];
  framework: TestFramework;
}

export interface CheckExecutionResult {
  check: TrustedCheck;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  terminationReason: string;
  ok: boolean;
  structured: StructuredTestResult;
}

export interface VerificationRoutingHint {
  recommendedExecution: "sync" | "async";
  asyncToolName: "start_checks" | "start_verification";
  asyncCutoffMs: number;
  aggregateRequestedTimeoutMs: number;
  reasons: string[];
  executionHint: Record<string, unknown>;
}

export function verificationRoutingHint(config: CodexProConfig, selectedChecks: TrustedCheck[], timeoutMs: number | undefined, asyncToolName: VerificationRoutingHint["asyncToolName"]): VerificationRoutingHint {
  const perCheckMs = Math.max(1_000, Math.min(timeoutMs ?? 30_000, config.maxBashTimeoutMs));
  const aggregateRequestedTimeoutMs = perCheckMs * selectedChecks.length;
  const highVariance = selectedChecks.some((check) => /(?:stress|integration|e2e|end[- ]to[- ]end|acceptance)/i.test(check.command));
  const hint = classifyExecutionHint({ deadlineMs: config.syncCallDeadlineMs, expectedDurationMs: aggregateRequestedTimeoutMs, category: "verification", highVariance });
  const reasons = [...hint.reasons];
  return { recommendedExecution: hint.executionClass === "async_preferred" ? "async" : "sync", asyncToolName, asyncCutoffMs: hint.thresholds.asyncPreferredMs, aggregateRequestedTimeoutMs, reasons, executionHint: executionHintPublic(hint) };
}

export interface CheckRunResult {
  ok: boolean;
  complete: boolean;
  deadlineYielded: boolean;
  remainingCheckIds: string[];
  selectedChecks: TrustedCheck[];
  results: CheckExecutionResult[];
  routing: VerificationRoutingHint;
  execution_hint: Record<string, unknown>;
}

function checkId(source: string, command: string): string {
  return `check_${createHash("sha256").update(source).update("\0").update(command).digest("hex").slice(0, 16)}`;
}

function normalizeStructuredFailurePaths(structured: StructuredTestResult, workspaceRoot: string): StructuredTestResult {
  return {
    ...structured,
    failures: structured.failures.map((failure) => {
      if (!failure.file) return failure;
      const raw = failure.file.trim();
      const absolute = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);
      const relative = path.relative(workspaceRoot, absolute);
      const outside = !relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
      const { file: _file, ...rest } = failure;
      return outside ? rest : { ...rest, file: relative.split(path.sep).join("/") };
    })
  };
}

function frameworkFor(command: string): TestFramework {
  const value = command.toLowerCase();
  if (value.includes("pytest")) return "pytest";
  if (value.includes("vitest")) return "vitest";
  if (value.includes("jest")) return "jest";
  if (value.startsWith("go test")) return "go";
  if (value.startsWith("cargo ")) return "cargo";
  if (value.startsWith("node ")) return "node";
  return "generic";
}
export async function discoverTrustedChecks(
  _config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace
): Promise<TrustedCheck[]> {
  const recommendations = await discoverVerificationCommands(guard, workspace);
  const seen = new Set<string>();
  const checks: TrustedCheck[] = [];
  for (const recommendation of recommendations) {
    const key = `${recommendation.source}\0${recommendation.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    checks.push({
      id: checkId(recommendation.source, recommendation.command),
      command: recommendation.command,
      source: recommendation.source,
      reasons: [...recommendation.reasons],
      framework: frameworkFor(recommendation.command)
    });
  }
  return checks;
}

export function selectTrustedChecks(discovered: TrustedCheck[], checkIds: string[]): TrustedCheck[] {
  const byId = new Map(discovered.map((check) => [check.id, check]));
  const uniqueIds = [...new Set(checkIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!uniqueIds.length) throw new CodexProError("At least one discovered check id is required.");
  return uniqueIds.map((id) => {
    const check = byId.get(id);
    if (!check) throw new CodexProError(`Unknown or no longer discovered check id: ${id}`);
    return check;
  });
}

export async function runChecks(request: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  checkIds: string[];
  timeoutMs?: number;
  sessionId?: string;
  deadline?: DeadlineBudget;
}): Promise<CheckRunResult> {
  const discovered = await discoverTrustedChecks(request.config, request.guard, request.workspace);
  const selectedChecks = selectTrustedChecks(discovered, request.checkIds);
  const results: CheckExecutionResult[] = [];
  const deadline = request.deadline ?? currentSyncCallDeadline();
  const requestedTimeoutMs = Math.max(1_000, Math.min(request.timeoutMs ?? 30_000, request.config.maxBashTimeoutMs));
  let deadlineYielded = false;
  let remainingCheckIds: string[] = [];
  for (let index = 0; index < selectedChecks.length; index += 1) {
    const check = selectedChecks[index];
    const effectiveTimeoutMs = deadline ? deadline.childTimeoutMs(requestedTimeoutMs, 1_000) : requestedTimeoutMs;
    if (effectiveTimeoutMs < 1_000) {
      deadlineYielded = true;
      remainingCheckIds = selectedChecks.slice(index).map((item) => item.id);
      break;
    }
    const result = await runBash(request.config, request.guard, request.workspace, check.command, { timeoutMs: effectiveTimeoutMs, sessionId: request.sessionId });
    const deadlineLimitedTimeout = Boolean(deadline && effectiveTimeoutMs < requestedTimeoutMs && result.terminationReason === "timeout");
    if (deadlineLimitedTimeout) {
      deadlineYielded = true;
      remainingCheckIds = selectedChecks.slice(index).map((item) => item.id);
      break;
    }
    results.push({
      check, exitCode: result.exitCode, signal: result.signal, durationMs: result.durationMs, terminationReason: result.terminationReason,
      ok: result.exitCode === 0 && result.terminationReason === "normal",
      structured: normalizeStructuredFailurePaths(parseTestOutput(check.framework, result.stdout, result.stderr, request.config.maxCheckOutputBytes), request.workspace.root)
    });
  }
  const complete = remainingCheckIds.length === 0;
  const routing = verificationRoutingHint(request.config, selectedChecks, request.timeoutMs, "start_checks");
  return { ok: complete && results.every((result) => result.ok), complete, deadlineYielded, remainingCheckIds, selectedChecks, results, routing, execution_hint: routing.executionHint };
}
export function selectVerificationChecks(analysis: ChangeAnalysis, discovered: TrustedCheck[]): TrustedCheck[] {
  const byCommand = new Map(discovered.map((check) => [check.command, check]));
  const recommended = analysis.recommendedCommands
    .map((item) => byCommand.get(item.command))
    .filter((check): check is TrustedCheck => Boolean(check));
  if (!recommended.length) return [];

  const selected: TrustedCheck[] = [];
  const test = recommended.find((check) => /(?:^|\s)(?:test|pytest)|\btest\b/i.test(check.command));
  const typecheck = recommended.find((check) => /typecheck|tsc|cargo check/i.test(check.command));
  const build = recommended.find((check) => /\bbuild\b/i.test(check.command));
  const highRisk = analysis.riskSignals.some((risk) => ["build", "configuration", "migration", "public-api"].includes(risk.id));
  if (test) selected.push(test);
  if (highRisk && typecheck && !selected.includes(typecheck)) selected.push(typecheck);
  if (highRisk && selected.length < 2 && build && !selected.includes(build)) selected.push(build);
  if (!selected.length) selected.push(recommended[0]);
  return selected.slice(0, 2);
}

export async function prepareVerification(request: { config: CodexProConfig; guard: PathGuard; workspace: Workspace; changedPaths: string[] }): Promise<{ analysis: ChangeAnalysis; selectedChecks: TrustedCheck[] }> {
  const analysis = await reviewWorkspaceChanges(request.config, request.guard, request.workspace, { changedPaths: request.changedPaths });
  const discovered = await discoverTrustedChecks(request.config, request.guard, request.workspace);
  return { analysis, selectedChecks: selectVerificationChecks(analysis, discovered) };
}

export interface VerificationPlanResult {
  analysis: ChangeAnalysis;
  selectedChecks: TrustedCheck[];
  results: CheckExecutionResult[];
  ok: boolean | null;
  complete: boolean;
  deadlineYielded: boolean;
  remainingCheckIds: string[];
  repair: VerificationRepairContract;
  routing: VerificationRoutingHint;
  execution_hint: Record<string, unknown>;
}

export function finalizeVerificationResult(analysis: ChangeAnalysis, selectedChecks: TrustedCheck[], results: CheckExecutionResult[], state: { complete: boolean; deadlineYielded?: boolean; remainingCheckIds?: string[] }, routing: VerificationRoutingHint): VerificationPlanResult {
  const repair = buildVerificationRepairContract(analysis, results);
  const effectiveRepair = !state.complete && repair.status === "passed" ? buildVerificationRepairContract(analysis, []) : repair;
  return { analysis, selectedChecks, results, ok: state.complete ? results.every((result) => result.ok) : null, complete: state.complete, deadlineYielded: Boolean(state.deadlineYielded), remainingCheckIds: state.remainingCheckIds ?? [], repair: effectiveRepair, routing, execution_hint: routing.executionHint };
}

export async function verifyChanges(request: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  changedPaths: string[];
  run?: boolean;
  timeoutMs?: number;
  sessionId?: string;
  deadline?: DeadlineBudget;
}): Promise<VerificationPlanResult> {
  const { analysis, selectedChecks } = await prepareVerification({ config: request.config, guard: request.guard, workspace: request.workspace, changedPaths: request.changedPaths });
  if (request.run === false || !selectedChecks.length) {
    const routing = verificationRoutingHint(request.config, selectedChecks, request.timeoutMs, "start_verification");
    return { analysis, selectedChecks, results: [], ok: selectedChecks.length ? null : true, complete: selectedChecks.length === 0, deadlineYielded: false, remainingCheckIds: selectedChecks.map((check) => check.id), repair: buildVerificationRepairContract(analysis, []), routing, execution_hint: routing.executionHint };
  }
  const executed = await runChecks({
    config: request.config,
    guard: request.guard,
    workspace: request.workspace,
    checkIds: selectedChecks.map((check) => check.id),
    timeoutMs: request.timeoutMs,
    sessionId: request.sessionId,
    deadline: request.deadline
  });
  return finalizeVerificationResult(analysis, selectedChecks, executed.results, { complete: executed.complete, deadlineYielded: executed.deadlineYielded, remainingCheckIds: executed.remainingCheckIds }, verificationRoutingHint(request.config, selectedChecks, request.timeoutMs, "start_verification"));
}
