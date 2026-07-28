import type { RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';
import type { PayloadSigner } from '../domain/signer.interface';
import { NoopPayloadSigner } from '../security/noop-payload-signer';

export interface WebPushProvider {
  send(
    recipientId: string,
    payload: { title: string; body: string },
    signature?: string,
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
    signature?: string,
  ): Promise<void> {
    this.log(
      `[noop-web-push] to=${recipientId} title=${payload.title} bodyLength=${payload.body.length}` +
        (signature ? ` signature=${signature.slice(0, 8)}…` : ''),
    );
  }
}

export class WebPushChannel implements NotificationChannel {
  readonly kind = 'web_push' as const;
  private readonly signer: PayloadSigner;

  constructor(
    private readonly provider: WebPushProvider,
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
        {
          title: notification.subject,
          body: notification.body,
        },
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
