import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import type { CodexProConfig } from "./config.js";
import { CodexProError, PathGuard, type Workspace } from "./guard.js";
import { redactSensitiveText } from "./redact.js";
import { buildPackageGraph } from "./packageGraph.js";

export interface DependencySymbolMatch { path: string; line: number; excerpt: string; evidence: "types" | "source"; }
export interface DependencyInspectionResult {
  packageName: string;
  kind: "installed" | "workspace";
  ownerPackage: { name: string; path: string };
  declaredRange: string | null;
  dependencySection: "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies" | null;
  installedVersion: string | null;
  packageRoot: string | null;
  metadata?: { name: string; version: string | null; type?: string; main?: string; module?: string; types?: string; typings?: string; engines?: { node?: string } };
  resolvedEntrypoint: string | null;
  typesEntrypoint: string | null;
  exportKeys: string[];
  packageManager: string | null;
  readme?: { path: string; text: string; truncated: boolean };
  symbol?: { query: string; status: "found" | "not_found" | "not_requested"; matches: DependencySymbolMatch[] };
  warnings: string[];
  truncated: boolean;
}

const PACKAGE_NAME = /^(?:@([a-z0-9._~-]+)\/)?([a-z0-9._~-]+)$/i;
const TEXT_EXTENSIONS = new Set([".d.ts", ".ts", ".tsx", ".js", ".mjs", ".cjs"]);

function safeRel(root: string, candidate: string): string | undefined {
  const relative = path.relative(root, candidate);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return undefined;
  return relative.split(path.sep).join("/");
}

function packageJsonSubset(metadata: any): { name: string; version: string | null; type?: string; main?: string; module?: string; types?: string; typings?: string; exports?: unknown; engines?: { node?: string } } {
  const safe = (value: unknown, max = 512): string => redactSensitiveText(String(value)).slice(0, max);
  const out: any = { name: safe(metadata.name, 160), version: typeof metadata.version === "string" ? safe(metadata.version, 160) : null };
  for (const key of ["type", "main", "module", "types", "typings"] as const) if (typeof metadata[key] === "string") out[key] = safe(metadata[key]);
  if (metadata.engines && typeof metadata.engines.node === "string") out.engines = { node: safe(metadata.engines.node, 240) };
  return out;
}

function exportKeys(value: unknown, prefix = "", out: string[] = []): string[] {
  if (out.length >= 128 || !value || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const current = prefix ? `${prefix}.${key}` : key;
    out.push(redactSensitiveText(current).slice(0, 240));
    if (child && typeof child === "object") exportKeys(child, current, out);
    if (out.length >= 128) break;
  }
  return out;
}

