import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { CodexProConfig } from "./config.js";
import type { Workspace } from "./guard.js";
import { CodexProError, PathGuard } from "./guard.js";

export interface ExportFileResult {
  uri: string;
  name: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  blob: string;
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".txt":"text/plain", ".md":"text/markdown", ".json":"application/json", ".csv":"text/csv",
    ".pdf":"application/pdf", ".zip":"application/zip", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
    ".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  } as Record<string,string>)[ext] ?? "application/octet-stream";
}

export async function exportWorkspaceFile(config: CodexProConfig, guard: PathGuard, workspace: Workspace, options: { path: string }): Promise<ExportFileResult> {
  if (!config.artifactExportEnabled) throw new CodexProError("Artifact export capability is disabled. Set CODEXPRO_ARTIFACT_EXPORT=1 only for clients that support bounded embedded file resources.");
  const resolved = guard.resolve(workspace, options.path);
  const stat = await fsp.lstat(resolved.absPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CodexProError("Export source must be a regular file.");
  if (stat.size > config.maxExportBytes) throw new CodexProError(`Export exceeds size limit (${config.maxExportBytes} bytes).`);
  const buffer = await fsp.readFile(resolved.absPath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return {
    uri: `codexpro-export://${encodeURIComponent(workspace.id)}/${sha256}`,
    name: path.basename(resolved.relPath),
    mimeType: mimeFor(resolved.relPath),
    bytes: buffer.length,
    sha256,
    blob: buffer.toString("base64")
  };
}
