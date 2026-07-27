export interface DeadLetterEntry {
  outboxEventId: string;
  recipientId: string;
  channel: string;
  payload: unknown;
  failureReason: string;
  failedAt: string;
}

export interface DeadLetterSink {
  record(entry: DeadLetterEntry): Promise<void>;
}

export class InMemoryDeadLetterSink implements DeadLetterSink {
  readonly entries: DeadLetterEntry[] = [];

  async record(entry: DeadLetterEntry): Promise<void> {
    this.entries.push(entry);
  }
}