async function readJson(filePath: string, maxBytes = 512_000): Promise<any | null> {
  try {
    const link = await fsp.lstat(filePath);
    if (link.isSymbolicLink() || !link.isFile() || link.size > maxBytes) return null;
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch { return null; }
}

async function resolveEntry(root: string, entry: unknown): Promise<string | null> {
  if (typeof entry !== "string" || !entry || entry.startsWith("#")) return null;
  const candidate = path.resolve(root, entry);
  const relative = safeRel(root, candidate);
  if (!relative) return null;
  try {
    const stat = await fsp.lstat(candidate);
    if (stat.isSymbolicLink()) return null;
    const canonical = await fsp.realpath(candidate);
    if (!safeRel(root, canonical)) return null;
    if (stat.isFile()) return safeRel(root, canonical) ?? relative;
    if (stat.isDirectory()) {
      for (const suffix of ["index.js", "index.mjs", "index.cjs", "index.d.ts"]) {
        const nested = path.join(candidate, suffix);
        const nestedStat = await fsp.lstat(nested).catch(() => null);
        if (nestedStat?.isFile() && !nestedStat.isSymbolicLink()) {
          const nestedCanonical = await fsp.realpath(nested).catch(() => "");
          if (nestedCanonical && safeRel(root, nestedCanonical)) return safeRel(root, nestedCanonical) ?? null;
        }
      }
    }
  } catch {}
  return null;
}

async function searchSymbols(root: string, query: string, maxMatches: number, maxBytes: number): Promise<{ matches: DependencySymbolMatch[]; truncated: boolean }> {
  const matches: DependencySymbolMatch[] = [];
  let visited = 0;
  let scanned = 0;
  let truncated = false;
  const walk = async (dir: string, evidence: "types" | "source", onlyTypes: boolean): Promise<void> => {
    if (matches.length >= maxMatches || visited >= 512 || scanned >= maxBytes) { truncated = true; return; }
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
    for (const entry of entries) {
      if (matches.length >= maxMatches || visited >= 512 || scanned >= maxBytes) { truncated = true; return; }
      if (entry.name === "node_modules" || entry.isSymbolicLink()) continue;
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(child, evidence, onlyTypes); continue; }
      if (!entry.isFile()) continue;
      const extension = entry.name.endsWith(".d.ts") ? ".d.ts" : path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) continue;
      if (onlyTypes !== (extension === ".d.ts")) continue;
      visited += 1;
      const remaining = Math.min(maxBytes - scanned, 256_000);
       const stat = await fsp.lstat(child).catch(() => null);
       if (!stat || stat.isSymbolicLink() || !stat.isFile()) continue;
       if (stat.size > remaining) { truncated = true; continue; }
       const text = await fsp.readFile(child, "utf8").catch(() => "");
       const textBytes = Buffer.byteLength(text, "utf8");
       scanned += textBytes;
       if (textBytes > remaining) { truncated = true; continue; }
      const lines = text.split(/\r?\n/);
      const relative = safeRel(root, child);
      if (!relative) continue;
      for (let index = 0; index < lines.length && matches.length < maxMatches; index += 1) {
        if (new RegExp(`(?:^|[^A-Za-z0-9_$])${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_$])`).test(lines[index])) {
          matches.push({ path: relative, line: index + 1, excerpt: redactSensitiveText(lines[index]).slice(0, 600), evidence });
        }
      }
    }
  };
  await walk(root, "types", true);
  if (matches.length < maxMatches && scanned < maxBytes) await walk(root, "source", false);
  return { matches, truncated };
}

function exportRoot(exportsValue: unknown): unknown {
  if (!exportsValue || typeof exportsValue !== "object" || Array.isArray(exportsValue)) return exportsValue;
  const record = exportsValue as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, ".")) return record["."];
  if (Object.keys(record).some((key) => key.startsWith("."))) return undefined;
  return record;
}

function exportCandidates(exportsValue: unknown): { runtime: string[]; types: string[] } {
  const root = exportRoot(exportsValue);
  if (typeof root === "string") return { runtime: [root], types: [] };
  if (!root || typeof root !== "object" || Array.isArray(root)) return { runtime: [], types: [] };
  const record = root as Record<string, unknown>;
  const runtime: string[] = [];
  const types: string[] = [];
  for (const key of ["import", "require", "default", "node", "browser"]) if (typeof record[key] === "string") runtime.push(record[key] as string);
  if (typeof record.types === "string") types.push(record.types);
  return { runtime: [...new Set(runtime)], types: [...new Set(types)] };
}

async function unsupportedPnpLayout(workspaceRoot: string): Promise<boolean> {
  for (const name of [".pnp.cjs", ".pnp.js"]) {
    const stat = await fsp.lstat(path.join(workspaceRoot, name)).catch(() => null);
    if (stat?.isFile() && !stat.isSymbolicLink()) return true;
  }
  const yarnConfig = path.join(workspaceRoot, ".yarnrc.yml");
  const stat = await fsp.lstat(yarnConfig).catch(() => null);
  if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size > 128_000) return false;
  const text = await fsp.readFile(yarnConfig, "utf8").catch(() => "");
  return /(^|\r?\n)\s*yarnPath\s*:/i.test(text);
}

