import path from "node:path";
import type { ChangeAnalysis } from "./analysis/types.js";
import type { CheckExecutionResult } from "./checksOps.js";
import { redactSensitiveText } from "./redact.js";

export type VerificationFailureCategory =
  | "test" | "typecheck" | "lint" | "build"
  | "runtime" | "timeout" | "toolchain" | "unknown";

export interface VerificationFailureEvidence {
  checkId: string;
  category: VerificationFailureCategory;
  summary: string;
  likelyPaths: string[];
  relatedTests: string[];
  exitCode: number | null;
  truncated: boolean;
}

export interface VerificationRepairContract {
  status: "passed" | "failed" | "not_run";
  retryRecommended: boolean;
  maxSuggestedRepairAttempts: 2;
  failures: VerificationFailureEvidence[];
  nextActions: string[];
}
function normalizedRelative(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw || path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) return undefined;
  const normalized = path.posix.normalize(raw.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) return undefined;
  return normalized.slice(0, 512);
}

function uniquePaths(values: unknown[], limit = 16): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizedRelative(value);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function categoryFor(result: CheckExecutionResult): VerificationFailureCategory {
  const command = result.check.command.toLowerCase();
  const termination = result.terminationReason.toLowerCase();
  if (/timeout|timed[_ -]?out/.test(termination)) return "timeout";
  if (/spawn|enoent|not[_ -]?found|unavailable|toolchain/.test(termination)) return "toolchain";
  if (/\btypecheck\b|\btsc\b|cargo\s+check/.test(command)) return "typecheck";
  if (/\blint\b|eslint|ruff|clippy/.test(command)) return "lint";
  if (/\bbuild\b|\bcompile\b/.test(command)) return "build";
  if (["jest", "vitest", "pytest", "go"].includes(result.check.framework) || /\btest\b|pytest|vitest|jest|node\s+--test/.test(command)) return "test";
  if (!result.ok || result.exitCode !== 0) return "runtime";
  return "unknown";
}

function summaryFor(result: CheckExecutionResult): string {
  const first = result.structured.failures[0]?.message;
  const text = first || `Check ${result.check.id} failed (${result.terminationReason}).`;
  return redactSensitiveText(text).replace(/[\r\n\0]+/g, " ").trim().slice(0, 240);
}

function likelyPathsFor(analysis: ChangeAnalysis, result: CheckExecutionResult): string[] {
  const failurePaths = uniquePaths(result.structured.failures.map((failure) => failure.file));
  const changed = uniquePaths(analysis.changedPaths);
  const dependents = uniquePaths(analysis.dependentFiles.map((item) => item.path));
  const relatedTests = uniquePaths(analysis.relatedTests.map((item) => item.path));
  return uniquePaths([...failurePaths, ...changed, ...dependents, ...relatedTests]);
}

function relatedTestsFor(analysis: ChangeAnalysis, result: CheckExecutionResult): string[] {
  const knownTests = uniquePaths(analysis.relatedTests.map((item) => item.path));
  const failureTests = uniquePaths(result.structured.failures
    .map((failure) => failure.file)
    .filter((file) => typeof file === "string" && /(?:^|\/)(?:test|tests|__tests__)(?:\/|\.)|\.test\.|\.spec\./i.test(file)));
  return uniquePaths([...failureTests, ...knownTests]);
}
function retryUseful(result: CheckExecutionResult, category: VerificationFailureCategory): boolean {
  const termination = result.terminationReason.toLowerCase();
  if (/cancel|abort|spawn|enoent|not[_ -]?found|unavailable|toolchain/.test(termination)) return false;
  if (category === "toolchain") return false;
  if (category === "timeout" && result.structured.failures.length === 0) return false;
  return result.structured.failures.length > 0 || ["test", "typecheck", "lint", "build", "runtime"].includes(category);
}

function pushAction(actions: string[], value: string): void {
  if (!actions.includes(value) && actions.length < 8) actions.push(value);
}

function nextActionsFor(failures: VerificationFailureEvidence[]): string[] {
  const actions: string[] = [];
  const firstPath = failures.find((failure) => failure.likelyPaths.length)?.likelyPaths[0];
  if (firstPath) pushAction(actions, `Inspect ${firstPath} at the first structured failure before changing additional files.`);
  if (failures.some((failure) => failure.category === "toolchain")) {
    pushAction(actions, "Resolve the missing verification toolchain or setup issue before attempting a code repair.");
  }
  if (failures.some((failure) => failure.category === "timeout")) {
    pushAction(actions, "Narrow or resolve the timed-out verification check before repeating repair attempts.");
  }
  if (failures.some((failure) => ["test", "typecheck", "lint", "build", "runtime"].includes(failure.category))) {
    pushAction(actions, "Review the changed source paths associated with the failing verification evidence.");
    pushAction(actions, "Rerun the same selected checks after one focused repair.");
  }
  return actions;
}
export function buildVerificationRepairContract(
  analysis: ChangeAnalysis,
  results: CheckExecutionResult[]
): VerificationRepairContract {
  if (!results.length) {
    return { status: "not_run", retryRecommended: false, maxSuggestedRepairAttempts: 2, failures: [], nextActions: [] };
  }
  if (results.every((result) => result.ok)) {
    return { status: "passed", retryRecommended: false, maxSuggestedRepairAttempts: 2, failures: [], nextActions: [] };
  }

  const failedResults = results.filter((result) => !result.ok).slice(0, 8);
  const failures = failedResults.map((result): VerificationFailureEvidence => {
    const category = categoryFor(result);
    return {
      checkId: result.check.id,
      category,
      summary: summaryFor(result),
      likelyPaths: likelyPathsFor(analysis, result).slice(0, 16),
      relatedTests: relatedTestsFor(analysis, result).slice(0, 16),
      exitCode: result.exitCode,
      truncated: result.structured.truncated === true
    };
  });

  return {
    status: "failed",
    retryRecommended: failedResults.some((result, index) => retryUseful(result, failures[index].category)),
    maxSuggestedRepairAttempts: 2,
    failures,
    nextActions: nextActionsFor(failures)
  };
}
