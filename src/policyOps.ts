import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { BashMode, CodexProConfig, CodexSessionsMode, ToolMode, WriteMode } from "./config.js";
import { CodexProError } from "./guard.js";
import { redactSensitiveText } from "./redact.js";
import type { PolicyRule } from "./policyRules.js";

export const WORKSPACE_POLICY_FILE = ".codexpro-policy.json";
export const MAX_WORKSPACE_POLICY_BYTES = 65_536;

const boundedText = z.string().trim().min(1).max(1024).refine((value) => !/[\0\r\n]/.test(value), "must be one line without NUL bytes");
const relativePathText = boundedText.refine((value) => {
  const normalized = value.replaceAll("\\", "/");
  return !path.posix.isAbsolute(normalized) && !path.win32.isAbsolute(value) && !normalized.split("/").includes("..");
}, "must stay relative to the workspace");
const positiveLimit = z.number().int().positive().max(1_000_000_000);

const WorkspacePolicyV1Schema = z.object({
  version: z.literal(1),
  blockedGlobs: z.array(boundedText).max(128).optional(),
  importantFiles: z.array(relativePathText).max(128).optional(),
  recommendedVerification: z.array(boundedText).max(64).optional(),
  bashMode: z.enum(["off", "safe", "full"]).optional(),
  writeMode: z.enum(["off", "handoff", "workspace"]).optional(),
  toolMode: z.enum(["minimal", "standard", "full"]).optional(),
  codexSessions: z.enum(["off", "metadata", "read"]).optional(),
  analysisEnabled: z.boolean().optional(),
  allowGitPush: z.boolean().optional(),
  codeGraphEnabled: z.boolean().optional(),
  lspEnabled: z.boolean().optional(),
  artifactExportEnabled: z.boolean().optional(),
  goalsEnabled: z.boolean().optional(),
  limits: z.object({
    maxReadBytes: positiveLimit.optional(),
    maxWriteBytes: positiveLimit.optional(),
    maxOutputBytes: positiveLimit.optional(),
    maxBashObservedOutputBytes: positiveLimit.optional(),
    maxBashTimeoutMs: positiveLimit.optional(),
    maxWorkspaceProcesses: positiveLimit.optional(),
    maxProcessOutputBytes: positiveLimit.optional(),
    maxProcessReadBytes: positiveLimit.optional(),
    maxCheckOutputBytes: positiveLimit.optional(),
    maxImportBytes: positiveLimit.optional(),
    maxArchiveCompressedBytes: positiveLimit.optional(),
    maxArchiveEntries: positiveLimit.optional(),
    maxArchiveExpandedBytes: positiveLimit.optional(),
    maxArchiveCompressionRatio: positiveLimit.optional(),
    maxDocumentBytes: positiveLimit.optional(),
    maxDocumentOutputBytes: positiveLimit.optional(),
    maxExportBytes: positiveLimit.optional(),
    maxGoals: positiveLimit.optional(),
    maxGoalTasks: positiveLimit.optional(),
    maxGoalWorkers: positiveLimit.optional(),
    maxSearchResults: positiveLimit.optional(),
    maxOperationBytes: positiveLimit.optional(),
    maxOperationFiles: positiveLimit.optional(),
    maxOperationDurationMs: positiveLimit.optional(),
    maxOperationReceipts: positiveLimit.optional()
  }).strict().optional(),
  analysisLimits: z.object({
    maxInventoryFiles: positiveLimit.optional(),
    maxAnalyzedFiles: positiveLimit.optional(),
    maxScannedBytes: positiveLimit.optional(),
    maxSymbols: positiveLimit.optional(),
    maxRelationships: positiveLimit.optional()
  }).strict().optional()
}).strict();

const PolicyRuleSchema = z.object({
  action: boundedText,
  resource: boundedText,
  effect: z.enum(["allow", "deny"])
}).strict();

