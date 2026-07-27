import type { DomainEvent, RoutingDecision } from '@velar/types';
import type { RecipientCandidate } from '../domain/recipients.interface';
import { createRenderFn } from './render-notification';
import { StaticTemplateEngine } from './template-engine';

const event: DomainEvent = {
  id: 'evt-1',
  aggregateType: 'bond',
  aggregateId: 'BONO-001',
  eventType: 'bond.congelado',
  payload: { tokenId: 'BONO-001', currentOwner: 'Partido Demo' },
  occurredAt: '2024-06-12T15:00:00.000Z',
  dedupKey: 'dedup-abc',
};

const recipient: RecipientCandidate = {
  userId: 'user-1',
  category: 'bond',
};

const decision: RoutingDecision = {
  channel: 'in_app',
  cadence: 'instant',
  deliverAt: '2024-06-12T15:00:00.000Z',
  digestWindowKey: null,
};

describe('createRenderFn', () => {
  const render = createRenderFn(new StaticTemplateEngine(), 'es');

  it('produces a RenderedNotification with deterministic idempotencyKey', () => {
    const a = render(event, recipient, decision);
    const b = render(event, recipient, decision);

    expect(a.idempotencyKey).toBe('dedup-abc:user-1:in_app');
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.recipientId).toBe('user-1');
    expect(a.category).toBe('bond');
    expect(a.severity).toBe('info');
    expect(a.channel).toBe('in_app');
    expect(a.subject).toBe('Bono congelado');
    expect(a.body).toContain('BONO-001');
    // notificationId is an instance id — may differ across calls
    expect(a.notificationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('idempotencyKey differs when dedupKey / userId / channel differs', () => {
    const base = render(event, recipient, decision).idempotencyKey;

    expect(
      render(
        { ...event, dedupKey: 'other-dedup' },
        recipient,
        decision,
      ).idempotencyKey,
    ).not.toBe(base);

    expect(
      render(event, { ...recipient, userId: 'user-2' }, decision).idempotencyKey,
    ).not.toBe(base);

    expect(
      render(event, recipient, {
        ...decision,
        channel: 'email',
      }).idempotencyKey,
    ).not.toBe(base);
  });

  it('maps rejection events to critical severity', () => {
    const n = render(
      { ...event, eventType: 'bond.rechazado' },
      recipient,
      decision,
    );
    expect(n.severity).toBe('critical');
  });
});
