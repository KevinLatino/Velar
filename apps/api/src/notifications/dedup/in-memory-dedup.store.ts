import type { DedupStore } from '../domain/dedup.interface';

export class InMemoryDedupStore implements DedupStore {
  private readonly keys = new Map<string, number>();
  private readonly clock: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.clock = clock;
  }

  /**
   * Atomically checks+records `key`. Returns true if it was ALREADY seen
   * (duplicate — caller must skip). The check+set runs as a single
   * synchronous block so interleaved async callers for the same key are safe.
   */
  async checkAndSet(key: string, ttlMs?: number): Promise<boolean> {
    const now = this.clock();
    const expiry = this.keys.get(key);
    if (expiry !== undefined && expiry > now) {
      return true; // already seen
    }
    const newExpiry = ttlMs !== undefined ? now + ttlMs : Number.POSITIVE_INFINITY;
    this.keys.set(key, newExpiry);
    return false; // newly recorded
  }

  /** Test helper */
  size(): number {
    return this.keys.size;
  }

  clear(): void {
    this.keys.clear();
  }
}
