import { AsyncLocalStorage } from "node:async_hooks";

const locks = new Map<string, Promise<void>>();
const heldResources = new AsyncLocalStorage<Set<string>>();

function normalizeResource(value: string): string {
  const raw = String(value ?? "").replace(/[\r\n\0]+/g, " ").trim();
  if (!raw || raw.length > 2048) throw new Error("Lock resource must be 1-2048 characters.");
  return process.platform === "win32" ? raw.toLowerCase() : raw;
}

async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let releaseCurrent!: () => void;
  const current = new Promise<void>((resolve) => { releaseCurrent = resolve; });
  locks.set(key, current);
  await previous;
  return () => {
    releaseCurrent();
    if (locks.get(key) === current) locks.delete(key);
  };
}

export async function withResourceLease<T>(resources: string[], task: () => Promise<T> | T): Promise<T> {
  const ordered = [...new Set(resources.map(normalizeResource))].sort((a, b) => a.localeCompare(b));
  if (!ordered.length) return task();
  const inherited = heldResources.getStore() ?? new Set<string>();
  const fresh = ordered.filter((resource) => !inherited.has(resource));
  if (inherited.size && fresh.length) {
    const highestHeld = [...inherited].sort((a, b) => a.localeCompare(b)).at(-1)!;
    if (fresh.some((resource) => resource.localeCompare(highestHeld) < 0)) {
      throw new Error("Nested resource lease would violate deterministic lock ordering.");
    }
  }
  const releases: Array<() => void> = [];
  try {
    for (const resource of fresh) releases.push(await acquire(resource));
    const nextHeld = new Set(inherited);
    for (const resource of ordered) nextHeld.add(resource);
    return await heldResources.run(nextHeld, async () => task());
  } finally {
    for (const release of releases.reverse()) release();
  }
}

export async function withWorkspaceLease<T>(
  workspaceId: string,
  resources: string[],
  task: () => Promise<T> | T
): Promise<T> {
  const workspace = normalizeResource(workspaceId);
  return withResourceLease(resources.map((resource) => `workspace:${workspace}:${normalizeResource(resource)}`), task);
}
