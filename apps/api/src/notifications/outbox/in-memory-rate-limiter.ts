import type { RateLimiter } from '../domain/rate-limiter.interface';

/**
 * Coarse fixed-window abuse guard. Not as rigorous as delivery retry /
 * circuit-breaker machinery — just caps acquisitions per key per window.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly counters = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private readonly maxPerWindow: number;
  private readonly windowMs: number;
  private readonly clock: () => number;

  constructor(opts: {
    maxPerWindow: number;
    windowMs: number;
    clock?: () => number;
  }) {
    this.maxPerWindow = opts.maxPerWindow;
    this.windowMs = opts.windowMs;
    this.clock = opts.clock ?? (() => Date.now());
  }

  tryAcquire(key: string): boolean {
    const now = this.clock();
    const entry = this.counters.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.maxPerWindow) {
      return false;
    }
    entry.count += 1;
    return true;
  }
}
