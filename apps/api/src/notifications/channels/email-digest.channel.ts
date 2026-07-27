import type { RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';
import type { PayloadSigner } from '../domain/signer.interface';
import { NoopPayloadSigner } from '../security/noop-payload-signer';

export interface EmailProvider {
  send(
    recipientId: string,
    subject: string,
    html: string,
    signature?: string,
  ): Promise<void>;
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

  async send(
    recipientId: string,
    subject: string,
    html: string,
    signature?: string,
  ): Promise<void> {
    this.log(
      `[noop-email] to=${recipientId} subject=${subject} htmlLength=${html.length}` +
        (signature ? ` signature=${signature.slice(0, 8)}…` : ''),
    );
  }
}

export class EmailChannel implements NotificationChannel {
  readonly kind = 'email' as const;
  private readonly signer: PayloadSigner;

  constructor(
    private readonly provider: EmailProvider,
    signer?: PayloadSigner,
  ) {
    this.signer = signer ?? new NoopPayloadSigner();
  }

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    try {
      const signature = this.signer.sign(
        JSON.stringify({
          subject: notification.subject,
          body: notification.body,
          recipientId: notification.recipientId,
        }),
      );
      await this.provider.send(
        notification.recipientId,
        notification.subject,
        notification.body,
        signature,
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
