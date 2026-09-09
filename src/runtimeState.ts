import type { WorkspaceProcessManager } from "./processOps.js";
import type { WorkspaceEventTracker } from "./workspaceEvents.js";
import { ContextCache } from "./contextCache.js";

export class CodexProRuntimeState {
  private readonly processManagers = new Map<string, WorkspaceProcessManager>();
  private readonly eventTrackers = new Map<string, WorkspaceEventTracker>();
  private readonly contextCaches = new Map<string, ContextCache<any>>();
  private closing = false;

  processManagerFor(workspaceId: string, create: () => WorkspaceProcessManager): WorkspaceProcessManager {
    if (this.closing) throw new Error("CodexPro runtime state is closing.");
    const existing = this.processManagers.get(workspaceId);
    if (existing) return existing;
    const manager = create();
    this.processManagers.set(workspaceId, manager);
    return manager;
  }

  eventTrackerFor(workspaceId: string, create: () => WorkspaceEventTracker): WorkspaceEventTracker {
    if (this.closing) throw new Error("CodexPro runtime state is closing.");
    const existing = this.eventTrackers.get(workspaceId);
    if (existing) return existing;
    const tracker = create();
    this.eventTrackers.set(workspaceId, tracker);
    return tracker;
  }


  contextCacheFor<T = unknown>(workspaceId: string): ContextCache<T> {
    if (this.closing) throw new Error("CodexPro runtime state is closing.");
    const existing = this.contextCaches.get(workspaceId);
    if (existing) return existing as ContextCache<T>;
    const cache = new ContextCache<T>(32);
    this.contextCaches.set(workspaceId, cache as ContextCache<any>);
    return cache;
  }

  invalidateContext(workspaceId: string): void {
    this.contextCaches.get(workspaceId)?.clear();
  }

  processRecords(workspaceId: string) {
    return this.processManagers.get(workspaceId)?.list() ?? [];
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await Promise.allSettled([...this.processManagers.values()].map((manager) => manager.close()));
    this.processManagers.clear();
    this.eventTrackers.clear();
    this.contextCaches.clear();
  }
}
