import { Injectable } from '@nestjs/common';
import type {
  NotificationCategory,
  NotificationChannelKind,
  RenderedNotification,
} from '@velar/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import type { DigestQueue } from '../outbox/dispatcher';
import type {
  DigestQueueReader,
  QueuedDigestItem,
} from './digest-queue-reader';

@Injectable()
export class PostgresDigestQueue implements DigestQueue {
  constructor(private readonly supabase: SupabaseService) {}

  async enqueue(
    recipientId: string,
    category: NotificationCategory,
    windowKey: string,
    notification: RenderedNotification,
    windowEndsAt: string,
  ): Promise<void> {
    const { error } = await this.supabase.admin
      .from('notification_digest_queue')
      .insert({
        recipient_id: recipientId,
        category,
        window_key: windowKey,
        window_ends_at: windowEndsAt,
        rendered_subject: notification.subject,
        rendered_body: notification.body,
        channel: notification.channel,
      });

    if (error) {
      throw new Error(`PostgresDigestQueue.enqueue failed: ${error.message}`);
    }
  }
}

@Injectable()
export class PostgresDigestQueueReader implements DigestQueueReader {
  constructor(private readonly supabase: SupabaseService) {}

  async fetchDue(now: Date): Promise<QueuedDigestItem[]> {
    const { data, error } = await this.supabase.admin
      .from('notification_digest_queue')
      .select(
        'id, recipient_id, category, window_key, window_ends_at, rendered_subject, rendered_body, channel, compiled_at',
      )
      .is('compiled_at', null)
      .lte('window_ends_at', now.toISOString());

    if (error) {
      throw new Error(
        `PostgresDigestQueueReader.fetchDue failed: ${error.message}`,
      );
    }

    return ((data ?? []) as Array<{
      id: string;
      recipient_id: string;
      category: string;
      window_key: string;
      window_ends_at: string;
      rendered_subject: string;
      rendered_body: string;
      channel: string;
      compiled_at: string | null;
    }>).map((row) => ({
      id: row.id,
      recipientId: row.recipient_id,
      category: row.category as NotificationCategory,
      windowKey: row.window_key,
      windowEndsAt: row.window_ends_at,
      renderedSubject: row.rendered_subject,
      renderedBody: row.rendered_body,
      channel: row.channel as NotificationChannelKind,
      compiledAt: row.compiled_at,
    }));
  }

  async markCompiled(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await this.supabase.admin
      .from('notification_digest_queue')
      .update({ compiled_at: new Date().toISOString() })
      .in('id', ids);

    if (error) {
      throw new Error(
        `PostgresDigestQueueReader.markCompiled failed: ${error.message}`,
      );
    }
  }
}
