import path from "node:path";
import { minimatch } from "minimatch";

export type PolicyRuleEffect = "allow" | "deny";
export interface PolicyRule { action: string; resource: string; effect: PolicyRuleEffect; }
export interface PolicyDecision { effect: PolicyRuleEffect; matchedRule?: PolicyRule; resource: string; }

type ResourceKind = "path" | "bash" | "git" | "generic";

export function normalizePolicyResource(kind: ResourceKind, value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "*";
  if (kind === "bash") return raw.replace(/\s+/g, " ").slice(0, 20_000);
  if (kind === "git") return raw.replace(/\\/g, "/").replace(/\s+/g, "").slice(0, 512);
  if (kind === "path") {
    const normalized = path.posix.normalize(raw.replace(/\\/g, "/").replace(/^\.\//, ""));
    if (path.posix.isAbsolute(normalized) || path.win32.isAbsolute(raw) || normalized === ".." || normalized.startsWith("../")) {
      throw new Error("Policy path resources must stay workspace-relative.");
    }
    return normalized === "." ? "." : normalized;
  }
  return raw.replace(/\s+/g, " ").slice(0, 20_000);
}

function patchPaths(patch: unknown): string[] {
  const out: string[] = [];
  for (const line of String(patch ?? "").split(/\r?\n/)) {
    if (!line.startsWith("+++ ") && !line.startsWith("--- ")) continue;
    let value = line.slice(4).trim().split("\t")[0] ?? "";
    if (!value || value === "/dev/null") continue;
    value = value.replace(/^([ab])\//, "");
    try { value = normalizePolicyResource("path", value); } catch { continue; }
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

export function policyResourcesForTool(action: string, args: Record<string, any> = {}): string[] {
  if (action === "bash" || action === "start_workspace_process") return [normalizePolicyResource("bash", args.command)];
  if (action === "git_push") return [normalizePolicyResource("git", `${args.remote ?? ""}/${args.branch ?? ""}`)];
  if (action === "prepare_change_set" && Array.isArray(args.changes)) {
    return [...new Set(args.changes.map((item: any) => normalizePolicyResource("path", item?.path)))];
  }
  if (action === "apply_patch") {
    const paths = patchPaths(args.patch);
    return paths.length ? paths : ["*"];
  }
  if (Array.isArray(args.paths)) return [...new Set(args.paths.map((item: unknown) => normalizePolicyResource("path", item)))];
  if (typeof args.path === "string") return [normalizePolicyResource("path", args.path)];
  if (typeof args.cwd === "string" && args.cwd.trim()) return [normalizePolicyResource("path", args.cwd)];
  return ["*"];
}

function ruleMatches(rule: PolicyRule, action: string, resource: string): boolean {
  return minimatch(action, rule.action, { dot: true, nocase: false }) && minimatch(resource, rule.resource, { dot: true, nocase: false });
}

export function evaluatePolicyRules(rules: PolicyRule[], action: string, resources: string[]): PolicyDecision {
  const normalizedResources = resources.length ? resources : ["*"];
  let lastAllow: { rule: PolicyRule; resource: string } | undefined;
  for (const resource of normalizedResources) {
    let matched: PolicyRule | undefined;
    for (const rule of rules) if (ruleMatches(rule, action, resource)) matched = rule;
    if (matched?.effect === "deny") return { effect: "deny", matchedRule: matched, resource };
    if (matched?.effect === "allow") lastAllow = { rule: matched, resource };
  }
  return lastAllow
    ? { effect: "allow", matchedRule: lastAllow.rule, resource: lastAllow.resource }
    : { effect: "allow", resource: normalizedResources[0] ?? "*" };
}
