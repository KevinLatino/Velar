import type { DomainEvent, RenderedNotification } from '@velar/types';
import type {
  ChannelSendResult,
  NotificationChannel,
} from '../domain/channel.interface';
import { InMemoryPreferencesStore } from '../domain/in-memory-preferences-store';
import { InMemoryRecipientDirectory } from '../domain/in-memory-recipient-directory';
import { InMemoryMetricsRecorder } from '../observability/in-memory-metrics';
import { InMemoryDedupStore } from '../dedup/in-memory-dedup.store';
import { InMemoryDeadLetterSink } from './dead-letter';
import {
  OutboxDispatcher,
  type DigestQueue,
  type DispatcherDeps,
  type DispatcherOptions,
  type RenderFn,
  type RouteFn,
} from './dispatcher';
import { InMemoryOutboxStore } from './in-memory-outbox.store';
import { InMemoryRateLimiter } from './in-memory-rate-limiter';

// ─────────────────────────────────────────────────────────────────────────────
// Test fakes / helpers
// ─────────────────────────────────────────────────────────────────────────────

class RecordingChannel implements NotificationChannel {
  readonly kind = 'in_app' as const;
  readonly sent: RenderedNotification[] = [];
  private handler: (
    n: RenderedNotification,
  ) => Promise<ChannelSendResult> | ChannelSendResult = async () => ({
    ok: true,
    retryable: false,
  });

  setHandler(
    handler: (
      n: RenderedNotification,
    ) => Promise<ChannelSendResult> | ChannelSendResult,
  ): void {
    this.handler = handler;
  }

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    const result = await this.handler(notification);
    if (result.ok) {
      this.sent.push(notification);
    }
    return result;
  }
}

class CountingFailChannel implements NotificationChannel {
  readonly kind = 'in_app' as const;
  attempts = 0;
  readonly sent: RenderedNotification[] = [];

  constructor(
    private readonly shouldFail: (n: RenderedNotification) => boolean,
  ) {}

  async send(notification: RenderedNotification): Promise<ChannelSendResult> {
    this.attempts += 1;
    if (this.shouldFail(notification)) {
      return { ok: false, retryable: true, error: 'forced failure' };
    }
    this.sent.push(notification);
    return { ok: true, retryable: false };
  }
}

const instantRoute: RouteFn = (_e, _r, _p, now) => [
  {
    channel: 'in_app',
    cadence: 'instant',
    deliverAt: now.toISOString(),
    digestWindowKey: null,
  },
];

const deterministicRender: RenderFn = (event, recipient, decision) => ({
  notificationId: `${event.id}:${recipient.userId}:${decision.channel}`,
  recipientId: recipient.userId,
  category: recipient.category,
  severity: 'info',
  subject: event.eventType,
  body: JSON.stringify(event.payload),
  channel: decision.channel,
  idempotencyKey: `${event.dedupKey}:${recipient.userId}:${decision.channel}`,
});

class InMemoryDigestQueue implements DigestQueue {
  readonly items: Array<{
    recipientId: string;
    category: string;
    windowKey: string;
    notification: RenderedNotification;
    windowEndsAt: string;
  }> = [];

  async enqueue(
    recipientId: string,
    category: RenderedNotification['category'],
    windowKey: string,
    notification: RenderedNotification,
    windowEndsAt: string,
  ): Promise<void> {
    this.items.push({
      recipientId,
      category,
      windowKey,
      notification,
      windowEndsAt,
    });
  }
}

