import type { RenderedNotification } from '@velar/types';
import {
  WebPushChannel,
  type WebPushProvider,
} from './web-push.channel';

function sample(): RenderedNotification {
  return {
    notificationId: 'n-1',
    recipientId: 'user-1',
    category: 'report',
    severity: 'warning',
    subject: 'Reporte con observaciones',
    body: '<p>Tiene observaciones.</p>',
    channel: 'web_push',
    idempotencyKey: 'dedup:user-1:web_push',
  };
}

describe('WebPushChannel', () => {
  it('success path sends to provider and returns ok', async () => {
    const calls: Array<{
      recipientId: string;
      payload: { title: string; body: string };
    }> = [];
    const provider: WebPushProvider = {
      async send(recipientId, payload) {
        calls.push({ recipientId, payload });
      },
    };
    const channel = new WebPushChannel(provider);
    const n = sample();

    const result = await channel.send(n);

    expect(result).toEqual({ ok: true, retryable: false });
    expect(calls).toEqual([
      {
        recipientId: 'user-1',
        payload: {
          title: 'Reporte con observaciones',
          body: '<p>Tiene observaciones.</p>',
        },
      },
    ]);
    expect(channel.kind).toBe('web_push');
  });

  it('failure path returns retryable error', async () => {
    const provider: WebPushProvider = {
      async send() {
        throw new Error('push endpoint down');
      },
    };
    const channel = new WebPushChannel(provider);

    const result = await channel.send(sample());

    expect(result).toEqual({
      ok: false,
      retryable: true,
      error: 'push endpoint down',
    });
  });
});
