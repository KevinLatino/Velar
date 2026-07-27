import type { RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';

export interface WebPushProvider {
  send(
    recipientId: string,
    payload: { title: string; body: string },
  ): Promise<void>;
}

/**
 * Safe default when no web-push provider is configured.
 * A real provider (VAPID/FCM/etc.) plugs in here later by implementing
 * WebPushProvider and resolving recipientId → push subscription (out of scope).
 */
export class NoopWebPushProvider implements WebPushProvider {
  constructor(
    private readonly log: (msg: string) => void = (m) => console.debug(m),
  ) {}

  async send(
    recipientId: string,
    payload: { title: string; body: string },
  ): Promise<void> {
    this.log(
      `[noop-web-push] to=${recipientId} title=${payload.title} bodyLength=${payload.body.length}`,
    );
  }
}

export class WebPushChannel implements NotificationChannel {
  readonly kind = 'web_push' as const;

  constructor(private readonly provider: WebPushProvider) {}

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    try {
      await this.provider.send(notification.recipientId, {
        title: notification.subject,
        body: notification.body,
      });
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
