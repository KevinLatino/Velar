import type { RenderedNotification } from '@velar/types';
import type { TransportEvent } from '../domain/transport.interface';
import { InMemoryRealtimeTransport } from './in-memory-transport';

function sample(
  overrides: Partial<RenderedNotification> = {},
): RenderedNotification {
  return {
    notificationId: 'n-1',
    recipientId: 'user-1',
    category: 'bond',
    severity: 'info',
    subject: 'Bono emitido',
    body: '<p>Se emitió el bono.</p>',
    channel: 'in_app',
    idempotencyKey: 'dedup:user-1:in_app',
    ...overrides,
  };
}

describe('InMemoryRealtimeTransport', () => {
  let transport: InMemoryRealtimeTransport;

  beforeEach(() => {
    transport = new InMemoryRealtimeTransport();
  });

  it('catch-up: subscribe with null cursor replays all buffered events in order', async () => {
    const userId = 'user-a';
    for (let i = 0; i < 5; i++) {
      await transport.publish(
        userId,
        sample({ notificationId: `n-${i}`, idempotencyKey: `k-${i}` }),
      );
    }

    const received: TransportEvent[] = [];
    transport.subscribe(userId, null, (event) => {
      received.push(event);
    });

    // All 5 buffered events replay synchronously during subscribe, before any live publish.
    expect(received).toHaveLength(5);
    expect(received.map((e) => e.notification.notificationId)).toEqual([
      'n-0',
      'n-1',
      'n-2',
      'n-3',
      'n-4',
    ]);
    expect(received.map((e) => Number(e.cursor))).toEqual([1, 2, 3, 4, 5]);

    const afterCatchUp = received.length;
    const live = await transport.publish(
      userId,
      sample({ notificationId: 'n-live', idempotencyKey: 'k-live' }),
    );
    expect(received).toHaveLength(afterCatchUp + 1);
    expect(received[afterCatchUp]).toEqual(live);
  });

  it('resume: reconnect with last-seen cursor replays only newer events', async () => {
    const userId = 'user-a';
    const firstBatch: TransportEvent[] = [];
    for (let i = 0; i < 3; i++) {
      firstBatch.push(
        await transport.publish(
          userId,
          sample({ notificationId: `n-${i}`, idempotencyKey: `k-${i}` }),
        ),
      );
    }

    const duringFirst: TransportEvent[] = [];
    const sub = transport.subscribe(userId, null, (e) => duringFirst.push(e));
    expect(duringFirst).toHaveLength(3);
    const thirdCursor = firstBatch[2].cursor;
    sub.unsubscribe();

    await transport.publish(
      userId,
      sample({ notificationId: 'n-3', idempotencyKey: 'k-3' }),
    );
    await transport.publish(
      userId,
      sample({ notificationId: 'n-4', idempotencyKey: 'k-4' }),
    );

    const resumed: TransportEvent[] = [];
    transport.subscribe(userId, thirdCursor, (e) => resumed.push(e));

    expect(resumed).toHaveLength(2);
    expect(resumed.map((e) => e.notification.notificationId)).toEqual([
      'n-3',
      'n-4',
    ]);
    expect(resumed.every((e) => Number(e.cursor) > Number(thirdCursor))).toBe(
      true,
    );
  });

  it('live delivery: publish reaches an active subscriber immediately', async () => {
    const userId = 'user-a';
    const received: TransportEvent[] = [];
    transport.subscribe(userId, null, (e) => received.push(e));

    expect(received).toHaveLength(0);

    const event = await transport.publish(
      userId,
      sample({ notificationId: 'n-live' }),
    );

    expect(received).toEqual([event]);
  });

  it('no cross-user leakage', async () => {
    const forA: TransportEvent[] = [];
    const forB: TransportEvent[] = [];
    transport.subscribe('user-a', null, (e) => forA.push(e));
    transport.subscribe('user-b', null, (e) => forB.push(e));

    await transport.publish('user-a', sample({ notificationId: 'only-a' }));
    await transport.publish('user-b', sample({ notificationId: 'only-b' }));

    expect(forA.map((e) => e.notification.notificationId)).toEqual(['only-a']);
    expect(forB.map((e) => e.notification.notificationId)).toEqual(['only-b']);
    expect(forA.every((e) => e.userId === 'user-a')).toBe(true);
    expect(forB.every((e) => e.userId === 'user-b')).toBe(true);
  });

  it('receipts: delivered and read are recorded and queryable', async () => {
    const userId = 'user-a';
    const event = await transport.publish(userId, sample());

    await transport.ack(userId, event.cursor, 'delivered');
    await transport.ack(userId, event.cursor, 'read');

    const receipts = transport.getReceipts(userId);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toMatchObject({
      cursor: event.cursor,
      kind: 'delivered',
    });
    expect(receipts[1]).toMatchObject({
      cursor: event.cursor,
      kind: 'read',
    });
    expect(typeof receipts[0].at).toBe('string');
    expect(typeof receipts[1].at).toBe('string');
  });

  it('multiple concurrent subscribers each get independent catch-up + live', async () => {
    const userId = 'user-a';
    await transport.publish(
      userId,
      sample({ notificationId: 'n-0', idempotencyKey: 'k-0' }),
    );

    const tab1: TransportEvent[] = [];
    const tab2: TransportEvent[] = [];
    transport.subscribe(userId, null, (e) => tab1.push(e));
    transport.subscribe(userId, null, (e) => tab2.push(e));

    expect(tab1).toHaveLength(1);
    expect(tab2).toHaveLength(1);
    expect(tab1[0].notification.notificationId).toBe('n-0');
    expect(tab2[0].notification.notificationId).toBe('n-0');

    const live = await transport.publish(
      userId,
      sample({ notificationId: 'n-1', idempotencyKey: 'k-1' }),
    );

    expect(tab1).toHaveLength(2);
    expect(tab2).toHaveLength(2);
    expect(tab1[1]).toEqual(live);
    expect(tab2[1]).toEqual(live);
  });
});
