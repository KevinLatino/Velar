/**
 * Full-jitter exponential backoff: delay = rng() * min(capMs, baseMs * factor^attempt).
 * Pure and independently testable via injectable rng.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  factor: number,
  capMs: number,
  rng: () => number = Math.random,
): number {
  const exp = baseMs * Math.pow(factor, attempt);
  return rng() * Math.min(capMs, exp);
}

export interface WithRetryOptions {
  maxRetries: number;
  baseMs: number;
  factor: number;
  capMs: number;
  isRetryable: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries `fn` up to `maxRetries` times (after the initial attempt), sleeping
 * with full-jitter backoff between attempts. Rethrows the last error once
 * exhausted or once `isRetryable` returns false.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions,
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  const rng = opts.rng ?? Math.random;
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retriesLeft = attempt < opts.maxRetries;
      if (!retriesLeft || !opts.isRetryable(err)) {
        throw err;
      }
      const delay = computeBackoffMs(
        attempt,
        opts.baseMs,
        opts.factor,
        opts.capMs,
        rng,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
