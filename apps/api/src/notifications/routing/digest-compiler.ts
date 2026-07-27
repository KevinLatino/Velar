import { randomUUID } from 'crypto';
import type {
  NotificationCategory,
  NotificationChannelKind,
  RenderedNotification,
} from '@velar/types';
import type { NotificationChannel } from '../domain/channel.interface';
import type { MetricsRecorder } from '../domain/observability.interface';
import type { TemplateEngine } from '../domain/template.interface';
import type {
  DigestQueueReader,
  QueuedDigestItem,
} from './digest-queue-reader';

/**
 * Compiles due digest-queue rows into one coalesced notification per
 * (recipient, category, windowKey, channel) group.
 *
 * Production deployments would call `compileDue()` on an interval via
 * `@nestjs/schedule` (or similar); no live cron is wired here.
 */
export class DigestCompiler {
  constructor(
    private readonly queue: DigestQueueReader,
    private readonly templates: TemplateEngine,
    private readonly channels: Record<string, NotificationChannel>,
    private readonly metrics: MetricsRecorder,
    private readonly defaultLocale = 'es',
  ) {}

  async compileDue(now: Date): Promise<{ compiled: number }> {
    const due = await this.queue.fetchDue(now);
    if (due.length === 0) return { compiled: 0 };

    const groups = new Map<string, QueuedDigestItem[]>();
    for (const item of due) {
      const key = groupKey(item);
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }

    let compiled = 0;

    for (const items of groups.values()) {
      const first = items[0];
      const subjects = items.map((i) => i.renderedSubject);
      const { subject, body } = this.templates.render({
        templateId: 'notification.digest',
        locale: this.defaultLocale,
        data: { items: subjects },
      });

      const rendered: RenderedNotification = {
        notificationId: randomUUID(),
        recipientId: first.recipientId,
        category: first.category,
        severity: 'info',
        subject,
        body,
        channel: first.channel,
        idempotencyKey: `digest:${first.recipientId}:${first.category}:${first.windowKey}:${first.channel}`,
      };

      const channel = this.channels[first.channel];
      if (!channel) {
        this.metrics.incrementFailed(first.channel);
        continue;
      }

      const result = await channel.send(rendered);
      if (!result.ok) {
        this.metrics.incrementFailed(first.channel);
        continue;
      }

      await this.queue.markCompiled(items.map((i) => i.id));
      this.metrics.incrementDelivered(first.channel);
      compiled += 1;
    }

    return { compiled };
  }
}

function groupKey(item: QueuedDigestItem): string {
  return `${item.recipientId}|${item.category}|${item.windowKey}|${item.channel}`;
}

/** In-memory DigestQueueReader for unit tests (no Postgres). */
export class InMemoryDigestQueueReader implements DigestQueueReader {
  constructor(private items: QueuedDigestItem[] = []) {}

  seed(items: QueuedDigestItem[]): void {
    this.items.push(...items);
  }

  async fetchDue(now: Date): Promise<QueuedDigestItem[]> {
    const t = now.getTime();
    return this.items.filter(
      (i) =>
        i.compiledAt == null && new Date(i.windowEndsAt).getTime() <= t,
    );
  }

  async markCompiled(ids: string[]): Promise<void> {
    const set = new Set(ids);
    const now = new Date().toISOString();
    for (const item of this.items) {
      if (set.has(item.id)) {
        item.compiledAt = now;
      }
    }
  }

  all(): readonly QueuedDigestItem[] {
    return this.items;
  }
}
