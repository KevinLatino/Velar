import type { QuietHours } from '@velar/types';
import { DateTime } from 'luxon';

/** Luxon weekday is 1=Monday..7=Sunday; QuietHours.days uses 0=Sunday..6=Saturday. */
function toSundayBasedDay(luxonWeekday: number): number {
  return luxonWeekday % 7;
}

function minuteOfDay(dt: DateTime): number {
  return dt.hour * 60 + dt.minute;
}

function isInMinuteWindow(
  minute: number,
  startMinute: number,
  endMinute: number,
): boolean {
  if (endMinute < startMinute) {
    // Overnight wraparound, e.g. 22:00 → 07:00
    return minute >= startMinute || minute < endMinute;
  }
  // Normal same-day window; start inclusive, end exclusive
  return minute >= startMinute && minute < endMinute;
}

/**
 * Day that "owns" the quiet-hours window for `dt`.
 * For an overnight window past midnight (minuteOfDay < endMinute), the owning
 * day is the previous local calendar day — e.g. Saturday 02:00 still belongs
 * to Friday's 22:00→07:00 window when `days` only lists Friday.
 */
function owningDay(
  dt: DateTime,
  startMinute: number,
  endMinute: number,
): number {
  const day = toSundayBasedDay(dt.weekday);
  const wraps = endMinute < startMinute;
  if (wraps && minuteOfDay(dt) < endMinute) {
    return (day + 6) % 7; // previous day
  }
  return day;
}

export function isWithinQuietHours(
  quietHours: QuietHours,
  instant: Date,
): boolean {
  const dt = DateTime.fromJSDate(instant, { zone: quietHours.timezone });
  if (!dt.isValid) {
    return false;
  }

  const minute = minuteOfDay(dt);
  if (!isInMinuteWindow(minute, quietHours.startMinute, quietHours.endMinute)) {
    return false;
  }

  if (quietHours.days.length === 0) {
    return true; // empty days = every day
  }

  const day = owningDay(dt, quietHours.startMinute, quietHours.endMinute);
  return quietHours.days.includes(day);
}

/**
 * If `instant` is within quiet hours, return the instant quiet hours end
 * (local wall-clock `endMinute` on the correct day in `quietHours.timezone`).
 * Otherwise return `instant` unchanged.
 *
 * Uses luxon zone-aware setters so a DST transition inside the window still
 * yields the correct local wall-clock end (e.g. 07:00 local), not a fixed
 * UTC-offset duration from the window start.
 */
export function nextQuietHoursEnd(
  quietHours: QuietHours,
  instant: Date,
): Date {
  if (!isWithinQuietHours(quietHours, instant)) {
    return instant;
  }

  const dt = DateTime.fromJSDate(instant, { zone: quietHours.timezone });
  const minute = minuteOfDay(dt);
  const { startMinute, endMinute } = quietHours;
  const wraps = endMinute < startMinute;

  const endHour = Math.floor(endMinute / 60);
  const endMin = endMinute % 60;

  // Evening portion of an overnight window: end is tomorrow at endMinute.
  // After-midnight portion (or non-wrapping): end is today at endMinute.
  const endBase =
    wraps && minute >= startMinute ? dt.plus({ days: 1 }) : dt;

  return endBase
    .set({ hour: endHour, minute: endMin, second: 0, millisecond: 0 })
    .toJSDate();
}
