export interface LiveNotificationEvent {
  unreadCount: number;
  latestId: string | null;
}

export interface NotificationLiveSource {
  /** Returns an unsubscribe function. */
  subscribe(onUpdate: (event: LiveNotificationEvent) => void): () => void;
}

/**
 * Production live source: polls a fetcher on an interval.
 * There is no WebSocket gateway yet — polling is the honest current transport.
 */
export class PollingLiveSource implements NotificationLiveSource {
  constructor(
    private readonly fetchUnread: () => Promise<LiveNotificationEvent>,
    private readonly intervalMs = 30_000,
  ) {}

  subscribe(onUpdate: (event: LiveNotificationEvent) => void): () => void {
    let cancelled = false;

    const tick = async () => {
      try {
        const event = await this.fetchUnread();
        if (!cancelled) onUpdate(event);
      } catch {
        // Never break the shell chrome for polling failures.
      }
    };

    void tick();
    const id = setInterval(() => {
      void tick();
    }, this.intervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }
}

/**
 * In-memory fake for tests/demos: push() synchronously fans out to subscribers.
 */
export class InMemoryLiveSource implements NotificationLiveSource {
  private readonly listeners = new Set<(event: LiveNotificationEvent) => void>();

  subscribe(onUpdate: (event: LiveNotificationEvent) => void): () => void {
    this.listeners.add(onUpdate);
    return () => {
      this.listeners.delete(onUpdate);
    };
  }

  push(event: LiveNotificationEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
