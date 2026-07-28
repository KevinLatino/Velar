import type { RenderedNotification } from '@velar/types';
import { HmacPayloadSigner } from '../security/hmac-payload-signer';
import {
  EmailChannel,
  type EmailProvider,
} from './email-digest.channel';

function sample(): RenderedNotification {
  return {
    notificationId: 'n-1',
    recipientId: 'user-1',
    category: 'transfer',
    severity: 'info',
    subject: 'Nueva oferta recibida',
    body: '<p>Recibiste una oferta.</p>',
    channel: 'email',
    idempotencyKey: 'dedup:user-1:email',
  };
}

describe('EmailChannel', () => {
  it('success path sends to provider and returns ok', async () => {
    const calls: Array<{
      recipientId: string;
      subject: string;
      html: string;
    }> = [];
    const provider: EmailProvider = {
      async send(recipientId, subject, html) {
        calls.push({ recipientId, subject, html });
      },
    };
    const channel = new EmailChannel(provider);
    const n = sample();

    const result = await channel.send(n);

    expect(result).toEqual({ ok: true, retryable: false });
    expect(calls).toEqual([
      {
        recipientId: 'user-1',
        subject: 'Nueva oferta recibida',
        html: '<p>Recibiste una oferta.</p>',
      },
    ]);
    expect(channel.kind).toBe('email');
  });

  it('failure path returns retryable error', async () => {
    const provider: EmailProvider = {
      async send() {
        throw new Error('smtp unavailable');
      },
    };
    const channel = new EmailChannel(provider);

    const result = await channel.send(sample());

    expect(result).toEqual({
      ok: false,
      retryable: true,
      error: 'smtp unavailable',
    });
  });

  it('passes a non-empty HMAC signature through to the provider', async () => {
    let receivedSignature: string | undefined;
    const provider: EmailProvider = {
      async send(_recipientId, _subject, _html, signature) {
        receivedSignature = signature;
      },
    };
    const channel = new EmailChannel(
      provider,
      new HmacPayloadSigner('test-secret'),
    );

    await channel.send(sample());

    expect(receivedSignature).toBeDefined();
    expect(receivedSignature!.length).toBeGreaterThan(0);
    expect(receivedSignature).toMatch(/^[a-f0-9]{64}$/);
  });
});
