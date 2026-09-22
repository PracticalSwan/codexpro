import { createHash } from "node:crypto";
import type { ChangeAnalysis } from "./analysis/types.js";
import type { CheckExecutionResult } from "./checksOps.js";
import { redactSensitiveText } from "./redact.js";

export interface VerificationFailureContext {
  failureId: string;
  checkId: string;
  primaryFailure?: { path?: string; line?: number; column?: number; message: string };
  changedPaths: string[];
  relatedTests: string[];
  contextLocations: Array<{ path: string; startLine?: number; endLine?: number; reasons: string[] }>;
  reproduce?: { display: string };
  warnings: string[];
}

function safePath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\\/g, "/");
  if (!text || text.includes("\0") || text.startsWith("/") || /^[A-Za-z]:\//.test(text) || text === "." || text === ".." || text.split("/").some((segment) => segment === "..")) return undefined;
  return text.slice(0, 512);
}

function unique(values: Array<string | undefined>, max: number): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].slice(0, max);
}

export function composeVerificationFailureContext(analysis: ChangeAnalysis, results: CheckExecutionResult[], maxFailures = 5): VerificationFailureContext[] {
  const contexts: VerificationFailureContext[] = [];
  for (const result of results.filter((item) => !item.ok).slice(0, maxFailures)) {
    const failure = result.structured.failures[0];
    const primaryPath = safePath(failure?.file);
    const primaryMessage = redactSensitiveText(failure?.message || `Check ${result.check.id} failed.`).replace(/[\r\n\0]+/g, " ").slice(0, 360);
    const changedPaths = unique(analysis.changedPaths.map(safePath), 12);
    const relatedTests = unique([
      ...analysis.relatedTests.map((item) => safePath(item.path)),
      ...result.structured.failures.filter((item) => item.file && /(?:test|spec|__tests__)/i.test(item.file)).map((item) => safePath(item.file))
    ], 12);
    const contextLocations: VerificationFailureContext["contextLocations"] = [];
    const add = (path: string | undefined, reasons: string[], line?: number) => {
      if (!path || contextLocations.some((item) => item.path === path) || contextLocations.length >= 6) return;
      contextLocations.push({ path, ...(Number.isInteger(line) && line! > 0 ? { startLine: Math.max(1, line! - 8), endLine: line! + 8 } : {}), reasons: reasons.slice(0, 4) });
    };
    add(primaryPath, ["primary structured failure"], failure?.line);
    for (const path of changedPaths) add(path, ["changed path"]);
    for (const item of analysis.dependentFiles.slice(0, 8)) add(safePath(item.path), item.reasons.length ? item.reasons : ["related dependency"]);
    for (const path of relatedTests) add(path, ["related test"]);
    const failureId = `failure_${createHash("sha256").update(result.check.id).update("\0").update(primaryMessage).digest("hex").slice(0, 16)}`;
    contexts.push({
      failureId,
      checkId: result.check.id,
      ...(failure ? { primaryFailure: { ...(primaryPath ? { path: primaryPath } : {}), ...(Number.isInteger(failure.line) ? { line: failure.line } : {}), ...(Number.isInteger(failure.column) ? { column: failure.column } : {}), message: primaryMessage } } : { primaryFailure: { message: primaryMessage } }),
      changedPaths,
      relatedTests,
      contextLocations,
      reproduce: result.check.command ? { display: redactSensitiveText(result.check.command).slice(0, 1000) } : undefined,
      warnings: [
        ...(failure?.file && !primaryPath ? ["Structured failure path was omitted because it was outside the workspace or not relative."] : []),
        ...(result.structured.truncated ? ["Original structured failure output was truncated."] : [])
      ]
    });
  }
  return contexts;
}
