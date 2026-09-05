import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CodexProError } from "../guard.js";
import { hasSecretValue } from "../redact.js";
import { sha256, withFileWriteLocks, writeTextFile } from "../fsOps.js";
import { ResourceBudget } from "./budget.js";
import type { ChangeSetRequest, PreparedChangeSet, OperationReceipt } from "./types.js";

interface InternalChange {
  path: string;
  absPath: string;
  content: string;
  beforeExists: boolean;
  beforeText: string;
  beforeSha?: string;
  afterSha: string;
}

interface InternalChangeSet {
  prepared: PreparedChangeSet;
  request: ChangeSetRequest;
  changes: InternalChange[];
  createdAt: number;
  idempotencyKey?: string;
  operationId?: string;
}

const changeSets = new Map<string, InternalChangeSet>();
const operationToChangeSet = new Map<string, string>();

function pruneChangeSets(maxEntries: number): void {
  const limit = Math.max(8, Math.min(2048, Math.floor(maxEntries)));
  if (changeSets.size <= limit) return;
  const oldest = [...changeSets.entries()].sort((left, right) => left[1].createdAt - right[1].createdAt);
  for (const [id, changeSet] of oldest.slice(0, changeSets.size - limit)) {
    if (changeSet.operationId) operationToChangeSet.delete(changeSet.operationId);
    changeSets.delete(id);
  }
}

function budgetFor(request: ChangeSetRequest): ResourceBudget {
  const config = request.config as typeof request.config & {
    maxOperationBytes?: number;
    maxOperationFiles?: number;
    maxOperationDurationMs?: number;
  };
  return new ResourceBudget({
    maxBytes: config.maxOperationBytes ?? Math.max(config.maxWriteBytes, 20_000_000),
    maxItems: config.maxOperationFiles ?? 128,
    maxDurationMs: config.maxOperationDurationMs ?? config.maxBashTimeoutMs
  });
}
async function readBefore(request: ChangeSetRequest, filePath: string): Promise<{
  absPath: string;
  relPath: string;
  exists: boolean;
  text: string;
  sha?: string;
}> {
  const resolved = request.guard.resolve(request.workspace, filePath, { forWrite: true });
  try {
    await request.guard.assertTextFile(resolved.absPath, Math.max(request.config.maxReadBytes, request.config.maxWriteBytes));
    const text = await fsp.readFile(resolved.absPath, "utf8");
    return { absPath: resolved.absPath, relPath: resolved.relPath, exists: true, text, sha: sha256(text) };
  } catch (error) {
    if (fs.existsSync(resolved.absPath)) throw error;
    return { absPath: resolved.absPath, relPath: resolved.relPath, exists: false, text: "" };
  }
}

