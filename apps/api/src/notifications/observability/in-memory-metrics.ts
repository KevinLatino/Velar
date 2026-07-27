import type { MetricsRecorder } from '../domain/observability.interface';

export class InMemoryMetricsRecorder implements MetricsRecorder {
  private readonly emitted = new Map<string, number>();
  private readonly delivered = new Map<string, number>();
  private readonly deduped = new Map<string, number>();
  private readonly failed = new Map<string, number>();
  private readonly latencyMs = new Map<string, number[]>();
  private _dlqDepth = 0;

  incrementEmitted(eventType: string): void {
    this.emitted.set(eventType, (this.emitted.get(eventType) ?? 0) + 1);
  }

  incrementDelivered(channel: string): void {
    this.delivered.set(channel, (this.delivered.get(channel) ?? 0) + 1);
  }

  incrementDeduped(channel: string): void {
    this.deduped.set(channel, (this.deduped.get(channel) ?? 0) + 1);
  }

  incrementFailed(channel: string): void {
    this.failed.set(channel, (this.failed.get(channel) ?? 0) + 1);
  }

  recordDeliveryLatencyMs(channel: string, ms: number): void {
    const arr = this.latencyMs.get(channel) ?? [];
    arr.push(ms);
    this.latencyMs.set(channel, arr);
  }

  setDlqDepth(depth: number): void {
    this._dlqDepth = depth;
  }

  emittedCount(eventType: string): number {
    return this.emitted.get(eventType) ?? 0;
  }

  deliveredCount(channel: string): number {
    return this.delivered.get(channel) ?? 0;
  }

  dedupedCount(channel: string): number {
    return this.deduped.get(channel) ?? 0;
  }

  failedCount(channel: string): number {
    return this.failed.get(channel) ?? 0;
  }

  latencies(channel: string): number[] {
    return [...(this.latencyMs.get(channel) ?? [])];
  }

  get dlqDepth(): number {
    return this._dlqDepth;
  }
}
