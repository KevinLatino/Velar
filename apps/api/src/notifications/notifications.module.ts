import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  EmailChannel,
  NoopEmailProvider,
} from './channels/email-digest.channel';
import {
  InAppChannel,
  NotificationsServiceInAppWriter,
} from './channels/in-app.channel';
import {
  NoopWebPushProvider,
  WebPushChannel,
} from './channels/web-push.channel';
import { PostgresDedupStore } from './dedup/postgres-dedup.store';
import type { NotificationChannel } from './domain/channel.interface';
import type { DedupStore } from './domain/dedup.interface';
import type { MetricsRecorder } from './domain/observability.interface';
import type { OutboxStore } from './domain/outbox.interface';
import type { PreferencesStore } from './domain/preferences.interface';
import { PostgresPreferencesStore } from './domain/postgres-preferences-store';
import { PostgresRecipientDirectory } from './domain/postgres-recipient-directory';
import type { RecipientDirectory } from './domain/recipients.interface';
import type { TemplateEngine } from './domain/template.interface';
import type { RealtimeTransport } from './domain/transport.interface';
import { DispatcherRunnerService } from './dispatcher-runner.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import {
  DEAD_LETTER_SINK,
  DEDUP_STORE,
  DIGEST_QUEUE,
  DIGEST_QUEUE_READER,
  METRICS_RECORDER,
  NOTIFICATION_CHANNELS,
  OUTBOX_DISPATCHER,
  OUTBOX_STORE,
  PREFERENCES_STORE,
  REALTIME_TRANSPORT,
  RECIPIENT_DIRECTORY,
  TEMPLATE_ENGINE,
} from './notifications.tokens';
import {
  // Interim production default: in-process counters only (not exported to
  // Prometheus/OTel yet). Swap for a real MetricsRecorder exporter in the
  // observability phase — nothing about this class is test-specific.
  InMemoryMetricsRecorder,
} from './observability/in-memory-metrics';
import type { DeadLetterSink } from './outbox/dead-letter';
import type { DigestQueue } from './outbox/dispatcher';
import { OutboxDispatcher } from './outbox/dispatcher';
import { PostgresDeadLetterSink } from './outbox/postgres-dead-letter';
import { PostgresOutboxStore } from './outbox/postgres-outbox.store';
import {
  PostgresDigestQueue,
  PostgresDigestQueueReader,
} from './routing/postgres-digest-queue';
import { route } from './routing/routing-engine';
import { createRenderFn } from './templates/render-notification';
import { StaticTemplateEngine } from './templates/template-engine';
// Known limitation: InMemoryRealtimeTransport is process-local — live
// cross-request pub/sub will not work across multiple server instances.
// WebSocketRealtimeTransport needs an HTTP-upgrade/gateway wiring point that
// does not exist yet in this app (explicitly out of scope for this phase).
import { InMemoryRealtimeTransport } from './transport/in-memory-transport';

@Module({
  imports: [AuthModule],
  providers: [
    NotificationsService,
    DispatcherRunnerService,
    { provide: OUTBOX_STORE, useClass: PostgresOutboxStore },
    { provide: DEDUP_STORE, useClass: PostgresDedupStore },
    { provide: RECIPIENT_DIRECTORY, useClass: PostgresRecipientDirectory },
    { provide: PREFERENCES_STORE, useClass: PostgresPreferencesStore },
    { provide: DEAD_LETTER_SINK, useClass: PostgresDeadLetterSink },
    { provide: DIGEST_QUEUE, useClass: PostgresDigestQueue },
    { provide: DIGEST_QUEUE_READER, useClass: PostgresDigestQueueReader },
    {
      provide: TEMPLATE_ENGINE,
      useFactory: (): TemplateEngine => new StaticTemplateEngine(),
    },
    {
      provide: METRICS_RECORDER,
      useFactory: (): MetricsRecorder => new InMemoryMetricsRecorder(),
    },
    {
      provide: REALTIME_TRANSPORT,
      useFactory: (): RealtimeTransport => new InMemoryRealtimeTransport(),
    },
    {
      provide: NOTIFICATION_CHANNELS,
      inject: [NotificationsService],
      useFactory: (
        notifications: NotificationsService,
      ): Record<string, NotificationChannel> => ({
        // InAppChannel takes InAppWriter; adapter maps insertRendered → insert.
        in_app: new InAppChannel(
          new NotificationsServiceInAppWriter(notifications),
        ),
        // Noop providers are intentional: this repo must run with no external
        // email/push vendor. Swap EmailProvider/WebPushProvider later via config.
        email: new EmailChannel(new NoopEmailProvider()),
        web_push: new WebPushChannel(new NoopWebPushProvider()),
      }),
    },
    {
      provide: OUTBOX_DISPATCHER,
      inject: [
        OUTBOX_STORE,
        DEDUP_STORE,
        RECIPIENT_DIRECTORY,
        PREFERENCES_STORE,
        TEMPLATE_ENGINE,
        NOTIFICATION_CHANNELS,
        DIGEST_QUEUE,
        DEAD_LETTER_SINK,
        METRICS_RECORDER,
      ],
      useFactory: (
        outbox: OutboxStore,
        dedup: DedupStore,
        recipients: RecipientDirectory,
        preferences: PreferencesStore,
        templateEngine: TemplateEngine,
        channels: Record<string, NotificationChannel>,
        digestQueue: DigestQueue,
        deadLetter: DeadLetterSink,
        metrics: MetricsRecorder,
      ): OutboxDispatcher =>
        new OutboxDispatcher(
          {
            outbox,
            dedup,
            recipients,
            preferences,
            route,
            render: createRenderFn(templateEngine),
            channels,
            digestQueue,
            deadLetter,
            metrics,
          },
          {
            batchSize: 50,
            maxRetries: 3,
            baseBackoffMs: 200,
            backoffFactor: 2,
            capBackoffMs: 30000,
            concurrency: 5,
            circuitBreaker: { failureThreshold: 5, cooldownMs: 30000 },
          },
        ),
    },
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, OUTBOX_DISPATCHER, REALTIME_TRANSPORT],
})
export class NotificationsModule {}
