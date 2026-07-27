import type {
  NotificationCategory,
  NotificationChannelKind,
} from '@velar/types';

export interface QueuedDigestItem {
  id: string;
  recipientId: string;
  category: NotificationCategory;
  windowKey: string;
  windowEndsAt: string;
  renderedSubject: string;
  renderedBody: string;
  channel: NotificationChannelKind;
  compiledAt: string | null;
}

/**
 * Port for reading/compiling due digest-queue rows. Postgres production
 * adapter: PostgresDigestQueueReader. In-memory fake for unit tests.
 */
export interface DigestQueueReader {
  fetchDue(now: Date): Promise<QueuedDigestItem[]>;
  markCompiled(ids: string[]): Promise<void>;
}
