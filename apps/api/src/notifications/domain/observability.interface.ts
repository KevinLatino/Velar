export interface MetricsRecorder {
  incrementEmitted(eventType: string): void;
  incrementDelivered(channel: string): void;
  incrementDeduped(channel: string): void;
  incrementFailed(channel: string): void;
  incrementRateLimited(channel: string): void;
  recordDeliveryLatencyMs(channel: string, ms: number): void;
  setDlqDepth(depth: number): void;
}
