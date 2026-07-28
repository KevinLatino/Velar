export interface RateLimiter {
  tryAcquire(key: string): boolean;
}
