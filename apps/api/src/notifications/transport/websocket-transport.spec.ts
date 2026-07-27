import type { RenderedNotification } from '@velar/types';
import type { TransportEvent } from '../domain/transport.interface';
import type { CatchUpSource, TransportSocket } from './websocket-transport';
import { WebSocketRealtimeTransport } from './websocket-transport';

const OPEN = 1;
const CLOSED = 3;

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

function fakeSocket(readyState: number = OPEN): TransportSocket & {
  send: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  close: jest.Mock;
  emitClose: () => void;
} {
  const closeHandlers: Array<(...args: unknown[]) => void> = [];
  return {
    readyState,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'close') closeHandlers.push(handler);
    }),
    off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'close') {
        const idx = closeHandlers.indexOf(handler);
        if (idx >= 0) closeHandlers.splice(idx, 1);
      }
    }),
    emitClose: () => {
      for (const h of [...closeHandlers]) h();
    },
  };
}

function parseSent(socket: { send: jest.Mock }): TransportEvent[] {
  return socket.send.mock.calls.map(
    (call) => JSON.parse(call[0] as string) as TransportEvent,
  );
}

describe('WebSocketRealtimeTransport', () => {
  it('registerSocket catch-up sends buffered events from CatchUpSource', async () => {
    const buffered: TransportEvent[] = [
      {
        cursor: '1',
        userId: 'user-a',
        notification: sample({ notificationId: 'n-0', idempotencyKey: 'k-0' }),
      },
      {
        cursor: '2',
        userId: 'user-a',
        notification: sample({ notificationId: 'n-1', idempotencyKey: 'k-1' }),
      },
    ];
    const catchUp: CatchUpSource = {
      fetchSince: jest.fn(async (_userId, sinceCursor) => {
        const since =
          sinceCursor == null ? -Infinity : Number(sinceCursor);
        return buffered.filter((e) => Number(e.cursor) > since);
      }),
    };
    const transport = new WebSocketRealtimeTransport(catchUp);
    const socket = fakeSocket();

    await transport.registerSocket('user-a', socket, '1');

    expect(catchUp.fetchSince).toHaveBeenCalledWith('user-a', '1');
    expect(parseSent(socket)).toEqual([buffered[1]]);
  });

  it('publish after registration fans out live events to all sockets for that user', async () => {
    const catchUp: CatchUpSource = {
      fetchSince: jest.fn(async () => []),
    };
    const transport = new WebSocketRealtimeTransport(catchUp);
    const sock1 = fakeSocket();
    const sock2 = fakeSocket();

    await transport.registerSocket('user-a', sock1, null);
    await transport.registerSocket('user-a', sock2, null);

    sock1.send.mockClear();
    sock2.send.mockClear();

    const event = await transport.publish(
      'user-a',
      sample({ notificationId: 'live-1' }),
    );

    expect(parseSent(sock1)).toEqual([event]);
    expect(parseSent(sock2)).toEqual([event]);
  });

  it('skips sockets with readyState !== OPEN without throwing', async () => {
    const catchUp: CatchUpSource = {
      fetchSince: jest.fn(async () => []),
    };
    const transport = new WebSocketRealtimeTransport(catchUp);
    const openSock = fakeSocket(OPEN);
    const closedSock = fakeSocket(CLOSED);

    await transport.registerSocket('user-a', openSock, null);
    await transport.registerSocket('user-a', closedSock, null);

    openSock.send.mockClear();
    closedSock.send.mockClear();

    await expect(
      transport.publish('user-a', sample({ notificationId: 'live-2' })),
    ).resolves.toMatchObject({ notification: { notificationId: 'live-2' } });

    expect(openSock.send).toHaveBeenCalledTimes(1);
    expect(closedSock.send).not.toHaveBeenCalled();
  });

  it('removes socket on close so later publishes do not send to it', async () => {
    const catchUp: CatchUpSource = {
      fetchSince: jest.fn(async () => []),
    };
    const transport = new WebSocketRealtimeTransport(catchUp);
    const socket = fakeSocket();

    await transport.registerSocket('user-a', socket, null);
    socket.emitClose();
    socket.send.mockClear();

    await transport.publish('user-a', sample({ notificationId: 'after-close' }));

    expect(socket.send).not.toHaveBeenCalled();
  });

  it('ack resolves without throwing (persistence deferred)', async () => {
    const transport = new WebSocketRealtimeTransport({
      fetchSince: async () => [],
    });
    await expect(
      transport.ack('user-a', '1', 'delivered'),
    ).resolves.toBeUndefined();
  });
});
