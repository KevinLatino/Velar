export interface DedupStore {
  /** Atomically checks+records `key`. Returns true if it was ALREADY seen before this call (duplicate — caller must skip). */
  checkAndSet(key: string, ttlMs?: number): Promise<boolean>;
}
