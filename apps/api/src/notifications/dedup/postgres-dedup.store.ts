import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import type { DedupStore } from '../domain/dedup.interface';

/**
 * Postgres-backed DedupStore.
 *
 * Coupling note: `DedupStore.checkAndSet(key, ttlMs?)` does not receive
 * `recipient_id` / `channel`, but `notification_dedup` requires both
 * (NOT NULL). Production keys from `render-notification.ts` follow
 * `${dedupKey}:${recipientId}:${channel}`. We parse those two fields
 * from the right of the key (channel has no colons; recipientId is a
 * UUID with no colons). If the key does not match that shape, we store
 * placeholder `'unknown'` / nil UUID so the insert still succeeds.
 * This is pragmatic — keeps the well-tested DedupStore interface
 * untouched — not a clean abstraction.
 */
const UNKNOWN_RECIPIENT = '00000000-0000-0000-0000-000000000000';

function parseKeyFields(key: string): {
  recipientId: string;
  channel: string;
} {
  const lastColon = key.lastIndexOf(':');
  if (lastColon <= 0) {
    return { recipientId: UNKNOWN_RECIPIENT, channel: 'unknown' };
  }
  const channel = key.slice(lastColon + 1);
  const beforeChannel = key.slice(0, lastColon);
  const secondLastColon = beforeChannel.lastIndexOf(':');
  if (secondLastColon < 0) {
    return { recipientId: UNKNOWN_RECIPIENT, channel: channel || 'unknown' };
  }
  const recipientId = beforeChannel.slice(secondLastColon + 1);
  // UUID v4-ish shape check (hyphenated, no colons).
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      recipientId,
    );
  if (!uuidLike || !channel) {
    return { recipientId: UNKNOWN_RECIPIENT, channel: channel || 'unknown' };
  }
  return { recipientId, channel };
}

@Injectable()
export class PostgresDedupStore implements DedupStore {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Atomic check-and-set via INSERT; unique-constraint violation (23505)
   * means the key already existed → return true (duplicate). Successful
   * insert → return false (newly recorded). Prefer insert+catch over
   * upsert(ignoreDuplicates) because PostgREST upsert responses do not
   * reliably distinguish insert-vs-noop without a follow-up read.
   */
  async checkAndSet(key: string, ttlMs?: number): Promise<boolean> {
    const { recipientId, channel } = parseKeyFields(key);
    const expiresAt =
      ttlMs !== undefined
        ? new Date(Date.now() + ttlMs).toISOString()
        : null;

    const { error } = await this.supabase.admin
      .from('notification_dedup')
      .insert({
        idempotency_key: key,
        recipient_id: recipientId,
        channel,
        expires_at: expiresAt,
      });

    if (!error) {
      return false; // newly recorded
    }

    // Postgres unique_violation / PostgREST duplicate.
    if (
      error.code === '23505' ||
      /duplicate|unique/i.test(error.message ?? '')
    ) {
      return true; // already seen
    }

    throw new Error(
      `PostgresDedupStore.checkAndSet failed: ${error.message}`,
    );
  }
}
