import type { NotificationChannel } from '../domain/channel.interface';
import type { RenderedNotification } from '@velar/types';
import { StaticTemplateEngine } from '../templates/template-engine';
import { InMemoryMetricsRecorder } from '../observability/in-memory-metrics';
import {
  DigestCompiler,
  InMemoryDigestQueueReader,
} from './digest-compiler';
import type { QueuedDigestItem } from './digest-queue-reader';

function makeItem(
  overrides: Partial<QueuedDigestItem> &
    Pick<
      QueuedDigestItem,
      'id' | 'recipientId' | 'category' | 'windowKey' | 'channel'
    >,
): QueuedDigestItem {
  return {
    windowEndsAt: '2026-07-01T12:00:00.000Z',
    renderedSubject: `Subject ${overrides.id}`,
    renderedBody: `<p>Body ${overrides.id}</p>`,
    compiledAt: null,
    ...overrides,
  };
}

class RecordingChannel implements NotificationChannel {
  readonly kind = 'email' as const;
  readonly sent: RenderedNotification[] = [];

  async send(notification: RenderedNotification) {
    this.sent.push(notification);
    return { ok: true, retryable: false };
  }
}

describe('DigestCompiler', () => {
  const now = new Date('2026-07-01T12:00:00.000Z');

  it('coalesces multiple items in the same group into exactly one delivery', async () => {
    const queue = new InMemoryDigestQueueReader([
      makeItem({
        id: '1',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Bono emitido',
      }),
      makeItem({
        id: '2',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Bono congelado',
      }),
      makeItem({
        id: '3',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Bono activo',
      }),
    ]);
    const channel = new RecordingChannel();
    const metrics = new InMemoryMetricsRecorder();
    const compiler = new DigestCompiler(
      queue,
      new StaticTemplateEngine(),
      { email: channel },
      metrics,
    );

    const result = await compiler.compileDue(now);

    expect(result.compiled).toBe(1);
    expect(channel.sent).toHaveLength(1);
    const body = channel.sent[0].body;
    expect(body).toContain('Bono emitido');
    expect(body).toContain('Bono congelado');
    expect(body).toContain('Bono activo');
    expect(channel.sent[0].idempotencyKey).toBe(
      'digest:user-a:bond:daily:2026-07-01:email',
    );
    expect(queue.all().every((i) => i.compiledAt != null)).toBe(true);
    expect(metrics.deliveredCount('email')).toBe(1);
  });

  it('produces separate notifications for different groups', async () => {
    const queue = new InMemoryDigestQueueReader([
      makeItem({
        id: '1',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Group A item',
      }),
      makeItem({
        id: '2',
        recipientId: 'user-b',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Group B item',
      }),
      makeItem({
        id: '3',
        recipientId: 'user-a',
        category: 'transfer',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Group C item',
      }),
    ]);
    const channel = new RecordingChannel();
    const compiler = new DigestCompiler(
      queue,
      new StaticTemplateEngine(),
      { email: channel },
      new InMemoryMetricsRecorder(),
    );

    const result = await compiler.compileDue(now);

    expect(result.compiled).toBe(3);
    expect(channel.sent).toHaveLength(3);
    const subjects = channel.sent.map((n) => n.subject);
    expect(subjects.every((s) => s === 'Resumen de notificaciones')).toBe(true);
    expect(channel.sent.map((n) => n.recipientId).sort()).toEqual([
      'user-a',
      'user-a',
      'user-b',
    ]);
  });

  it('excludes already-compiled and not-yet-due rows', async () => {
    const queue = new InMemoryDigestQueueReader([
      makeItem({
        id: 'due',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Due item',
        windowEndsAt: '2026-07-01T11:00:00.000Z',
      }),
      makeItem({
        id: 'future',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Future item',
        windowEndsAt: '2026-07-01T13:00:00.000Z',
      }),
      makeItem({
        id: 'done',
        recipientId: 'user-a',
        category: 'bond',
        windowKey: 'daily:2026-07-01',
        channel: 'email',
        renderedSubject: 'Already compiled',
        windowEndsAt: '2026-07-01T10:00:00.000Z',
        compiledAt: '2026-07-01T10:30:00.000Z',
      }),
    ]);
    const channel = new RecordingChannel();
    const compiler = new DigestCompiler(
      queue,
      new StaticTemplateEngine(),
      { email: channel },
      new InMemoryMetricsRecorder(),
    );

    const result = await compiler.compileDue(now);

    expect(result.compiled).toBe(1);
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].body).toContain('Due item');
    expect(channel.sent[0].body).not.toContain('Future item');
    expect(channel.sent[0].body).not.toContain('Already compiled');
    expect(queue.all().find((i) => i.id === 'future')?.compiledAt).toBeNull();
    expect(queue.all().find((i) => i.id === 'done')?.compiledAt).toBe(
      '2026-07-01T10:30:00.000Z',
    );
  });
});
