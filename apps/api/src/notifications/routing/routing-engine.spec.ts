import type {
  DomainEvent,
  NotificationCategory,
  NotificationChannelKind,
  UserNotificationPreferences,
} from '@velar/types';
import * as fc from 'fast-check';
import type { RecipientCandidate } from '../domain/recipients.interface';
import { nextQuietHoursEnd } from './quiet-hours';
import { route } from './routing-engine';

const event: DomainEvent = {
  id: 'evt-1',
  aggregateType: 'bond',
  aggregateId: 'bond-1',
  eventType: 'bond.frozen',
  payload: {},
  occurredAt: '2024-06-12T15:00:00.000Z',
  dedupKey: 'dedup-1',
};

const recipient: RecipientCandidate = {
  userId: 'user-1',
  category: 'bond',
};

const now = new Date('2024-06-12T15:00:00.000Z');

function emptyPrefs(
  overrides: Partial<UserNotificationPreferences> = {},
): UserNotificationPreferences {
  return {
    userId: 'user-1',
    channelPreferences: [],
    quietHours: null,
    digestSettings: [],
    ...overrides,
  };
}

describe('route — defaults and opt-outs', () => {
  it('default preferences (no explicit rows) → all three channels, instant', () => {
    const decisions = route(event, recipient, emptyPrefs(), now);
    expect(decisions.map((d) => d.channel).sort()).toEqual(
      ['email', 'in_app', 'web_push'].sort(),
    );
    for (const d of decisions) {
      expect(d.cadence).toBe('instant');
      expect(d.deliverAt).toBe(now.toISOString());
      expect(d.digestWindowKey).toBeNull();
    }
  });

  it('opt-out removes exactly that channel', () => {
    const prefs = emptyPrefs({
      channelPreferences: [
        { category: 'bond', channel: 'email', enabled: false },
      ],
    });
    const decisions = route(event, recipient, prefs, now);
    expect(decisions.map((d) => d.channel).sort()).toEqual(
      ['in_app', 'web_push'].sort(),
    );
  });

  it('full opt-out of every channel → empty decisions', () => {
    const prefs = emptyPrefs({
      channelPreferences: [
        { category: 'bond', channel: 'in_app', enabled: false },
        { category: 'bond', channel: 'email', enabled: false },
        { category: 'bond', channel: 'web_push', enabled: false },
      ],
    });
    expect(route(event, recipient, prefs, now)).toEqual([]);
  });
});

describe('route — digest cadence', () => {
  it('daily cadence applies to all enabled channels with a shared window key', () => {
    const prefs = emptyPrefs({
      digestSettings: [{ category: 'bond', cadence: 'daily' }],
      quietHours: {
        timezone: 'America/Costa_Rica',
        startMinute: 22 * 60,
        endMinute: 7 * 60,
        days: [],
      },
    });
    const decisions = route(event, recipient, prefs, now);
    expect(decisions).toHaveLength(3);
    const keys = new Set(decisions.map((d) => d.digestWindowKey));
    expect(keys.size).toBe(1);
    const key = [...keys][0];
    expect(key).not.toBeNull();
    for (const d of decisions) {
      expect(d.cadence).toBe('daily');
      expect(d.digestWindowKey).toBe(key);
      expect(new Date(d.deliverAt).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe('route — quiet hours', () => {
  it('defers email/web_push during quiet hours; in_app stays immediate', () => {
    // Costa Rica is UTC-6 year-round. 15:00Z = 09:00 local.
    // Quiet hours 08:00–18:00 → 09:00 local is inside.
    const quietHours = {
      timezone: 'America/Costa_Rica',
      startMinute: 8 * 60,
      endMinute: 18 * 60,
      days: [] as number[],
    };
    const prefs = emptyPrefs({ quietHours });

    const decisions = route(event, recipient, prefs, now);
    const byChannel = Object.fromEntries(
      decisions.map((d) => [d.channel, d]),
    );

    expect(byChannel.in_app.cadence).toBe('instant');
    expect(byChannel.in_app.deliverAt).toBe(now.toISOString());
    expect(byChannel.in_app.digestWindowKey).toBeNull();

    const expectedEnd = nextQuietHoursEnd(quietHours, now).toISOString();
    for (const ch of ['email', 'web_push'] as const) {
      expect(byChannel[ch].cadence).toBe('instant');
      expect(byChannel[ch].deliverAt).toBe(expectedEnd);
      expect(byChannel[ch].deliverAt > now.toISOString()).toBe(true);
      expect(byChannel[ch].digestWindowKey).toBeNull();
    }
  });
});

describe('route — opt-out enforcement property', () => {
  const categories = [
    'bond',
    'transfer',
    'payment',
    'report',
    'escrow',
    'system',
  ] as const satisfies readonly NotificationCategory[];
  const channels = [
    'in_app',
    'email',
    'web_push',
  ] as const satisfies readonly NotificationChannelKind[];

  it('no returned decision channel is explicitly disabled for the recipient category', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            category: fc.constantFrom(...categories),
            channel: fc.constantFrom(...channels),
            enabled: fc.boolean(),
          }),
          { maxLength: 18 },
        ),
        fc.array(
          fc.record({
            category: fc.constantFrom(...categories),
            cadence: fc.constantFrom(
              'instant' as const,
              'daily' as const,
              'weekly' as const,
            ),
          }),
          { maxLength: 6 },
        ),
        fc.option(
          fc.record({
            timezone: fc.constantFrom('UTC', 'America/Costa_Rica'),
            startMinute: fc.integer({ min: 0, max: 1439 }),
            endMinute: fc.integer({ min: 0, max: 1439 }),
            days: fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 7 }),
          }),
          { nil: null },
        ),
        (channelPreferences, digestSettings, quietHours) => {
          const prefs: UserNotificationPreferences = {
            userId: 'user-1',
            channelPreferences,
            digestSettings,
            quietHours,
          };
          const decisions = route(event, recipient, prefs, now);
          for (const d of decisions) {
            const explicit = channelPreferences.find(
              (p) =>
                p.category === recipient.category && p.channel === d.channel,
            );
            expect(explicit?.enabled ?? true).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
