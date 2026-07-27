import type {
  DomainEvent,
  NotificationCategory,
  RenderedNotification,
  RoutingDecision,
  UserNotificationPreferences,
} from '@velar/types';
import type { NotificationChannel } from '../domain/channel.interface';
import type { DedupStore } from '../domain/dedup.interface';
import type { MetricsRecorder } from '../domain/observability.interface';
import type { OutboxStore } from '../domain/outbox.interface';
import type { PreferencesStore } from '../domain/preferences.interface';
import type {
  RecipientCandidate,
  RecipientDirectory,
} from '../domain/recipients.interface';
import { CircuitBreaker } from './circuit-breaker';
import type { DeadLetterSink } from './dead-letter';
import { withRetry } from './retry';

export type RouteFn = (
  event: DomainEvent,
  recipient: RecipientCandidate,
  prefs: UserNotificationPreferences,
  now: Date,
) => RoutingDecision[];

export type RenderFn = (
  event: DomainEvent,
  recipient: RecipientCandidate,
  decision: RoutingDecision,
) => RenderedNotification;

export interface DigestQueue {
  enqueue(
    recipientId: string,
    category: NotificationCategory,
    windowKey: string,
    notification: RenderedNotification,
    /** ISO-8601 end of the digest/quiet-hours window (`RoutingDecision.deliverAt`). */
    windowEndsAt: string,
  ): Promise<void>;
}

export interface DispatcherDeps {
  outbox: OutboxStore;
  dedup: DedupStore;
  recipients: RecipientDirectory;
  preferences: PreferencesStore;
  route: RouteFn;
  render: RenderFn;
  channels: Record<string, NotificationChannel>;
  digestQueue: DigestQueue;
  deadLetter: DeadLetterSink;
  metrics: MetricsRecorder;
  clock?: () => Date;
  /** Injectable for fast tests; defaults to real setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  rng?: () => number;
}

export interface DispatcherOptions {
  batchSize: number;
  maxRetries: number;
  baseBackoffMs: number;
  backoffFactor: number;
  capBackoffMs: number;
  concurrency: number;
  circuitBreaker: { failureThreshold: number; cooldownMs: number };
}

/** Hand-rolled async semaphore — no extra npm dependency. */
class AsyncSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    // Slot was transferred by release() — do not increment again.
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // transfer the held slot to the waiter
    } else {
      this.active -= 1;
    }
  }
}

export class OutboxDispatcher {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private dlqDepth = 0;

  constructor(
    private readonly deps: DispatcherDeps,
    private readonly opts: DispatcherOptions,
  ) {}

