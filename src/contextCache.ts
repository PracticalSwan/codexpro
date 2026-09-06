export interface ContextCacheEntry<T> {
  fingerprint: string;
  value: T;
}

export class ContextCache<T = unknown> {
  private readonly entries = new Map<string, ContextCacheEntry<T>>();
  readonly maxEntries: number;

  constructor(maxEntries = 32) {
    this.maxEntries = Math.max(1, Math.min(128, Math.floor(maxEntries)));
  }

  get(key: string, fingerprint: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || entry.fingerprint !== fingerprint) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, fingerprint: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { fingerprint, value });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
