import type { RenderedNotification } from '@velar/types';
import type {
  RealtimeTransport,
  ReceiptKind,
  TransportEvent,
  Unsubscribable,
} from '../domain/transport.interface';

export interface TransportReceipt {
  cursor: string;
  kind: ReceiptKind;
  at: string;
}

/**
 * Cursor scheme: stringified incrementing integers (`"1"`, `"2"`, …).
 * Strictly orderable via numeric comparison after parsing (`Number(cursor)`).
 * Resume/catch-up always uses `>` (never `>=`) so reconnects never re-deliver
 * the last-seen event.
 */
export class InMemoryRealtimeTransport implements RealtimeTransport {
  private seq = 1;
  private readonly logs = new Map<string, TransportEvent[]>();
  private readonly listeners = new Map<
    string,
    Set<(event: TransportEvent) => void>
  >();
  private readonly receipts = new Map<string, TransportReceipt[]>();

  async publish(
    userId: string,
    notification: RenderedNotification,
  ): Promise<TransportEvent> {
    const event: TransportEvent = {
      cursor: String(this.seq++),
      userId,
      notification,
    };
    let log = this.logs.get(userId);
    if (!log) {
      log = [];
      this.logs.set(userId, log);
    }
    log.push(event);

    const live = this.listeners.get(userId);
    if (live) {
      for (const onEvent of live) {
        onEvent(event);
      }
    }
    return event;
  }

  subscribe(
    userId: string,
    sinceCursor: string | null,
    onEvent: (event: TransportEvent) => void,
  ): Unsubscribable {
    const log = this.logs.get(userId) ?? [];
    const since =
      sinceCursor == null || sinceCursor === undefined
        ? -Infinity
        : Number(sinceCursor);

    for (const event of log) {
      if (Number(event.cursor) > since) {
        onEvent(event);
      }
    }

    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
    }
    set.add(onEvent);

    return {
      unsubscribe: () => {
        const current = this.listeners.get(userId);
        if (!current) return;
        current.delete(onEvent);
        if (current.size === 0) {
          this.listeners.delete(userId);
        }
      },
    };
  }

  async ack(
    userId: string,
    cursor: string,
    kind: ReceiptKind,
  ): Promise<void> {
    let list = this.receipts.get(userId);
    if (!list) {
      list = [];
      this.receipts.set(userId, list);
    }
    list.push({
      cursor,
      kind,
      at: new Date().toISOString(),
    });
  }

  getReceipts(userId: string): readonly TransportReceipt[] {
    return this.receipts.get(userId) ?? [];
  }
}
