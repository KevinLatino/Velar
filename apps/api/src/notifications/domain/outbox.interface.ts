import type { DomainEvent } from '@velar/types';

export interface OutboxRecord extends DomainEvent {
  processedAt: string | null;
  attempts: number;
}

export interface OutboxStore {
  append(event: Omit<DomainEvent, 'id'>): Promise<OutboxRecord>;
  fetchUnprocessed(limit: number): Promise<OutboxRecord[]>;
  markProcessed(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}
