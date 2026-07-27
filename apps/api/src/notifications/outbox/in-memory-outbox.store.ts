import type { DomainEvent } from '@velar/types';
import type { OutboxRecord, OutboxStore } from '../domain/outbox.interface';

export type SeedOutboxEvent = Partial<OutboxRecord> &
  Omit<DomainEvent, 'id'> & { id?: string };

export class InMemoryOutboxStore implements OutboxStore {
  private records: OutboxRecord[] = [];
  private nextId = 1;
  private readonly lastErrors = new Map<string, string>();

  constructor(seed: SeedOutboxEvent[] = []) {
    for (const event of seed) {
      this.seedOne(event);
    }
  }

  /** Push events with explicit ids/dedupKeys for deterministic tests. */
  seed(events: SeedOutboxEvent[]): void {
    for (const event of events) {
      this.seedOne(event);
    }
  }

  private seedOne(event: SeedOutboxEvent): void {
    const id = event.id ?? `outbox-${this.nextId++}`;
    const numeric = Number(String(id).replace(/\D/g, ''));
    if (!Number.isNaN(numeric) && numeric >= this.nextId) {
      this.nextId = numeric + 1;
    }
    this.records.push({
      id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
      dedupKey: event.dedupKey,
      processedAt: event.processedAt ?? null,
      attempts: event.attempts ?? 0,
    });
  }

  async append(event: Omit<DomainEvent, 'id'>): Promise<OutboxRecord> {
    const record: OutboxRecord = {
      ...event,
      id: `outbox-${this.nextId++}`,
      processedAt: null,
      attempts: 0,
    };
    this.records.push(record);
    return record;
  }

  async fetchUnprocessed(limit: number): Promise<OutboxRecord[]> {
    return this.records.filter((r) => r.processedAt === null).slice(0, limit);
  }

  async markProcessed(id: string): Promise<void> {
    const record = this.records.find((r) => r.id === id);
    if (record) {
      record.processedAt = new Date().toISOString();
    }
  }

  async markFailed(id: string, error: string): Promise<void> {
    const record = this.records.find((r) => r.id === id);
    if (record) {
      record.attempts += 1;
      this.lastErrors.set(id, error);
    }
  }

  /** Test helper: clear processedAt so an event can be re-drained. */
  unmarkProcessed(id: string): void {
    const record = this.records.find((r) => r.id === id);
    if (record) {
      record.processedAt = null;
    }
  }

  getLastError(id: string): string | undefined {
    return this.lastErrors.get(id);
  }

  getAll(): readonly OutboxRecord[] {
    return this.records;
  }
}
