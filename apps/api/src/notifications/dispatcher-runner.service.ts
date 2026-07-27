import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { NotificationChannel } from './domain/channel.interface';
import type { MetricsRecorder } from './domain/observability.interface';
import type { TemplateEngine } from './domain/template.interface';
import { OutboxDispatcher } from './outbox/dispatcher';
import { DigestCompiler } from './routing/digest-compiler';
import type { DigestQueueReader } from './routing/digest-queue-reader';
import {
  DIGEST_QUEUE_READER,
  METRICS_RECORDER,
  NOTIFICATION_CHANNELS,
  OUTBOX_DISPATCHER,
  TEMPLATE_ENGINE,
} from './notifications.tokens';

/**
 * Periodically drains the outbox and compiles due digest windows.
 * Skips work when NODE_ENV=test so Jest bootstraps never fire real timers.
 */
@Injectable()
export class DispatcherRunnerService {
  private readonly logger = new Logger(DispatcherRunnerService.name);
  private readonly digestCompiler: DigestCompiler;

  constructor(
    @Inject(OUTBOX_DISPATCHER) private readonly dispatcher: OutboxDispatcher,
    @Inject(DIGEST_QUEUE_READER) digestQueueReader: DigestQueueReader,
    @Inject(TEMPLATE_ENGINE) templates: TemplateEngine,
    @Inject(NOTIFICATION_CHANNELS)
    channels: Record<string, NotificationChannel>,
    @Inject(METRICS_RECORDER) metrics: MetricsRecorder,
  ) {
    this.digestCompiler = new DigestCompiler(
      digestQueueReader,
      templates,
      channels,
      metrics,
    );
  }

  @Interval(5000)
  async drainOutbox(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.dispatcher.drainOnce();
    } catch (e) {
      this.logger.warn(`outbox drainOnce failed: ${(e as Error).message}`);
    }
  }

  @Interval(60000)
  async compileDigests(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      await this.digestCompiler.compileDue(new Date());
    } catch (e) {
      this.logger.warn(`digest compileDue failed: ${(e as Error).message}`);
    }
  }
}
