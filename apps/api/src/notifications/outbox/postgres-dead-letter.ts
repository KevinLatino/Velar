import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import type { DeadLetterEntry, DeadLetterSink } from './dead-letter';

@Injectable()
export class PostgresDeadLetterSink implements DeadLetterSink {
  constructor(private readonly supabase: SupabaseService) {}

  async record(entry: DeadLetterEntry): Promise<void> {
    const { error } = await this.supabase.admin.from('notification_dlq').insert({
      outbox_event_id: entry.outboxEventId,
      recipient_id: entry.recipientId,
      channel: entry.channel,
      payload: entry.payload ?? {},
      failure_reason: entry.failureReason,
      failed_at: entry.failedAt,
    });

    if (error) {
      throw new Error(
        `PostgresDeadLetterSink.record failed: ${error.message}`,
      );
    }
  }
}