  private clock(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  private breakerFor(channel: string): CircuitBreaker {
    let b = this.breakers.get(channel);
    if (!b) {
      b = new CircuitBreaker({
        failureThreshold: this.opts.circuitBreaker.failureThreshold,
        cooldownMs: this.opts.circuitBreaker.cooldownMs,
        clock: () => this.clock().getTime(),
      });
      this.breakers.set(channel, b);
    }
    return b;
  }

  /** Expose breaker state for tests. */
  getCircuitBreaker(channel: string): CircuitBreaker {
    return this.breakerFor(channel);
  }

  async drainOnce(): Promise<{
    processed: number;
    delivered: number;
    deduped: number;
    failed: number;
    deadLettered: number;
  }> {
    const events = await this.deps.outbox.fetchUnprocessed(this.opts.batchSize);
    let delivered = 0;
    let deduped = 0;
    let failed = 0;
    let deadLettered = 0;
    let processed = 0;

    const semaphore = new AsyncSemaphore(this.opts.concurrency);
    const recipientTail = new Map<string, Promise<void>>();
    const finalize: Promise<void>[] = [];

    // Schedule in outbox-fetch order so per-recipient chains preserve order.
    for (const event of events) {
      this.deps.metrics.incrementEmitted(event.eventType);

      const eventPromises: Promise<void>[] = [];

      try {
        const recipients = await this.deps.recipients.resolveForEvent(event);
        const now = this.clock();

        for (const recipient of recipients) {
          const prefs = await this.deps.preferences.getForUser(recipient.userId);
          const decisions = this.deps.route(event, recipient, prefs, now);

          for (const decision of decisions) {
            // Reuse the digest queue as deferred delivery for both true digests
            // and quiet-hours-deferred instant decisions (future deliverAt).
            const isDueNow =
              decision.cadence === 'instant' &&
              new Date(decision.deliverAt).getTime() <= now.getTime();
            if (!isDueNow) {
              const rendered = this.deps.render(event, recipient, decision);
              await this.deps.digestQueue.enqueue(
                recipient.userId,
                recipient.category,
                decision.digestWindowKey ?? '',
                rendered,
                decision.deliverAt,
              );
              continue;
            }

            const run = async () => {
              const result = await this.deliverInstant(
                event,
                recipient,
                decision,
              );
              if (result === 'delivered') delivered += 1;
              else if (result === 'deduped') deduped += 1;
              else if (result === 'failed') {
                failed += 1;
                deadLettered += 1;
              }
            };

            const prev = recipientTail.get(recipient.userId) ?? Promise.resolve();
            const chained = prev
              .then(async () => {
                await semaphore.acquire();
                try {
                  await run();
                } finally {
                  semaphore.release();
                }
              })
              .catch(() => {
                // Isolate unexpected errors so the per-recipient chain continues.
              });
            recipientTail.set(recipient.userId, chained);
            eventPromises.push(chained);
          }
        }

        finalize.push(
          (async () => {
            await Promise.all(eventPromises);
            await this.deps.outbox.markProcessed(event.id);
            processed += 1;
          })(),
        );
      } catch (err) {
        // Outer safety net for genuinely unexpected thrown errors (bugs), not
        // modeled channel failures. Re-drain stays idempotent because deliverInstant
        // still runs DedupStore.checkAndSet before any channel.send.
        const message = err instanceof Error ? err.message : String(err);
        await this.deps.outbox.markFailed(event.id, message);
      }
    }

    await Promise.all(finalize);

    return { processed, delivered, deduped, failed, deadLettered };
  }

  private async deliverInstant(
    event: DomainEvent,
    recipient: RecipientCandidate,
    decision: RoutingDecision,
  ): Promise<'delivered' | 'deduped' | 'failed'> {
    const rendered = this.deps.render(event, recipient, decision);
    const channelKind = decision.channel;
    const alreadySeen = await this.deps.dedup.checkAndSet(
      rendered.idempotencyKey,
    );
    if (alreadySeen) {
      this.deps.metrics.incrementDeduped(channelKind);
      return 'deduped';
    }

    const channel = this.deps.channels[channelKind];
    if (!channel) {
      await this.deadLetter(
        event,
        recipient.userId,
        channelKind,
        rendered,
        `no channel registered: ${channelKind}`,
      );
      this.deps.metrics.incrementFailed(channelKind);
      return 'failed';
    }

    const breaker = this.breakerFor(channelKind);
    const startedAt = this.clock().getTime();

    try {
      await withRetry(
        async () => {
          if (!breaker.canAttempt()) {
            const err = new Error('circuit breaker open');
            (err as Error & { retryable: boolean; code: string }).retryable =
              false;
            (err as Error & { code: string }).code = 'CIRCUIT_OPEN';
            throw err;
          }
          const result = await channel.send(rendered);
          if (!result.ok) {
            breaker.recordFailure();
            const err = new Error(result.error ?? 'channel send failed');
            (err as Error & { retryable: boolean }).retryable = result.retryable;
            throw err;
          }
          breaker.recordSuccess();
        },
        {
          maxRetries: this.opts.maxRetries,
          baseMs: this.opts.baseBackoffMs,
          factor: this.opts.backoffFactor,
          capMs: this.opts.capBackoffMs,
          isRetryable: (err) => {
            if (
              err &&
              typeof err === 'object' &&
              'code' in err &&
              (err as { code: string }).code === 'CIRCUIT_OPEN'
            ) {
              return false;
            }
            if (
              err &&
              typeof err === 'object' &&
              'retryable' in err
            ) {
              return (err as { retryable: boolean }).retryable !== false;
            }
            return true;
          },
          sleep: this.deps.sleep,
          rng: this.deps.rng,
        },
      );

      const latency = this.clock().getTime() - startedAt;
      this.deps.metrics.incrementDelivered(channelKind);
      this.deps.metrics.recordDeliveryLatencyMs(channelKind, latency);
      return 'delivered';
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.deadLetter(
        event,
        recipient.userId,
        channelKind,
        rendered,
        reason,
      );
      this.deps.metrics.incrementFailed(channelKind);
      return 'failed';
    }
  }

  private async deadLetter(
    event: DomainEvent,
    recipientId: string,
    channel: string,
    payload: unknown,
    failureReason: string,
  ): Promise<void> {
    await this.deps.deadLetter.record({
      outboxEventId: event.id,
      recipientId,
      channel,
      payload,
      failureReason,
      failedAt: this.clock().toISOString(),
    });
    this.dlqDepth += 1;
    this.deps.metrics.setDlqDepth(this.dlqDepth);
  }
}
