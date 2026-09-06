import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { CodexProConfig } from "../config.js";
import { CodexProError, type PathGuard, type Workspace } from "../guard.js";
import { withFileWriteLocks } from "../fsOps.js";
import type { OperationManager } from "../operations/manager.js";
import type { OperationReceipt } from "../operations/types.js";
import { CheckpointStore } from "./store.js";
import type { FileCheckpoint, FileCheckpointEntry } from "./types.js";

function hash(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }
async function readMaybe(file: string): Promise<Buffer | null> {
  try { return await fsp.readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export interface CheckpointContext {
  config: CodexProConfig;
  guard: PathGuard;
  workspace: Workspace;
  store: CheckpointStore;
}

export async function createMutationCheckpoint(input: CheckpointContext & { paths: string[]; operationId?: string }): Promise<FileCheckpoint> {
  const paths = [...new Set(input.paths)].slice(0, input.config.maxOperationFiles);
  if (!paths.length) throw new CodexProError("Checkpoint requires at least one touched path.");
  const entries: FileCheckpointEntry[] = [];
  let totalBytes = 0;
  for (const filePath of paths) {
    const resolved = input.guard.resolve(input.workspace, filePath, { forWrite: true });
    const bytes = await readMaybe(resolved.absPath);
    totalBytes += bytes?.length ?? 0;
    if (totalBytes > input.config.maxOperationBytes) throw new CodexProError("Checkpoint preimages exceed maxOperationBytes.");
    if (bytes) {
      const sha = hash(bytes);
      await input.store.putBlob(sha, bytes);
      entries.push({ path: resolved.relPath, beforeSha256: sha, afterSha256: null, beforeBlobSha256: sha });
    } else {
      entries.push({ path: resolved.relPath, beforeSha256: null, afterSha256: null, beforeBlobSha256: null });
    }
  }
  const checkpoint: FileCheckpoint = {
    schemaVersion: 1,
    id: `chk_${randomUUID()}`,
    workspaceId: input.workspace.id,
    createdAt: new Date().toISOString(),
    ...(input.operationId ? { operationId: input.operationId } : {}),
    state: "captured",
    entries
  };
  return input.store.save(checkpoint);
}

export async function finalizeMutationCheckpoint(input: CheckpointContext & { checkpointId: string }): Promise<FileCheckpoint> {
  const checkpoint = await input.store.get(input.workspace.id, input.checkpointId);
  if (!checkpoint) throw new CodexProError(`Unknown checkpoint id: ${input.checkpointId}`);
  if (checkpoint.state !== "captured") return checkpoint;
  // A deletion patch may remove an otherwise-empty selected workspace directory.
  // Preserve the already-authorized workspace root so finalization and a later restore remain addressable.
  await fsp.mkdir(input.workspace.root, { recursive: true });
  const entries: FileCheckpointEntry[] = [];
  for (const entry of checkpoint.entries) {
    const resolved = input.guard.resolve(input.workspace, entry.path, { forWrite: true });
    const bytes = await readMaybe(resolved.absPath);
    entries.push({ ...entry, afterSha256: bytes ? hash(bytes) : null });
  }
  return input.store.save({ ...checkpoint, state: "finalized", entries });
}

export async function discardMutationCheckpoint(input: CheckpointContext & { checkpointId: string }): Promise<void> {
  // Captured records are intentionally harmless and bounded. Failed mutations leave no finalized rollback point.
  const checkpoint = await input.store.get(input.workspace.id, input.checkpointId);
  if (checkpoint?.state === "captured") return;
}

export async function restoreCheckpoint(input: CheckpointContext & { operationManager: OperationManager; checkpointId: string }): Promise<OperationReceipt> {
  const checkpoint = await input.store.get(input.workspace.id, input.checkpointId);
  if (!checkpoint) throw new CodexProError(`Unknown checkpoint id: ${input.checkpointId}`);
  if (checkpoint.workspaceId !== input.workspace.id) throw new CodexProError("Checkpoint belongs to a different workspace.");
  if (checkpoint.state !== "finalized") throw new CodexProError(`Checkpoint ${checkpoint.id} is not restorable in state ${checkpoint.state}.`);
  const resolved = checkpoint.entries.map((entry) => ({ entry, file: input.guard.resolve(input.workspace, entry.path, { forWrite: true }) }));
  return (await input.operationManager.execute(
    { kind: "restore_checkpoint" },
    () => withFileWriteLocks(resolved.map((item) => item.file.absPath), async () => {
      // Validate every current postimage before changing any file.
      for (const { entry, file } of resolved) {
        const current = await readMaybe(file.absPath);
        const currentSha = current ? hash(current) : null;
        if (currentSha !== entry.afterSha256) {
          throw new CodexProError(`Restore refused: ${entry.path} changed after the checkpointed mutation.`);
        }
      }
      for (const { entry, file } of resolved) {
        if (entry.beforeBlobSha256 === null) {
          await fsp.rm(file.absPath, { force: true });
        } else {
          const before = await input.store.readBlob(entry.beforeBlobSha256);
          if (hash(before) !== entry.beforeSha256) throw new CodexProError(`Checkpoint blob integrity failed for ${entry.path}.`);
          await fsp.mkdir(path.dirname(file.absPath), { recursive: true });
          try {
            const handle = await fsp.open(file.absPath, "r+");
            try { await handle.truncate(0); await handle.writeFile(before); await handle.sync(); } finally { await handle.close(); }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            await fsp.writeFile(file.absPath, before, { mode: 0o600 });
          }
        }
      }
      await input.store.save({ ...checkpoint, state: "restored" });
      return checkpoint;
    }),
    (value) => ({ paths: value.entries.map((entry) => entry.path), items: value.entries.length, note: `restored ${checkpoint.id}` })
  )).receipt;
}
