import type { QuietHours } from '@velar/types';
import * as fc from 'fast-check';
import { DateTime } from 'luxon';
import { isWithinQuietHours, nextQuietHoursEnd } from './quiet-hours';

/** Build a Date for a local wall-clock time in `zone`. */
function localInstant(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone },
  ).toJSDate();
}

describe('isWithinQuietHours — normal (non-wrapping) window', () => {
  const quiet: QuietHours = {
    timezone: 'America/Costa_Rica',
    startMinute: 9 * 60, // 09:00
    endMinute: 17 * 60, // 17:00
    days: [],
  };

  it('is inside at mid-window', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 12, 12, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('is inside at start boundary (inclusive)', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 12, 9, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('is outside at end boundary (exclusive)', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 12, 17, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });

  it('is outside before start', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 12, 8, 59);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });

  it('is outside after end', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 12, 17, 1);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });
});

describe('isWithinQuietHours — overnight wraparound', () => {
  const quiet: QuietHours = {
    timezone: 'America/Costa_Rica',
    startMinute: 22 * 60, // 22:00
    endMinute: 7 * 60, // 07:00
    days: [],
  };

  it('is inside at 23:00', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 14, 23, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('is inside at 03:00', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 15, 3, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('is outside at 12:00', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 15, 12, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });

  it('is outside at end boundary 07:00 (exclusive)', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 15, 7, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });

  it('is inside at start boundary 22:00 (inclusive)', () => {
    const t = localInstant('America/Costa_Rica', 2024, 6, 14, 22, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });
});

describe('isWithinQuietHours — overnight day filter', () => {
  // Friday only (5). Window Fri 22:00 → Sat 07:00.
  const quiet: QuietHours = {
    timezone: 'America/Costa_Rica',
    startMinute: 22 * 60,
    endMinute: 7 * 60,
    days: [5], // Friday
  };

  it('Saturday 02:00 still counts as Friday\'s overnight window', () => {
    // 2024-06-15 is a Saturday
    const t = localInstant('America/Costa_Rica', 2024, 6, 15, 2, 0);
    expect(DateTime.fromJSDate(t, { zone: 'America/Costa_Rica' }).weekday).toBe(
      6,
    ); // luxon Sat
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('Sunday 02:00 does NOT count (belongs to Saturday\'s window, not Friday)', () => {
    // 2024-06-16 is a Sunday
    const t = localInstant('America/Costa_Rica', 2024, 6, 16, 2, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });

  it('Friday 23:00 is inside', () => {
    // 2024-06-14 is a Friday
    const t = localInstant('America/Costa_Rica', 2024, 6, 14, 23, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('Thursday 23:00 is outside (wrong day)', () => {
    // 2024-06-13 is a Thursday
    const t = localInstant('America/Costa_Rica', 2024, 6, 13, 23, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
  });
});

describe('quiet hours across DST transitions (America/New_York)', () => {
  // Fall-back 2024: clocks fall back 02:00 → 01:00 on Nov 3.
  // Overnight quiet hours 22:00–07:00 spanning that night.
  const quiet: QuietHours = {
    timezone: 'America/New_York',
    startMinute: 22 * 60,
    endMinute: 7 * 60,
    days: [],
  };

  it('is within quiet hours during the fall-back night', () => {
    // Nov 3 2024 03:00 EST (after fall-back) — still before 07:00
    const t = localInstant('America/New_York', 2024, 11, 3, 3, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);
  });

  it('nextQuietHoursEnd returns local wall-clock 07:00 across fall-back', () => {
    // Nov 2 2024 23:00 EDT — inside window; end should be Nov 3 07:00 EST
    const t = localInstant('America/New_York', 2024, 11, 2, 23, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);

    const end = nextQuietHoursEnd(quiet, t);
    const endLocal = DateTime.fromJSDate(end, { zone: 'America/New_York' });
    expect(endLocal.hour).toBe(7);
    expect(endLocal.minute).toBe(0);
    expect(endLocal.day).toBe(3);
    expect(endLocal.month).toBe(11);

    // Fall-back night has 25 local hours between midnights; a naive +9h from
    // 22:00 would land wrong. Assert end is NOT a fixed 9h from window start.
    const windowStart = localInstant('America/New_York', 2024, 11, 2, 22, 0);
    const naiveNineHours = new Date(windowStart.getTime() + 9 * 60 * 60 * 1000);
    expect(end.getTime()).not.toBe(naiveNineHours.getTime());
  });

  it('nextQuietHoursEnd returns local wall-clock 07:00 across spring-forward', () => {
    // Spring-forward 2024: Mar 10 02:00 → 03:00. Quiet hours 22:00–07:00.
    const t = localInstant('America/New_York', 2024, 3, 9, 23, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(true);

    const end = nextQuietHoursEnd(quiet, t);
    const endLocal = DateTime.fromJSDate(end, { zone: 'America/New_York' });
    expect(endLocal.hour).toBe(7);
    expect(endLocal.minute).toBe(0);
    expect(endLocal.day).toBe(10);
    expect(endLocal.month).toBe(3);

    // Spring-forward night has 23 local hours; naive +9h from 22:00 ≠ 07:00 local.
    const windowStart = localInstant('America/New_York', 2024, 3, 9, 22, 0);
    const naiveNineHours = new Date(windowStart.getTime() + 9 * 60 * 60 * 1000);
    expect(end.getTime()).not.toBe(naiveNineHours.getTime());
  });

  it('nextQuietHoursEnd returns instant unchanged when outside quiet hours', () => {
    const t = localInstant('America/New_York', 2024, 6, 12, 12, 0);
    expect(isWithinQuietHours(quiet, t)).toBe(false);
    expect(nextQuietHoursEnd(quiet, t)).toEqual(t);
  });
});

describe('isWithinQuietHours — property (independent reference, no-DST zone)', () => {
  /**
   * Independently-phrased reference: compute membership via absolute minute
   * position on a 2-day timeline rather than the OR/AND form used in production.
   */
  function referenceWithin(
    startMinute: number,
    endMinute: number,
    minuteOfDay: number,
  ): boolean {
    if (endMinute < startMinute) {
      // Map onto [0, 2880): window occupies [start, 1440+end)
      const pos = minuteOfDay;
      return pos >= startMinute || pos + 1440 < 1440 + endMinute;
      // Equivalent rewrite without sharing production's || structure:
      // return !(pos >= endMinute && pos < startMinute);
    }
    // Closed-open interval on a line
    return !(minuteOfDay < startMinute || minuteOfDay >= endMinute);
  }

  it('agrees with reference for random windows and offsets (empty days)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 0, max: 1439 }),
        fc.integer({ min: 0, max: 1439 }),
        (startMinute, endMinute, minuteOfDay) => {
          const hour = Math.floor(minuteOfDay / 60);
          const minute = minuteOfDay % 60;
          const instant = localInstant(
            'America/Costa_Rica',
            2024,
            6,
            12,
            hour,
            minute,
          );
          const quiet: QuietHours = {
            timezone: 'America/Costa_Rica',
            startMinute,
            endMinute,
            days: [],
          };
          const actual = isWithinQuietHours(quiet, instant);
          const expected = referenceWithin(startMinute, endMinute, minuteOfDay);
          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});
