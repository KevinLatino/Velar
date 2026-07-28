import { randomUUID } from 'crypto';
import type { RenderedNotification } from '@velar/types';
import type { RenderFn } from '../outbox/dispatcher';
import type { TemplateEngine } from '../domain/template.interface';
import {
  severityForEvent,
  templateIdForEvent,
} from './event-template-map';

export function createRenderFn(
  templateEngine: TemplateEngine,
  defaultLocale = 'es',
): RenderFn {
  return (event, recipient, decision): RenderedNotification => {
    const templateId = templateIdForEvent(event.eventType);
    const { subject, body } = templateEngine.render({
      templateId,
      locale: defaultLocale,
      data: {
        ...event.payload,
        eventType: event.eventType,
      },
    });

    return {
      notificationId: randomUUID(),
      recipientId: recipient.userId,
      category: recipient.category,
      severity: severityForEvent(event.eventType),
      subject,
      body,
      channel: decision.channel,
      // Deterministic: DedupStore / dispatcher rely on this for
      // no-duplicate-delivery-under-replay. Do not use random/timestamp.
      idempotencyKey: `${event.dedupKey}:${recipient.userId}:${decision.channel}`,
    };
  };
}
