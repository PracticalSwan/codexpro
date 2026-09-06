import { ActivityStore } from "./store.js";
import type { ActivityInput, ActivityPage, ActivityQuery, ActivityRecord } from "./types.js";

export class ActivityRegistry {
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(readonly store: ActivityStore) {}

  append(input: ActivityInput): Promise<ActivityRecord> {
    const previous = this.tails.get(input.workspaceId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      const sequence = (await this.store.lastSequence(input.workspaceId)) + 1;
      return this.store.append({ ...input, sequence, timestamp: new Date().toISOString() });
    });
    this.tails.set(input.workspaceId, next);
    return next.finally(() => {
      if (this.tails.get(input.workspaceId) === next) this.tails.delete(input.workspaceId);
    });
  }

  async appendBestEffort(input: ActivityInput): Promise<void> {
    try { await this.append(input); } catch { /* observability must never change operation outcome */ }
  }

  async read(query: ActivityQuery): Promise<ActivityPage> {
    try { await this.tails.get(query.workspaceId); } catch {}
    return this.store.read(query);
  }
}