function makeEvent(
  overrides: Partial<DomainEvent> & Pick<DomainEvent, 'id' | 'dedupKey'>,
): DomainEvent {
  return {
    aggregateType: 'bond',
    aggregateId: 'agg-1',
    eventType: 'bond.activo',
    payload: {},
    occurredAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildDispatcher(
  overrides: {
    outbox?: InMemoryOutboxStore;
    dedup?: InMemoryDedupStore;
    recipients?: InMemoryRecipientDirectory;
    preferences?: InMemoryPreferencesStore;
    route?: RouteFn;
    render?: RenderFn;
    channel?: NotificationChannel;
    digestQueue?: DigestQueue;
    deadLetter?: InMemoryDeadLetterSink;
    metrics?: InMemoryMetricsRecorder;
    clock?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    rateLimiter?: DispatcherDeps['rateLimiter'];
    tracer?: DispatcherDeps['tracer'];
    opts?: Partial<DispatcherOptions>;
  } = {},
): {
  dispatcher: OutboxDispatcher;
  outbox: InMemoryOutboxStore;
  dedup: InMemoryDedupStore;
  channel: NotificationChannel;
  deadLetter: InMemoryDeadLetterSink;
  metrics: InMemoryMetricsRecorder;
  digestQueue: InMemoryDigestQueue;
} {
  const outbox = overrides.outbox ?? new InMemoryOutboxStore();
  const dedup = overrides.dedup ?? new InMemoryDedupStore();
  const deadLetter = overrides.deadLetter ?? new InMemoryDeadLetterSink();
  const metrics = overrides.metrics ?? new InMemoryMetricsRecorder();
  const digestQueue =
    (overrides.digestQueue as InMemoryDigestQueue | undefined) ??
    new InMemoryDigestQueue();
  const channel = overrides.channel ?? new RecordingChannel();

  const deps: DispatcherDeps = {
    outbox,
    dedup,
    recipients:
      overrides.recipients ??
      new InMemoryRecipientDirectory(new Map([['agg-1', ['user-a']]])),
    preferences: overrides.preferences ?? new InMemoryPreferencesStore(),
    route: overrides.route ?? instantRoute,
    render: overrides.render ?? deterministicRender,
    channels: { in_app: channel },
    digestQueue,
    deadLetter,
    metrics,
    clock: overrides.clock,
    sleep: overrides.sleep ?? (async () => undefined),
    rng: () => 0,
    rateLimiter: overrides.rateLimiter,
    tracer: overrides.tracer,
  };

  const opts: DispatcherOptions = {
    batchSize: 100,
    maxRetries: 2,
    baseBackoffMs: 1,
    backoffFactor: 2,
    capBackoffMs: 10,
    concurrency: 4,
    circuitBreaker: { failureThreshold: 5, cooldownMs: 1000 },
    ...overrides.opts,
  };

  return {
    dispatcher: new OutboxDispatcher(deps, opts),
    outbox,
    dedup,
    channel,
    deadLetter,
    metrics,
    digestQueue,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OutboxDispatcher', () => {
  describe('no duplicates under retries/replay', () => {
    it('does not re-deliver on re-drain when dedup keys are already set', async () => {
      const outbox = new InMemoryOutboxStore();
      outbox.seed([
        makeEvent({ id: 'e1', dedupKey: 'dk-1', aggregateId: 'agg-1' }),
        makeEvent({ id: 'e2', dedupKey: 'dk-2', aggregateId: 'agg-1' }),
        makeEvent({ id: 'e3', dedupKey: 'dk-3', aggregateId: 'agg-1' }),
      ]);

      const channel = new RecordingChannel();
      const { dispatcher, metrics } = buildDispatcher({
        outbox,
        channel,
        recipients: new InMemoryRecipientDirectory(
          new Map([['agg-1', ['user-a']]]),
        ),
      });

      const first = await dispatcher.drainOnce();
      expect(first.delivered).toBe(3);
      expect(channel.sent).toHaveLength(3);
      expect(metrics.deliveredCount('in_app')).toBe(3);

      // Simulate crash: events reappear as unprocessed but dedup keys remain.
      outbox.unmarkProcessed('e1');
      outbox.unmarkProcessed('e2');
      outbox.unmarkProcessed('e3');

      const second = await dispatcher.drainOnce();
      expect(second.delivered).toBe(0);
      expect(second.deduped).toBe(3);
      expect(channel.sent).toHaveLength(3);
      expect(metrics.deliveredCount('in_app')).toBe(3);
      expect(metrics.dedupedCount('in_app')).toBe(3);
    });
  });

  describe('per-recipient ordering under concurrency', () => {
    it('preserves strict per-recipient order while allowing cross-recipient interleaving', async () => {
      const recipients = ['user-a', 'user-b', 'user-c'];
      const eventsPerRecipient = 25;
      const outbox = new InMemoryOutboxStore();

      // Each event fans out to all three recipients; payload.seq is monotonic.
      for (let seq = 0; seq < eventsPerRecipient; seq++) {
        outbox.seed([
          makeEvent({
            id: `evt-${seq}`,
            dedupKey: `dk-${seq}`,
            aggregateId: 'shared-agg',
            payload: { seq },
          }),
        ]);
      }

      const channel = new RecordingChannel();
      channel.setHandler(async () => {
        await new Promise((r) => setImmediate(r));
        return { ok: true, retryable: false };
      });

      const { dispatcher } = buildDispatcher({
        outbox,
        channel,
        recipients: new InMemoryRecipientDirectory(
          new Map([['shared-agg', recipients]]),
        ),
        opts: { concurrency: 3, batchSize: 100, maxRetries: 0 },
      });

      const result = await dispatcher.drainOnce();
      expect(result.delivered).toBe(recipients.length * eventsPerRecipient);

      for (const userId of recipients) {
        const seqs = channel.sent
          .filter((n) => n.recipientId === userId)
          .map((n) => (JSON.parse(n.body) as { seq: number }).seq);
        expect(seqs).toEqual(
          Array.from({ length: eventsPerRecipient }, (_, i) => i),
        );
      }
    });
  });

  describe('backpressure / DLQ', () => {
    it('dead-letters once after maxRetries and still delivers other recipients', async () => {
      const outbox = new InMemoryOutboxStore();
      outbox.seed([
        makeEvent({
          id: 'e1',
          dedupKey: 'dk-fail',
          aggregateId: 'agg-multi',
        }),
      ]);

      const maxRetries = 2;
      const channel = new CountingFailChannel(
        (n) => n.recipientId === 'user-fail',
      );

      const { dispatcher, deadLetter, metrics } = buildDispatcher({
        outbox,
        channel,
        recipients: new InMemoryRecipientDirectory(
          new Map([['agg-multi', ['user-ok', 'user-fail']]]),
        ),
        opts: {
          maxRetries,
          concurrency: 2,
          circuitBreaker: { failureThreshold: 100, cooldownMs: 60_000 },
        },
      });

      const result = await dispatcher.drainOnce();

      expect(result.delivered).toBe(1);
      expect(result.deadLettered).toBe(1);
      expect(result.failed).toBe(1);
      expect(deadLetter.entries).toHaveLength(1);
      expect(deadLetter.entries[0].recipientId).toBe('user-fail');
      // user-ok: 1 send; user-fail: 1 initial + maxRetries retries
      expect(channel.attempts).toBe(1 + (maxRetries + 1));
      expect(channel.sent).toHaveLength(1);
      expect(channel.sent[0].recipientId).toBe('user-ok');
      expect(metrics.failedCount('in_app')).toBe(1);
      expect(metrics.deliveredCount('in_app')).toBe(1);
      expect(metrics.dlqDepth).toBe(1);
    });
  });

  describe('circuit breaker', () => {
    it('stops attempting while open and allows a half-open probe after cooldown', async () => {
      let nowMs = 1_000_000;
      const clock = () => new Date(nowMs);

      const outbox = new InMemoryOutboxStore();
      // Enough events to trip the breaker, then more while open, then probe.
      for (let i = 0; i < 8; i++) {
        outbox.seed([
          makeEvent({
            id: `cb-${i}`,
            dedupKey: `cb-dk-${i}`,
            aggregateId: 'agg-1',
          }),
        ]);
      }

      let sendCalls = 0;
      const channel = new RecordingChannel();
      channel.setHandler(async () => {
        sendCalls += 1;
        return { ok: false, retryable: true, error: 'downstream down' };
      });

      const failureThreshold = 3;
      const cooldownMs = 5_000;
      const { dispatcher, deadLetter } = buildDispatcher({
        outbox,
        channel,
        clock,
        recipients: new InMemoryRecipientDirectory(
          new Map([['agg-1', ['user-a']]]),
        ),
        opts: {
          maxRetries: 0, // one attempt per event — failures trip breaker quickly
          concurrency: 1, // serial so breaker state is deterministic
          batchSize: 8,
          circuitBreaker: { failureThreshold, cooldownMs },
        },
      });

      await dispatcher.drainOnce();

      const breaker = dispatcher.getCircuitBreaker('in_app');
      expect(breaker.getState()).toBe('open');
      // Sends only while closed (threshold failures); further events refused.
      expect(sendCalls).toBe(failureThreshold);
      expect(deadLetter.entries.length).toBe(8);

      // Advance past cooldown — half-open probe should be allowed.
      nowMs += cooldownMs + 1;
      expect(breaker.canAttempt()).toBe(true);
      expect(breaker.getState()).toBe('half_open');

      // Seed one more event and allow success on the probe.
      outbox.seed([
        makeEvent({
          id: 'cb-probe',
          dedupKey: 'cb-dk-probe',
          aggregateId: 'agg-1',
        }),
      ]);
      channel.setHandler(async () => {
        sendCalls += 1;
        return { ok: true, retryable: false };
      });

      const probeResult = await dispatcher.drainOnce();
      expect(probeResult.delivered).toBe(1);
      expect(sendCalls).toBe(failureThreshold + 1);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('digest cadence', () => {
    it('enqueues digest decisions without channel send or dedup', async () => {
      const outbox = new InMemoryOutboxStore();
      outbox.seed([
        makeEvent({ id: 'd1', dedupKey: 'dk-d', aggregateId: 'agg-1' }),
      ]);

      const digestRoute: RouteFn = (_e, _r, _p, now) => [
        {
          channel: 'email',
          cadence: 'daily',
          deliverAt: now.toISOString(),
          digestWindowKey: '2026-07-01',
        },
      ];

      const channel = new RecordingChannel();
      const { dispatcher, digestQueue, dedup, metrics } = buildDispatcher({
        outbox,
        channel,
        route: digestRoute,
      });

      const result = await dispatcher.drainOnce();
      expect(result.delivered).toBe(0);
      expect(channel.sent).toHaveLength(0);
      expect(digestQueue.items).toHaveLength(1);
      expect(digestQueue.items[0].windowKey).toBe('2026-07-01');
      expect(dedup.size()).toBe(0);
      expect(metrics.deliveredCount('in_app')).toBe(0);
    });
  });

  describe('per-recipient+channel rate limiting', () => {
    it('dead-letters excess sends as rate_limited without affecting other recipients', async () => {
      const outbox = new InMemoryOutboxStore();
      // 5 events for the limited recipient only.
      for (let i = 0; i < 5; i++) {
        outbox.seed([
          makeEvent({
            id: `rl-${i}`,
            dedupKey: `rl-dk-${i}`,
            aggregateId: 'agg-limited',
          }),
        ]);
      }
      // Separate event for a different recipient in the same batch.
      outbox.seed([
        makeEvent({
          id: 'rl-other',
          dedupKey: 'rl-dk-other',
          aggregateId: 'agg-other',
        }),
      ]);

      const channel = new RecordingChannel();
      const rateLimiter = new InMemoryRateLimiter({
        maxPerWindow: 2,
        windowMs: 60_000,
      });

      const { dispatcher, deadLetter, metrics } = buildDispatcher({
        outbox,
        channel,
        rateLimiter,
        recipients: new InMemoryRecipientDirectory(
          new Map([
            ['agg-limited', ['user-limited']],
            ['agg-other', ['user-other']],
          ]),
        ),
        opts: { concurrency: 1, maxRetries: 0 },
      });

      const result = await dispatcher.drainOnce();

      const limitedSent = channel.sent.filter(
        (n) => n.recipientId === 'user-limited',
      );
      const otherSent = channel.sent.filter(
        (n) => n.recipientId === 'user-other',
      );
      expect(limitedSent).toHaveLength(2);
      expect(otherSent).toHaveLength(1);

      const rateLimitedDlq = deadLetter.entries.filter(
        (e) => e.failureReason === 'rate_limited',
      );
      expect(rateLimitedDlq).toHaveLength(3);
      expect(rateLimitedDlq.every((e) => e.recipientId === 'user-limited')).toBe(
        true,
      );
      expect(metrics.rateLimitedCount('in_app')).toBe(3);
      expect(metrics.failedCount('in_app')).toBe(0);
      expect(result.delivered).toBe(3); // 2 limited + 1 other
      expect(result.failed).toBe(3);
    });
  });
});
