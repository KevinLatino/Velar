export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
  clock?: () => number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly clock: () => number;

  constructor(opts: CircuitBreakerOptions) {
    this.failureThreshold = opts.failureThreshold;
    this.cooldownMs = opts.cooldownMs;
    this.clock = opts.clock ?? (() => Date.now());
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  canAttempt(): boolean {
    if (this.state === 'closed' || this.state === 'half_open') {
      return true;
    }
    // open — transition to half_open after cooldown
    if (this.clock() - this.openedAt >= this.cooldownMs) {
      this.state = 'half_open';
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failures += 1;
    if (
      this.state === 'half_open' ||
      this.failures >= this.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = this.clock();
    }
  }
}
