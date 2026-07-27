import type { RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';

export interface EmailProvider {
  send(recipientId: string, subject: string, html: string): Promise<void>;
}

/**
 * Safe default when no external email provider is configured.
 * A real provider (SendGrid/SES/etc.) plugs in here later by implementing
 * EmailProvider and resolving recipientId → email address (out of scope).
 */
export class NoopEmailProvider implements EmailProvider {
  constructor(
    private readonly log: (msg: string) => void = (m) => console.debug(m),
  ) {}

  async send(recipientId: string, subject: string, html: string): Promise<void> {
    this.log(
      `[noop-email] to=${recipientId} subject=${subject} htmlLength=${html.length}`,
    );
  }
}

export class EmailChannel implements NotificationChannel {
  readonly kind = 'email' as const;

  constructor(private readonly provider: EmailProvider) {}

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    try {
      await this.provider.send(
        notification.recipientId,
        notification.subject,
        notification.body,
      );
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