function capDependencyResult(result: DependencyInspectionResult, requestedLimit: number | undefined, configuredLimit: number): DependencyInspectionResult {
  const limit = Math.max(1_000, Math.min(requestedLimit ?? configuredLimit, configuredLimit));
  const size = () => Buffer.byteLength(JSON.stringify(result), "utf8");
  while (size() > limit) {
    if (result.readme?.text && result.readme.text.length > 256) {
      result.readme = { ...result.readme, text: result.readme.text.slice(0, Math.max(128, Math.floor(result.readme.text.length / 2))), truncated: true };
      result.truncated = true;
      continue;
    }
    if (result.symbol?.matches && result.symbol.matches.length > 1) {
      result.symbol = { ...result.symbol, matches: result.symbol.matches.slice(0, Math.max(1, Math.floor(result.symbol.matches.length / 2))) };
      result.truncated = true;
      continue;
    }
    if (result.exportKeys.length > 16) {
      result.exportKeys = result.exportKeys.slice(0, Math.max(8, Math.floor(result.exportKeys.length / 2)));
      result.truncated = true;
      continue;
    }
    if (result.warnings.length > 1) {
      result.warnings = result.warnings.slice(0, Math.max(1, Math.floor(result.warnings.length / 2)));
      result.truncated = true;
      continue;
    }
    break;
  }
  return result;
}

