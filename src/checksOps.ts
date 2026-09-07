import { createHash } from "node:crypto";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
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

export interface CheckRunResult {
  ok: boolean;
  selectedChecks: TrustedCheck[];
  results: CheckExecutionResult[];
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

export async function runChecks(request: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  checkIds: string[];
  timeoutMs?: number;
  sessionId?: string;
}): Promise<CheckRunResult> {
  const discovered = await discoverTrustedChecks(request.config, request.guard, request.workspace);
  const byId = new Map(discovered.map((check) => [check.id, check]));
  const uniqueIds = [...new Set(request.checkIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
  if (!uniqueIds.length) throw new CodexProError("At least one discovered check id is required.");
  const selectedChecks = uniqueIds.map((id) => {
    const check = byId.get(id);
    if (!check) throw new CodexProError(`Unknown or no longer discovered check id: ${id}`);
    return check;
  });
  const results: CheckExecutionResult[] = [];
  for (const check of selectedChecks) {
    const result = await runBash(request.config, request.guard, request.workspace, check.command, {
      timeoutMs: request.timeoutMs,
      sessionId: request.sessionId
    });
    results.push({
      check,
      exitCode: result.exitCode,
      signal: result.signal,
      durationMs: result.durationMs,
      terminationReason: result.terminationReason,
      ok: result.exitCode === 0 && result.terminationReason === "normal",
      structured: normalizeStructuredFailurePaths(
        parseTestOutput(check.framework, result.stdout, result.stderr, request.config.maxCheckOutputBytes),
        request.workspace.root
      )
    });
  }
  return { ok: results.every((result) => result.ok), selectedChecks, results };
}
function chooseVerificationChecks(analysis: ChangeAnalysis, discovered: TrustedCheck[]): TrustedCheck[] {
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

export interface VerificationPlanResult {
  analysis: ChangeAnalysis;
  selectedChecks: TrustedCheck[];
  results: CheckExecutionResult[];
  ok: boolean | null;
  repair: VerificationRepairContract;
}

export async function verifyChanges(request: {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  changedPaths: string[];
  run?: boolean;
  timeoutMs?: number;
  sessionId?: string;
}): Promise<VerificationPlanResult> {
  const analysis = await reviewWorkspaceChanges(request.config, request.guard, request.workspace, {
    changedPaths: request.changedPaths
  });
  const discovered = await discoverTrustedChecks(request.config, request.guard, request.workspace);
  const selectedChecks = chooseVerificationChecks(analysis, discovered);
  if (request.run === false || !selectedChecks.length) {
    return { analysis, selectedChecks, results: [], ok: selectedChecks.length ? null : true, repair: buildVerificationRepairContract(analysis, []) };
  }
  const executed = await runChecks({
    config: request.config,
    guard: request.guard,
    workspace: request.workspace,
    checkIds: selectedChecks.map((check) => check.id),
    timeoutMs: request.timeoutMs,
    sessionId: request.sessionId
  });
  return { analysis, selectedChecks, results: executed.results, ok: executed.ok, repair: buildVerificationRepairContract(analysis, executed.results) };
}
