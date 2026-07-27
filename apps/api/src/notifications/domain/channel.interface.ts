import type { RenderedNotification, NotificationChannelKind } from '@velar/types';

export interface ChannelSendResult {
  ok: boolean;
  retryable: boolean;
  error?: string;
}

export interface NotificationChannel {
  readonly kind: NotificationChannelKind;
  send(notification: RenderedNotification): Promise<ChannelSendResult>;
}