export async function inspectDependency(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { packageName: string; packagePath?: string; symbol?: string; includeReadme?: boolean; maxMatches?: number; maxOutputBytes?: number }): Promise<DependencyInspectionResult> {
  const requested = options.packageName.trim();
  if (!PACKAGE_NAME.test(requested)) throw new CodexProError("package_name must be a valid npm package name.");
  const ownerRel = options.packagePath?.trim() || ".";
  const ownerResolved = guard.resolve(workspace, ownerRel);
  const ownerPath = (await fsp.stat(ownerResolved.absPath)).isDirectory() ? path.join(ownerResolved.absPath, "package.json") : ownerResolved.absPath;
  const ownerMeta = await readJson(ownerPath, Math.min(config.maxReadBytes, 512_000));
  if (!ownerMeta || typeof ownerMeta !== "object") throw new CodexProError("Owning workspace package.json could not be read.");
  const ownerName = typeof ownerMeta.name === "string" ? ownerMeta.name : path.basename(path.dirname(ownerPath));
  const ownerDir = path.dirname(ownerPath);
  const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
  const declaredSection = sections.find((section) => ownerMeta[section] && typeof ownerMeta[section][requested] === "string");
  const graph = await buildPackageGraph(config, guard, workspace).catch(() => ({ packages: [], edges: [], truncated: false }));
  const internal = graph.packages.find((pkg) => pkg.ecosystem === "npm" && pkg.name === requested);
  const base: DependencyInspectionResult = {
    packageName: requested,
    kind: internal ? "workspace" : "installed",
    ownerPackage: { name: redactSensitiveText(ownerName).slice(0, 160), path: safeRel(workspace.root, path.dirname(ownerPath)) ?? "." },
    declaredRange: declaredSection ? redactSensitiveText(String(ownerMeta[declaredSection][requested])).slice(0, 240) : null,
    dependencySection: declaredSection ?? null,
    installedVersion: null,
    packageRoot: null,
    resolvedEntrypoint: null,
    typesEntrypoint: null,
    exportKeys: [],
    packageManager: fs.existsSync(path.join(workspace.root, "pnpm-lock.yaml")) ? "pnpm" : fs.existsSync(path.join(workspace.root, "yarn.lock")) ? "yarn" : fs.existsSync(path.join(workspace.root, "package-lock.json")) ? "npm" : null,
    warnings: [],
    truncated: false,
    symbol: options.symbol ? { query: options.symbol.slice(0, 160), status: "not_found", matches: [] } : { query: "", status: "not_requested", matches: [] }
  };
  if (internal) {
    base.ownerPackage = { name: redactSensitiveText(ownerName).slice(0, 160), path: internal.path };
    base.dependencySection = declaredSection ?? null;
    base.declaredRange = declaredSection ? redactSensitiveText(String(ownerMeta[declaredSection][requested])).slice(0, 240) : null;
    base.warnings.push("Workspace package selected; use normal workspace tools for source inspection.");
    return base;
  }
  if (!declaredSection) { base.warnings.push("declared_not_installed: package is not directly declared by the selected workspace package."); return base; }
  const workspaceRoot = await fsp.realpath(workspace.root);
  if (await unsupportedPnpLayout(workspaceRoot)) {
    base.warnings.push("unsupported_pnp_layout: Plug'n'Play resolution is intentionally not inspected by this node_modules-only seam.");
    return base;
  }
  let packageRoot: string | undefined;
  for (let current = ownerDir; ; current = path.dirname(current)) {
    const candidate = path.join(current, "node_modules", ...requested.split("/"));
    const metadataPath = path.join(candidate, "package.json");
    if (fs.existsSync(metadataPath)) {
      try { packageRoot = await fsp.realpath(candidate); } catch {}
      break;
    }
    if (current === workspaceRoot || path.dirname(current) === current) break;
  }
  if (!packageRoot) { base.warnings.push("declared_not_installed: no workspace-local node_modules installation was found."); return base; }
  if (!safeRel(workspaceRoot, packageRoot)) { base.warnings.push("dependency_root_escape: installed package resolves outside the workspace."); return base; }
  const metadata = await readJson(path.join(packageRoot, "package.json"), Math.min(config.maxReadBytes, 512_000));
  if (!metadata || metadata.name !== requested) { base.warnings.push("installed package metadata did not match the requested package name."); return base; }
  const subset = packageJsonSubset(metadata);
  base.metadata = subset;
  base.installedVersion = subset.version;
  base.packageRoot = safeRel(workspaceRoot, packageRoot) ?? null;
  base.exportKeys = exportKeys(metadata.exports);
  const exportCandidatesForPackage = exportCandidates(metadata.exports);
  base.resolvedEntrypoint = await resolveEntry(packageRoot, exportCandidatesForPackage.runtime[0] ?? metadata.module ?? metadata.main);
  base.typesEntrypoint = await resolveEntry(packageRoot, metadata.types ?? metadata.typings ?? exportCandidatesForPackage.types[0]);
  if (exportCandidatesForPackage.runtime.length > 1) base.warnings.push("exports map exposes conditional runtime entrypoints; the first deterministic candidate is reported with alternatives retained only as export keys.");
  if (metadata.exports && !base.resolvedEntrypoint) base.warnings.push("exports map is conditional or does not expose one unambiguous local entrypoint.");
  if (options.includeReadme !== false) {
    for (const name of ["README.md", "README", "readme.md"]) {
      const readmePath = path.join(packageRoot, name);
      const readmeStat = await fsp.lstat(readmePath).catch(() => null);
      if (!readmeStat || !readmeStat.isFile() || readmeStat.isSymbolicLink()) {
        if (readmeStat?.isSymbolicLink()) base.warnings.push("readme_symlink_omitted: README symlinks are not followed.");
        continue;
      }
      const limit = Math.min(16_000, Math.max(1000, options.maxOutputBytes ?? config.maxOutputBytes));
      const text = readmeStat.size > limit
        ? await fsp.open(readmePath, "r").then(async (handle) => {
          try {
            const buffer = Buffer.alloc(limit);
            const { bytesRead } = await handle.read(buffer, 0, limit, 0);
            return buffer.subarray(0, bytesRead).toString("utf8");
          } finally { await handle.close(); }
        }).catch(() => "")
        : await fsp.readFile(readmePath, "utf8").catch(() => "");
      const canonicalReadme = await fsp.realpath(readmePath).catch(() => "");
      if (!canonicalReadme || !safeRel(packageRoot, canonicalReadme)) {
        base.warnings.push("readme_root_escape: README canonical path is outside the dependency root.");
        continue;
      }
      base.readme = { path: safeRel(workspaceRoot, readmePath) ?? name, text: redactSensitiveText(text).slice(0, limit), truncated: readmeStat.size > limit };
      break;
    }
  }
  if (options.symbol?.trim()) {
    const result = await searchSymbols(packageRoot, options.symbol.trim().slice(0, 120), Math.max(1, Math.min(options.maxMatches ?? 16, 32)), Math.min(config.maxReadBytes, 2_000_000));
    base.symbol = { query: options.symbol.trim().slice(0, 160), status: result.matches.length ? "found" : "not_found", matches: result.matches };
    base.truncated ||= result.truncated;
  }
  return capDependencyResult(base, options.maxOutputBytes, config.maxOutputBytes);
}
