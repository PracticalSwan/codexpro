import type { CodexProConfig } from "../config.js";
import type { PathGuard, Workspace } from "../guard.js";
import { redactSensitiveText } from "../redact.js";
import type { AnalysisProvider, AnalysisSearchIntent, StructuredSearchMatch } from "./types.js";
import { CodeGraphProvider } from "./codegraphProvider.js";
import { LspProvider } from "./lspProvider.js";

const providers = new Map<string, AnalysisProvider>();

export function registerAnalysisProvider(provider: AnalysisProvider): void {
  if (!provider.id.trim()) throw new Error("Analysis provider id is required.");
  providers.set(provider.id, provider);
}

export function listAnalysisProviders(): AnalysisProvider[] {
  return [...providers.values()];
}

export function normalizeProviderPaths(guard: PathGuard, workspace: Workspace, paths: string[]): { paths: string[]; warnings: string[] } {
  const valid: string[] = [];
  const warnings: string[] = [];
  for (const candidate of paths) {
    try {
      valid.push(guard.resolve(workspace, candidate).relPath);
    } catch (error) {
      warnings.push(redactSensitiveText(`Provider path rejected: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return { paths: [...new Set(valid)], warnings };
}


function configuredProviders(config: CodexProConfig): AnalysisProvider[] {
  const out: AnalysisProvider[] = [...providers.values()];
  if (config.codeGraphEnabled && !out.some((provider) => provider.id === "codegraph")) out.push(new CodeGraphProvider(config));
  if (config.lspEnabled && !out.some((provider) => provider.id === "lsp")) out.push(new LspProvider(config));
  return out;
}

export async function resolveAnalysisProviders(config: CodexProConfig, workspace: Workspace) {
  const routes = [];
  for (const provider of configuredProviders(config)) {
    try {
      const status = await provider.availability(workspace);
      routes.push({ id: provider.id, ...status });
    } catch (error) {
      routes.push({ id: provider.id, available: false, detail: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    }
  }
  return routes;
}

export async function searchOptionalAnalysisProviders(
  config: CodexProConfig,
  guard: PathGuard,
  workspace: Workspace,
  query: string,
  intent: AnalysisSearchIntent,
  maxResults: number,
  override?: AnalysisProvider[]
): Promise<{ matches: StructuredSearchMatch[]; warnings: string[] }> {
  const matches: StructuredSearchMatch[] = [];
  const warnings: string[] = [];
  for (const provider of override ?? configuredProviders(config)) {
    let availability;
    try { availability = await provider.availability(workspace); }
    catch (error) { warnings.push(`${provider.id}: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`); continue; }
    if (!availability.available || !provider.search) {
      if (availability.detail) warnings.push(`${provider.id}: ${redactSensitiveText(availability.detail)}`);
      continue;
    }
    try {
      const result = await provider.search({ workspaceId: workspace.id, root: workspace.root, query, intent });
      for (const match of (result.matches ?? []).slice(0, maxResults)) {
        try {
          const resolved = guard.resolve(workspace, match.path);
          matches.push({ ...match, path: resolved.relPath });
        } catch (error) {
          warnings.push(`${provider.id}: provider path rejected by workspace guard.`);
        }
        if (matches.length >= maxResults) break;
      }
      for (const warning of result.warnings ?? []) warnings.push(`${provider.id}: ${redactSensitiveText(warning)}`);
    } catch (error) {
      warnings.push(`${provider.id}: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`);
    }
    if (matches.length >= maxResults) break;
  }
  return { matches, warnings };
}