const WorkspacePolicyV2Schema = WorkspacePolicyV1Schema.omit({ version: true }).extend({
  version: z.literal(2),
  toolRules: z.array(PolicyRuleSchema).max(256).optional()
}).strict();

const WorkspacePolicySchema = z.discriminatedUnion("version", [WorkspacePolicyV1Schema, WorkspacePolicyV2Schema]);

export type WorkspacePolicy = z.infer<typeof WorkspacePolicySchema>;
export interface WorkspacePolicyState { policy: WorkspacePolicy; sha256: string; }
export interface EffectiveWorkspacePolicy { policy: WorkspacePolicy | null; effective: CodexProConfig; sha256?: string; }

export function toolRulesForPolicy(policy: WorkspacePolicy | null): PolicyRule[] {
  return policy?.version === 2 ? (policy.toolRules ?? []) : [];
}

const BASH_RANK: Record<BashMode, number> = { off: 0, safe: 1, full: 2 };
const WRITE_RANK: Record<WriteMode, number> = { off: 0, handoff: 1, workspace: 2 };
const TOOL_RANK: Record<ToolMode, number> = { minimal: 0, standard: 1, full: 2 };
const CODEX_RANK: Record<CodexSessionsMode, number> = { off: 0, metadata: 1, read: 2 };

