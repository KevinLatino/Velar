import type { RenderedNotification } from '@velar/types';

export interface TransportEvent {
  cursor: string; // monotonic per-user resume token
  userId: string;
  notification: RenderedNotification;
}

export type ReceiptKind = 'delivered' | 'read';

export interface Unsubscribable {
  unsubscribe(): void;
}

export interface RealtimeTransport {
  /** Publishes a notification for live delivery; assigns and returns the cursor. */
  publish(
    userId: string,
    notification: RenderedNotification,
  ): Promise<TransportEvent>;
  /**
   * Subscribes for `userId`. MUST immediately replay (catch-up) any buffered/persisted
   * events with cursor strictly after `sinceCursor` (null = from the beginning) via
   * synchronous-as-possible calls to `onEvent`, THEN continue delivering live events
   * as they're published. Returns a handle to stop receiving events.
   */
  subscribe(
    userId: string,
    sinceCursor: string | null,
    onEvent: (event: TransportEvent) => void,
  ): Unsubscribable;
  /** Records a delivery or read receipt for a given cursor. */
  ack(userId: string, cursor: string, kind: ReceiptKind): Promise<void>;
}
