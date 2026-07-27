import type { RenderedNotification } from '@velar/types';
import { WebSocket } from 'ws';
import type {
  RealtimeTransport,
  ReceiptKind,
  TransportEvent,
  Unsubscribable,
} from '../domain/transport.interface';

export interface CatchUpSource {
  /** Fetches events with cursor strictly after `sinceCursor` for catch-up on (re)connect. */
  fetchSince(
    userId: string,
    sinceCursor: string | null,
  ): Promise<TransportEvent[]>;
}

/**
 * Minimal socket surface used by this transport. Real clients pass a `ws`
 * WebSocket; tests may pass a lightweight fake with the same shape.
 */
export interface TransportSocket {
  readyState: number;
  send(data: string): void;
  on(event: 'close', listener: (...args: unknown[]) => void): unknown;
  off(event: 'close', listener: (...args: unknown[]) => void): unknown;
  close(): void;
}
/**
 * Production-shaped realtime transport using the `ws` package.
 *
 * Cursor scheme mirrors the in-memory transport: stringified incrementing
 * integers, ordered via numeric comparison after parsing.
 *
 * Wiring a real `ws.Server` / NestJS WebSocket gateway that calls
 * `registerSocket()` on connection happens when this is plugged into an HTTP
 * server (needs a live process) and is explicitly out of this repo's
 * "no live infra for tests" scope.
 */
export class WebSocketRealtimeTransport implements RealtimeTransport {
  private seq = 1;
  /** Per-user append-only log for subscribe() catch-up + cursor assignment. */
  private readonly logs = new Map<string, TransportEvent[]>();
  private readonly sockets = new Map<string, Set<TransportSocket>>();
  private readonly listeners = new Map<
    string,
    Set<(event: TransportEvent) => void>
  >();

  constructor(private readonly catchUp: CatchUpSource) {}

  /**
   * Registers a live socket for `userId`. Performs catch-up via `CatchUpSource`
   * (sends missed events as JSON) before the connection is considered live for
   * subsequent `publish` fan-out. A user may have multiple concurrent sockets.
   *
   * `sinceCursor` is the client's last-seen resume token (`null` = from the start).
   * Returns after catch-up completes so callers/tests can rely on ordering.
   */
  async registerSocket(
    userId: string,
    socket: TransportSocket,
    sinceCursor: string | null = null,
  ): Promise<Unsubscribable> {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    set.add(socket);

    const remove = () => {
      const current = this.sockets.get(userId);
      if (!current) return;
      current.delete(socket);
      if (current.size === 0) {
        this.sockets.delete(userId);
      }
    };

    const onClose = () => {
      remove();
    };
    socket.on('close', onClose);

    const missed = await this.catchUp.fetchSince(userId, sinceCursor);
    for (const event of missed) {
      this.sendIfOpen(socket, event);
    }

    return {
      unsubscribe: () => {
        socket.off('close', onClose);
        remove();
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      },
    };
  }

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

    const set = this.sockets.get(userId);
    if (set) {
      for (const socket of set) {
        this.sendIfOpen(socket, event);
      }
    }

    const live = this.listeners.get(userId);
    if (live) {
      for (const onEvent of live) {
        onEvent(event);
      }
    }

    return event;
  }

  /**
   * Same RealtimeTransport subscribe contract for symmetry/testability.
   * Real clients typically use `registerSocket` + socket message framing instead.
   */
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

  /**
   * Stub: resolves without persisting. Real receipt persistence to the
   * `notification_receipts` table happens when this is wired into the NestJS
   * module in a later phase — do not implement Postgres access here.
   */
  async ack(
    _userId: string,
    _cursor: string,
    _kind: ReceiptKind,
  ): Promise<void> {
    return;
  }

  private sendIfOpen(socket: TransportSocket, event: TransportEvent): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(event));
    }
  }
}