async function currentState(change: InternalChange): Promise<{ exists: boolean; text: string; sha?: string }> {
  try {
    const text = await fsp.readFile(change.absPath, "utf8");
    return { exists: true, text, sha: sha256(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, text: "" };
    throw error;
  }
}

function assertMatchesBefore(change: InternalChange, current: { exists: boolean; sha?: string }): void {
  if (change.beforeExists !== current.exists) throw new CodexProError(`Change set is stale: ${change.path} existence changed after prepare.`);
  if (change.beforeExists && current.sha !== change.beforeSha) {
    throw new CodexProError(`Change set is stale: ${change.path} changed after prepare.`);
  }
}

function assertMatchesAfter(change: InternalChange, current: { exists: boolean; sha?: string }): void {
  if (!current.exists || current.sha !== change.afterSha) {
    throw new CodexProError(`Revert refused: ${change.path} changed after the operation completed.`);
  }
}
async function restoreRaw(change: InternalChange): Promise<void> {
  if (!change.beforeExists) {
    await fsp.rm(change.absPath, { force: true });
    return;
  }
  const handle = await fsp.open(change.absPath, "r+");
  try {
    const currentText = await handle.readFile("utf8");
    if (sha256(currentText) !== change.afterSha) {
      throw new CodexProError(`Rollback refused: ${change.path} no longer matches the applied hash.`);
    }
    const buffer = Buffer.from(change.beforeText, "utf8");
    await handle.truncate(0);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesWritten } = await handle.write(buffer, offset, buffer.length - offset, offset);
      if (!bytesWritten) throw new CodexProError(`Rollback made no progress: ${change.path}.`);
      offset += bytesWritten;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function prepareChangeSet(request: ChangeSetRequest): Promise<PreparedChangeSet> {
  if (request.config.writeMode !== "workspace") throw new CodexProError("Transactional change sets require write mode=workspace.");
  if (!Array.isArray(request.changes) || request.changes.length === 0) throw new CodexProError("changes must contain at least one file.");
  const budget = budgetFor(request);
  const seen = new Set<string>();
  const changes: InternalChange[] = [];
  let totalBytes = 0;

  for (const requested of request.changes) {
    budget.consumeItems(1);
    const bytes = Buffer.byteLength(requested.content, "utf8");
    budget.consumeBytes(bytes);
    if (bytes > request.config.maxWriteBytes) throw new CodexProError(`Change content for ${requested.path} exceeds maxWriteBytes.`);
    if (hasSecretValue(requested.content)) throw new CodexProError(`Secret-looking content is blocked from change set path ${requested.path}.`);
    const before = await readBefore(request, requested.path);
    if (seen.has(before.relPath)) throw new CodexProError(`Duplicate change set path: ${before.relPath}`);
    seen.add(before.relPath);
    if (before.exists && !requested.expectedSha256) throw new CodexProError(`expected_sha256 is required for existing file: ${before.relPath}`);
    if (requested.expectedSha256 && (!before.exists || requested.expectedSha256.toLowerCase() !== before.sha?.toLowerCase())) {
      throw new CodexProError(`Change set precondition is stale for ${before.relPath}.`);
    }
    totalBytes += bytes;
    changes.push({
      path: before.relPath,
      absPath: before.absPath,
      content: requested.content,
      beforeExists: before.exists,
      beforeText: before.text,
      beforeSha: before.sha,
      afterSha: sha256(requested.content)
    });
  }
  const prepared: PreparedChangeSet = {
    id: `cs_${randomUUID()}`,
    workspaceId: request.workspace.id,
    paths: changes.map((change) => change.path),
    totalBytes,
    state: "prepared"
  };
  changeSets.set(prepared.id, {
    prepared,
    request,
    changes,
    createdAt: Date.now(),
    idempotencyKey: request.idempotencyKey
  });
  pruneChangeSets(request.config.maxOperationReceipts);
  return { ...prepared, paths: [...prepared.paths] };
}

export async function applyChangeSet(id: string): Promise<OperationReceipt> {
  const changeSet = changeSets.get(id);
  if (!changeSet) throw new CodexProError(`Unknown or expired change set id: ${id}`);
  if (changeSet.operationId) {
    const existing = await changeSet.request.operationManager.status(changeSet.operationId);
    if (existing) return { ...existing, reused: true };
  }

  const started = await changeSet.request.operationManager.start({
    kind: "change_set",
    idempotencyKey: changeSet.idempotencyKey ?? `changeset:${id}`
  });
  changeSet.operationId = started.id;
  if (started.reused) {
    operationToChangeSet.set(started.id, id);
    changeSet.prepared = { ...changeSet.prepared, state: started.state === "completed" ? "applied" : changeSet.prepared.state, operationId: started.id };
    return started;
  }

  const budget = budgetFor(changeSet.request);
  const applied: InternalChange[] = [];
  try {
    await withFileWriteLocks(changeSet.changes.map((change) => change.absPath), async () => {
      for (const change of changeSet.changes) {
        budget.consumeItems(1);
        budget.consumeBytes(Buffer.byteLength(change.content, "utf8"));
        assertMatchesBefore(change, await currentState(change));
      }
      for (const change of changeSet.changes) {
        budget.checkTime();
        await writeTextFile(
          changeSet.request.config,
          changeSet.request.guard,
          changeSet.request.workspace,
          change.path,
          change.content,
          {
            createDirs: true,
            overwrite: true,
            expectedSha256: change.beforeExists ? change.beforeSha : undefined
          }
        );
        applied.push(change);
      }
    });
    const beforeHashes: Record<string, string> = {};
    const afterHashes: Record<string, string> = {};
    for (const change of changeSet.changes) {
      if (change.beforeSha) beforeHashes[change.path] = change.beforeSha;
      afterHashes[change.path] = change.afterSha;
    }
    const receipt = await changeSet.request.operationManager.complete(started.id, {
      paths: changeSet.changes.map((change) => change.path),
      bytes: changeSet.prepared.totalBytes,
      items: changeSet.changes.length,
      beforeHashes,
      afterHashes
    });
    changeSet.prepared = { ...changeSet.prepared, state: "applied", operationId: receipt.id };
    operationToChangeSet.set(receipt.id, id);
    return receipt;
  } catch (error) {
    let rollbackError: unknown;
    try {
      await withFileWriteLocks(applied.map((change) => change.absPath), async () => {
        for (const change of [...applied].reverse()) {
          const current = await currentState(change);
          assertMatchesAfter(change, current);
          await restoreRaw(change);
        }
      });
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure;
    }
    changeSet.prepared = { ...changeSet.prepared, state: "failed", operationId: started.id };
    const finalError = rollbackError
      ? new CodexProError(`Change set apply failed and rollback could not be completed safely: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
      : error;
    try { await changeSet.request.operationManager.fail(started.id, finalError); } catch {}
    throw finalError;
  }
}

export async function revertOperation(operationId: string): Promise<OperationReceipt> {
  const changeSetId = operationToChangeSet.get(operationId);
  if (!changeSetId) {
    throw new CodexProError(`Revert data is unavailable for operation ${operationId}. Change-set preimages are intentionally memory-only.`);
  }
  const changeSet = changeSets.get(changeSetId);
  if (!changeSet || changeSet.prepared.state !== "applied") {
    throw new CodexProError(`Operation ${operationId} is not an applied change set that can be reverted.`);
  }
  const manager = changeSet.request.operationManager;
  const started = await manager.start({ kind: "revert", idempotencyKey: `revert:${operationId}` });
  if (started.reused) return started;
  try {
    await withFileWriteLocks(changeSet.changes.map((change) => change.absPath), async () => {
      for (const change of changeSet.changes) assertMatchesAfter(change, await currentState(change));
      for (const change of [...changeSet.changes].reverse()) await restoreRaw(change);
    });
    const receipt = await manager.complete(started.id, {
      paths: changeSet.changes.map((change) => change.path),
      items: changeSet.changes.length,
      beforeHashes: Object.fromEntries(changeSet.changes.map((change) => [change.path, change.afterSha])),
      afterHashes: Object.fromEntries(changeSet.changes.filter((change) => change.beforeSha).map((change) => [change.path, change.beforeSha!]))
    });
    changeSet.prepared = { ...changeSet.prepared, state: "reverted" };
    return receipt;
  } catch (error) {
    try { await manager.fail(started.id, error); } catch {}
    throw error;
  }
}
export function getPreparedChangeSet(id: string): PreparedChangeSet | null {
  const changeSet = changeSets.get(id);
  return changeSet ? { ...changeSet.prepared, paths: [...changeSet.prepared.paths] } : null;
}

export function workspaceForRevertOperation(operationId: string): string | undefined {
  const changeSetId = operationToChangeSet.get(operationId);
  return changeSetId ? changeSets.get(changeSetId)?.prepared.workspaceId : undefined;
}
