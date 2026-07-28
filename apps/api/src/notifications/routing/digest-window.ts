import type { DigestCadence } from '@velar/types';
import { DateTime } from 'luxon';

/**
 * Stable coalescing key for the digest window containing `instant` in `timezone`.
 *
 * - `'daily'`: local calendar date `YYYY-MM-DD`
 * - `'weekly'`: local ISO week `YYYY-Www` (ISO week-numbering year via luxon `kkkk`)
 * - `'instant'`: should not be called by the routing engine's instant path; if
 *   called anyway, returns the ISO instant itself as a degenerate "window of one"
 */
export function digestWindowKey(
  cadence: DigestCadence,
  instant: Date,
  timezone: string,
): string {
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  switch (cadence) {
    case 'daily':
      return dt.toFormat('yyyy-LL-dd');
    case 'weekly':
      // kkkk = ISO week-year; WW = ISO week. Near year-end this can be e.g.
      // 2025-W01 for a late-December date that falls in next year's week 1.
      return dt.toFormat("kkkk-'W'WW");
    case 'instant':
      return instant.toISOString();
  }
}

/**
 * Exclusive end of the digest window containing `instant` in `timezone`.
 *
 * - `'daily'`: start of the next local calendar day (correct across 23h/25h DST days)
 * - `'weekly'`: start of the next local ISO week (luxon `startOf('week')` = Monday)
 * - `'instant'`: not used by the routing engine; returns `instant` unchanged
 */
export function digestWindowEnd(
  cadence: DigestCadence,
  instant: Date,
  timezone: string,
): Date {
  const dt = DateTime.fromJSDate(instant, { zone: timezone });
  switch (cadence) {
    case 'daily':
      return dt.plus({ days: 1 }).startOf('day').toJSDate();
    case 'weekly':
      return dt.plus({ weeks: 1 }).startOf('week').toJSDate();
    case 'instant':
      return instant;
  }
}
