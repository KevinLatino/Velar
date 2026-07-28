import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@velar/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import type { OutboxRecord, OutboxStore } from '../domain/outbox.interface';

type OutboxRow = {
  id: string;
  aggregate_type: DomainEvent['aggregateType'];
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  dedup_key: string;
  processed_at: string | null;
  attempts: number;
};

function mapRow(row: OutboxRow): OutboxRecord {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    dedupKey: row.dedup_key,
    processedAt: row.processed_at,
    attempts: row.attempts ?? 0,
  };
}

@Injectable()
export class PostgresOutboxStore implements OutboxStore {
  constructor(private readonly supabase: SupabaseService) {}

  async append(event: Omit<DomainEvent, 'id'>): Promise<OutboxRecord> {
    const { data, error } = await this.supabase.admin
      .from('outbox_events')
      .insert({
        aggregate_type: event.aggregateType,
        aggregate_id: event.aggregateId,
        event_type: event.eventType,
        payload: event.payload,
        dedup_key: event.dedupKey,
        occurred_at: event.occurredAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(
        `PostgresOutboxStore.append failed: ${error?.message ?? 'no data'}`,
      );
    }
    return mapRow(data as OutboxRow);
  }

  async fetchUnprocessed(limit: number): Promise<OutboxRecord[]> {
    const { data, error } = await this.supabase.admin
      .from('outbox_events')
      .select('*')
      .is('processed_at', null)
      .order('occurred_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw new Error(
        `PostgresOutboxStore.fetchUnprocessed failed: ${error.message}`,
      );
    }
    return ((data ?? []) as OutboxRow[]).map(mapRow);
  }

  async markProcessed(id: string): Promise<void> {
    const { error } = await this.supabase.admin
      .from('outbox_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(
        `PostgresOutboxStore.markProcessed failed: ${error.message}`,
      );
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    // Read-modify-write for attempts: PostgREST has no atomic increment
    // without an RPC. Race is acceptable — dispatcher is single-consumer
    // per event id in practice.
    const { data, error: readErr } = await this.supabase.admin
      .from('outbox_events')
      .select('attempts')
      .eq('id', id)
      .maybeSingle();

    if (readErr) {
      throw new Error(
        `PostgresOutboxStore.markFailed read failed: ${readErr.message}`,
      );
    }

    const attempts = ((data as { attempts?: number } | null)?.attempts ?? 0) + 1;
    const { error } = await this.supabase.admin
      .from('outbox_events')
      .update({ attempts, last_error: errorMessage })
      .eq('id', id);

    if (error) {
      throw new Error(
        `PostgresOutboxStore.markFailed failed: ${error.message}`,
      );
    }
  }
}
