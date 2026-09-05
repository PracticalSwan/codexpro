import { redactSensitiveText } from "./redact.js";

export type TestFramework = "generic" | "node" | "jest" | "vitest" | "pytest" | "go" | "cargo";

export interface StructuredTestFailure {
  test?: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
}

export interface StructuredTestResult {
  framework: TestFramework;
  passed: number;
  failed: number;
  skipped: number;
  failures: StructuredTestFailure[];
  evidence: string;
  truncated: boolean;
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0;
  let end = 0;
  for (const char of value) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return value.slice(0, end);
}

function summaryCount(text: string, label: "passed" | "failed" | "skipped"): number {
  const patterns = [
    new RegExp(`(?:^|\\s)(\\d+)\\s+(?:tests?\\s+)?${label}\\b`, "i"),
    new RegExp(`\\b${label}\\s*[:=]\\s*(\\d+)`, "i"),
    new RegExp(`^#\\s+${label === "passed" ? "pass" : label === "failed" ? "fail" : "skip"}\\s+(\\d+)`, "im")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return 0;
}
function parseFailures(text: string): StructuredTestFailure[] {
  const failures: StructuredTestFailure[] = [];
  const seen = new Set<string>();
  const pattern = /(?:^|\n)(?:FAIL\s+)?((?:[A-Za-z]:)?[^\r\n:]+\.(?:[cm]?[jt]sx?|py|go|rs|java|cs|swift)):(\d+)(?::(\d+))?\s*([^\r\n]*)/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null && failures.length < 64) {
    const file = match[1].trim();
    const line = Number(match[2]);
    const column = match[3] ? Number(match[3]) : undefined;
    const message = redactSensitiveText(match[4].trim() || "test failure").slice(0, 400);
    const key = `${file}:${line}:${column ?? 0}:${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    failures.push({ file, line, ...(column ? { column } : {}), message });
  }
  return failures;
}

export function parseTestOutput(
  framework: TestFramework,
  stdout: string,
  stderr: string,
  maxEvidenceBytes = 120_000
): StructuredTestResult {
  const combined = [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
  const redacted = redactSensitiveText(combined);
  const maxBytes = Math.max(1, Math.floor(maxEvidenceBytes));
  const evidence = utf8Prefix(redacted, maxBytes);
  const failures = parseFailures(redacted);
  const explicitFailed = summaryCount(redacted, "failed");
  return {
    framework,
    passed: summaryCount(redacted, "passed"),
    failed: explicitFailed || failures.length,
    skipped: summaryCount(redacted, "skipped"),
    failures,
    evidence,
    truncated: Buffer.byteLength(redacted, "utf8") > Buffer.byteLength(evidence, "utf8")
  };
}
