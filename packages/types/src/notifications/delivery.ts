import type { NotificationCategory, NotificationChannelKind } from './preferences';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface RenderedNotification {
  notificationId: string;
  recipientId: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  subject: string;
  body: string;
  channel: NotificationChannelKind;
  idempotencyKey: string;
}

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'dead_letter';

export interface DeliveryReceipt {
  id: string;
  notificationId: string;
  channel: NotificationChannelKind;
  status: DeliveryStatus;
  attemptCount: number;
  deliveredAt: string | null;
  readAt: string | null;
  error: string | null;
}
