import type { RenderedNotification } from '@velar/types';
import {
  InAppChannel,
  InMemoryInAppWriter,
} from './in-app.channel';

function sample(): RenderedNotification {
  return {
    notificationId: 'n-1',
    recipientId: 'user-1',
    category: 'bond',
    severity: 'info',
    subject: 'Bono emitido',
    body: '<p>Se emitió el bono.</p>',
    channel: 'in_app',
    idempotencyKey: 'dedup:user-1:in_app',
  };
}

describe('InAppChannel', () => {
  it('success path inserts and returns ok', async () => {
    const writer = new InMemoryInAppWriter();
    const channel = new InAppChannel(writer);
    const n = sample();

    const result = await channel.send(n);

    expect(result).toEqual({ ok: true, retryable: false });
    expect(writer.inserted).toEqual([n]);
    expect(channel.kind).toBe('in_app');
  });

  it('failure path returns retryable error', async () => {
    const writer: InMemoryInAppWriter = {
      inserted: [],
      async insert() {
        throw new Error('db down');
      },
    };
    const channel = new InAppChannel(writer);

    const result = await channel.send(sample());

    expect(result).toEqual({
      ok: false,
      retryable: true,
      error: 'db down',
    });
  });
});