function tighter<T extends string>(current: T, requested: T | undefined, rank: Record<T, number>): T {
  if (!requested) return current;
  return rank[requested] < rank[current] ? requested : current;
}
function lower(current: number, requested?: number): number { return requested === undefined ? current : Math.min(current, requested); }
function invalidPolicy(message: string): never {
  const bounded = redactSensitiveText(message).replace(/\s+/g, " ").trim().slice(0, 480);
  throw new CodexProError(`Invalid workspace policy: ${bounded || "validation failed"}`);
}
function issues(error: z.ZodError): string {
  return error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "document"}: ${issue.message}`).join("; ");
}

export function loadWorkspacePolicyStateSync(root: string): WorkspacePolicyState | null {
  const policyPath = path.join(root, WORKSPACE_POLICY_FILE);
  let stat: fs.Stats;
  try { stat = fs.lstatSync(policyPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    invalidPolicy("could not inspect the policy file");
  }
  if (stat.isSymbolicLink()) invalidPolicy(`${WORKSPACE_POLICY_FILE} must not be a symlink`);
  if (!stat.isFile()) invalidPolicy(`${WORKSPACE_POLICY_FILE} must be a regular file`);
  if (stat.size > MAX_WORKSPACE_POLICY_BYTES) invalidPolicy(`${WORKSPACE_POLICY_FILE} is too large; limit is ${MAX_WORKSPACE_POLICY_BYTES} bytes`);
  let raw: string;
  try { raw = fs.readFileSync(policyPath, "utf8"); } catch { invalidPolicy("could not read the policy file"); }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (error) { invalidPolicy(`JSON parse failed: ${error instanceof Error ? error.message : String(error)}`); }
  const validated = WorkspacePolicySchema.safeParse(parsed);
  if (!validated.success) invalidPolicy(issues(validated.error));
  return { policy: validated.data, sha256: createHash("sha256").update(raw).digest("hex") };
}

export async function loadWorkspacePolicy(root: string): Promise<WorkspacePolicy | null> {
  return loadWorkspacePolicyStateSync(root)?.policy ?? null;
}

export function applyWorkspacePolicy(config: CodexProConfig, policy: WorkspacePolicy | null): CodexProConfig {
  if (!policy) return config;
  const limits = policy.limits ?? {};
  const maxOutputBytes = lower(config.maxOutputBytes, limits.maxOutputBytes);
  return {
    ...config,
    bashMode: tighter(config.bashMode, policy.bashMode, BASH_RANK),
    writeMode: tighter(config.writeMode, policy.writeMode, WRITE_RANK),
    toolMode: tighter(config.toolMode, policy.toolMode, TOOL_RANK),
    codexSessions: tighter(config.codexSessions, policy.codexSessions, CODEX_RANK),
    analysisEnabled: config.analysisEnabled && policy.analysisEnabled !== false,
    allowGitPush: config.allowGitPush && policy.allowGitPush !== false,
    codeGraphEnabled: config.codeGraphEnabled && policy.codeGraphEnabled !== false,
    lspEnabled: config.lspEnabled && policy.lspEnabled !== false,
    artifactExportEnabled: config.artifactExportEnabled && policy.artifactExportEnabled !== false,
    goalsEnabled: config.goalsEnabled && policy.goalsEnabled !== false,
    maxReadBytes: lower(config.maxReadBytes, limits.maxReadBytes),
    maxWriteBytes: lower(config.maxWriteBytes, limits.maxWriteBytes),
    maxOutputBytes,
    maxBashObservedOutputBytes: Math.max(maxOutputBytes + 1, lower(config.maxBashObservedOutputBytes, limits.maxBashObservedOutputBytes)),
    maxBashTimeoutMs: lower(config.maxBashTimeoutMs, limits.maxBashTimeoutMs),
    maxWorkspaceProcesses: lower(config.maxWorkspaceProcesses, limits.maxWorkspaceProcesses),
    maxProcessOutputBytes: lower(config.maxProcessOutputBytes, limits.maxProcessOutputBytes),
    maxProcessReadBytes: lower(config.maxProcessReadBytes, limits.maxProcessReadBytes),
    maxCheckOutputBytes: lower(config.maxCheckOutputBytes, limits.maxCheckOutputBytes),
    maxImportBytes: lower(config.maxImportBytes, limits.maxImportBytes),
    maxArchiveCompressedBytes: lower(config.maxArchiveCompressedBytes, limits.maxArchiveCompressedBytes),
    maxArchiveEntries: lower(config.maxArchiveEntries, limits.maxArchiveEntries),
    maxArchiveExpandedBytes: lower(config.maxArchiveExpandedBytes, limits.maxArchiveExpandedBytes),
    maxArchiveCompressionRatio: lower(config.maxArchiveCompressionRatio, limits.maxArchiveCompressionRatio),
    maxDocumentBytes: lower(config.maxDocumentBytes, limits.maxDocumentBytes),
    maxDocumentOutputBytes: lower(config.maxDocumentOutputBytes, limits.maxDocumentOutputBytes),
    maxExportBytes: lower(config.maxExportBytes, limits.maxExportBytes),
    maxGoals: lower(config.maxGoals, limits.maxGoals),
    maxGoalTasks: lower(config.maxGoalTasks, limits.maxGoalTasks),
    maxGoalWorkers: lower(config.maxGoalWorkers, limits.maxGoalWorkers),
    maxSearchResults: lower(config.maxSearchResults, limits.maxSearchResults),
    maxOperationBytes: lower(config.maxOperationBytes, limits.maxOperationBytes),
    maxOperationFiles: lower(config.maxOperationFiles, limits.maxOperationFiles),
    maxOperationDurationMs: lower(config.maxOperationDurationMs, limits.maxOperationDurationMs),
    maxOperationReceipts: lower(config.maxOperationReceipts, limits.maxOperationReceipts),
    blockedGlobs: [...new Set([...config.blockedGlobs, ...(policy.blockedGlobs ?? [])])],
    analysisLimits: {
      maxInventoryFiles: lower(config.analysisLimits.maxInventoryFiles, policy.analysisLimits?.maxInventoryFiles),
      maxAnalyzedFiles: lower(config.analysisLimits.maxAnalyzedFiles, policy.analysisLimits?.maxAnalyzedFiles),
      maxScannedBytes: lower(config.analysisLimits.maxScannedBytes, policy.analysisLimits?.maxScannedBytes),
      maxSymbols: lower(config.analysisLimits.maxSymbols, policy.analysisLimits?.maxSymbols),
      maxRelationships: lower(config.analysisLimits.maxRelationships, policy.analysisLimits?.maxRelationships)
    }
  };
}

function safeConfig(config: CodexProConfig): Record<string, unknown> {
  return {
    bashMode: config.bashMode, writeMode: config.writeMode, toolMode: config.toolMode,
    executionBackend: config.executionBackend, dockerImageConfigured: Boolean(config.dockerImage), dockerMemoryMb: config.dockerMemoryMb, dockerCpus: config.dockerCpus, dockerPidsLimit: config.dockerPidsLimit, goalExecutionBackend: "host",
    codexSessions: config.codexSessions, analysisEnabled: config.analysisEnabled, allowGitPush: config.allowGitPush, codeGraphEnabled: config.codeGraphEnabled, lspEnabled: config.lspEnabled, artifactExportEnabled: config.artifactExportEnabled, goalsEnabled: config.goalsEnabled,
    maxReadBytes: config.maxReadBytes, maxWriteBytes: config.maxWriteBytes,
    maxOutputBytes: config.maxOutputBytes, maxBashObservedOutputBytes: config.maxBashObservedOutputBytes,
    maxBashTimeoutMs: config.maxBashTimeoutMs, maxWorkspaceProcesses: config.maxWorkspaceProcesses,
    maxProcessOutputBytes: config.maxProcessOutputBytes, maxProcessReadBytes: config.maxProcessReadBytes,
    maxCheckOutputBytes: config.maxCheckOutputBytes, maxImportBytes: config.maxImportBytes,
    maxArchiveCompressedBytes: config.maxArchiveCompressedBytes, maxArchiveEntries: config.maxArchiveEntries,
    maxArchiveExpandedBytes: config.maxArchiveExpandedBytes, maxArchiveCompressionRatio: config.maxArchiveCompressionRatio,
    maxDocumentBytes: config.maxDocumentBytes, maxDocumentOutputBytes: config.maxDocumentOutputBytes, maxExportBytes: config.maxExportBytes,
    maxGoals: config.maxGoals, maxGoalTasks: config.maxGoalTasks, maxGoalWorkers: config.maxGoalWorkers,
    maxSearchResults: config.maxSearchResults, maxOperationBytes: config.maxOperationBytes,
    maxOperationFiles: config.maxOperationFiles, maxOperationDurationMs: config.maxOperationDurationMs,
    maxOperationReceipts: config.maxOperationReceipts, analysisLimits: { ...config.analysisLimits }
  };
}

export class WorkspacePolicyRegistry {
  private readonly cache = new Map<string, EffectiveWorkspacePolicy>();
  constructor(private readonly globalConfig: CodexProConfig) {}
  ensure(root: string): EffectiveWorkspacePolicy {
    const key = fs.realpathSync.native(root);
    const existing = this.cache.get(key);
    if (existing) return existing;
    const state = loadWorkspacePolicyStateSync(key);
    const entry: EffectiveWorkspacePolicy = {
      policy: state?.policy ?? null,
      effective: applyWorkspacePolicy(this.globalConfig, state?.policy ?? null),
      ...(state ? { sha256: state.sha256 } : {})
    };
    this.cache.set(key, entry);
    return entry;
  }
  effectiveConfig(root: string): CodexProConfig { return this.ensure(root).effective; }
  describe(root: string): Record<string, unknown> {
    const { policy, effective } = this.ensure(root);
    return {
      policy_present: Boolean(policy), policy_file: WORKSPACE_POLICY_FILE,
      configured: safeConfig(this.globalConfig), effective: safeConfig(effective),
      blocked_globs_added: policy?.blockedGlobs ?? [], important_files: policy?.importantFiles ?? [],
      recommended_verification: policy?.recommendedVerification ?? [],
      tool_rules: toolRulesForPolicy(policy)
    };
  }
}
