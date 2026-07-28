import type { RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';

export interface InAppWriter {
  insert(rendered: RenderedNotification): Promise<void>;
}

export class InMemoryInAppWriter implements InAppWriter {
  readonly inserted: RenderedNotification[] = [];

  async insert(rendered: RenderedNotification): Promise<void> {
    this.inserted.push(rendered);
  }
}

/**
 * Adapts NotificationsService.insertRendered to InAppWriter.insert
 * (naming mismatch — keeps the service method name explicit).
 */
export class NotificationsServiceInAppWriter implements InAppWriter {
  constructor(
    private readonly service: {
      insertRendered(rendered: RenderedNotification): Promise<void>;
    },
  ) {}

  insert(rendered: RenderedNotification): Promise<void> {
    return this.service.insertRendered(rendered);
  }
}

export class InAppChannel implements NotificationChannel {
  readonly kind = 'in_app' as const;

  constructor(private readonly writer: InAppWriter) {}

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    try {
      await this.writer.insert(notification);
      return { ok: true, retryable: false };
    } catch (err) {
      return {
        ok: false,
        retryable: true,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
