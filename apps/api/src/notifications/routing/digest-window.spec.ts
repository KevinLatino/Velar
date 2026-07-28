import type { DigestCadence } from '@velar/types';
import * as fc from 'fast-check';
import { DateTime } from 'luxon';
import { digestWindowEnd, digestWindowKey } from './digest-window';

function localInstant(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
): Date {
  return DateTime.fromObject(
    { year, month, day, hour, minute, second, millisecond: 0 },
    { zone },
  ).toJSDate();
}

describe('digestWindowKey — daily stability', () => {
  const tz = 'America/Costa_Rica';

  it('two instants on the same local calendar day share a key', () => {
    const a = localInstant(tz, 2024, 6, 12, 1, 0);
    const b = localInstant(tz, 2024, 6, 12, 23, 59);
    expect(digestWindowKey('daily', a, tz)).toBe('2024-06-12');
    expect(digestWindowKey('daily', b, tz)).toBe(
      digestWindowKey('daily', a, tz),
    );
  });

  it('instants just before/after local midnight produce different keys', () => {
    const before = localInstant(tz, 2024, 6, 12, 23, 59);
    const after = localInstant(tz, 2024, 6, 13, 0, 0);
    expect(digestWindowKey('daily', before, tz)).toBe('2024-06-12');
    expect(digestWindowKey('daily', after, tz)).toBe('2024-06-13');
  });
});

describe('digestWindowEnd — daily across DST', () => {
  const tz = 'America/New_York';

  it('fall-back day end is next local midnight (00:00), not +24h UTC', () => {
    // 2024-11-03 is the fall-back day (25 local hours).
    const instant = localInstant(tz, 2024, 11, 3, 10, 0);
    const end = digestWindowEnd('daily', instant, tz);
    const endLocal = DateTime.fromJSDate(end, { zone: tz });

    expect(endLocal.year).toBe(2024);
    expect(endLocal.month).toBe(11);
    expect(endLocal.day).toBe(4);
    expect(endLocal.hour).toBe(0);
    expect(endLocal.minute).toBe(0);
    expect(endLocal.second).toBe(0);

    const plus24h = new Date(instant.getTime() + 24 * 60 * 60 * 1000);
    // End-of-day boundary from 10:00 is 14h later on a normal day, but the
    // key assertion is that wall-clock is midnight — and on the transition
    // day the UTC span from local midnight→midnight is 25h, not 24h.
    const dayStart = localInstant(tz, 2024, 11, 3, 0, 0);
    const nextMidnight = localInstant(tz, 2024, 11, 4, 0, 0);
    expect(nextMidnight.getTime() - dayStart.getTime()).toBe(
      25 * 60 * 60 * 1000,
    );
    expect(end.getTime()).toBe(nextMidnight.getTime());
    expect(end.getTime()).not.toBe(plus24h.getTime());
  });

  it('spring-forward day end is next local midnight (00:00)', () => {
    // 2024-03-10 is the spring-forward day (23 local hours).
    const instant = localInstant(tz, 2024, 3, 10, 10, 0);
    const end = digestWindowEnd('daily', instant, tz);
    const endLocal = DateTime.fromJSDate(end, { zone: tz });

    expect(endLocal.year).toBe(2024);
    expect(endLocal.month).toBe(3);
    expect(endLocal.day).toBe(11);
    expect(endLocal.hour).toBe(0);
    expect(endLocal.minute).toBe(0);

    const dayStart = localInstant(tz, 2024, 3, 10, 0, 0);
    const nextMidnight = localInstant(tz, 2024, 3, 11, 0, 0);
    expect(nextMidnight.getTime() - dayStart.getTime()).toBe(
      23 * 60 * 60 * 1000,
    );
    expect(end.getTime()).toBe(nextMidnight.getTime());
  });
});

describe('digestWindowKey / End — weekly year boundary', () => {
  const tz = 'UTC';

  it('late December date in ISO week 1 of the following year uses ISO week-year', () => {
    // 2024-12-30 is a Monday = start of ISO week 1 of 2025
    const instant = localInstant(tz, 2024, 12, 30, 12, 0);
    const dt = DateTime.fromJSDate(instant, { zone: tz });
    expect(dt.weekYear).toBe(2025);
    expect(dt.weekNumber).toBe(1);

    const key = digestWindowKey('weekly', instant, tz);
    expect(key).toBe('2025-W01');
    // Must NOT be keyed by naive calendar year 2024
    expect(key.startsWith('2024')).toBe(false);

    const end = digestWindowEnd('weekly', instant, tz);
    const endLocal = DateTime.fromJSDate(end, { zone: tz });
    // Next ISO week starts Monday 2025-01-06
    expect(endLocal.toISODate()).toBe('2025-01-06');
    expect(endLocal.weekday).toBe(1);
    expect(endLocal.hour).toBe(0);
  });

  it('a mid-week date shares the week key with Monday of that ISO week', () => {
    const monday = localInstant(tz, 2024, 6, 10, 0, 0); // Monday
    const wednesday = localInstant(tz, 2024, 6, 12, 15, 0);
    expect(digestWindowKey('weekly', monday, tz)).toBe(
      digestWindowKey('weekly', wednesday, tz),
    );
    expect(digestWindowKey('weekly', wednesday, tz)).toBe('2024-W24');
  });
});

describe('digest window coalescing property', () => {
  it('end is strictly after instant; any instant in [instant, end) shares the key', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<DigestCadence>('daily', 'weekly'),
        fc.constantFrom('UTC', 'America/Costa_Rica', 'America/New_York'),
        fc.integer({
          min: Date.parse('2023-01-01T00:00:00Z'),
          max: Date.parse('2026-12-31T23:59:59Z'),
        }),
        fc.integer({ min: 1, max: 50 }),
        (cadence, tz, epochMs, sampleCount) => {
          const instant = new Date(epochMs);
          const end = digestWindowEnd(cadence, instant, tz);
          expect(end.getTime()).toBeGreaterThan(instant.getTime());

          const key = digestWindowKey(cadence, instant, tz);
          const span = end.getTime() - instant.getTime();

          for (let i = 0; i < sampleCount; i += 1) {
            // Sample strictly inside [instant, end)
            const offset =
              sampleCount === 1
                ? 0
                : Math.floor((span - 1) * (i / (sampleCount - 1)));
            const probe = new Date(instant.getTime() + offset);
            if (probe.getTime() >= end.getTime()) continue;
            expect(digestWindowKey(cadence, probe, tz)).toBe(key);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
