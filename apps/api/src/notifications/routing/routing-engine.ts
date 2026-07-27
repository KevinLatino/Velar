import type {
  NotificationChannelKind,
  RoutingDecision,
} from '@velar/types';
import type { RouteFn } from '../outbox/dispatcher';
import { digestWindowEnd, digestWindowKey } from './digest-window';
import { isWithinQuietHours, nextQuietHoursEnd } from './quiet-hours';

const CANDIDATE_CHANNELS = [
  'in_app',
  'email',
  'web_push',
] as const satisfies readonly NotificationChannelKind[];

/**
 * Pure preference/routing engine: decides which channels fire for an
 * event+recipient, honoring per-category/per-channel opt-outs, quiet hours,
 * and digest cadence. No I/O; `now` is injected for determinism.
 */
export const route: RouteFn = (_event, recipient, prefs, now) => {
  // Home timezone for digest windowing: reuse quiet-hours timezone when set
  // (preferences have no separate timezone field); fall back to UTC.
  const homeTz = prefs.quietHours?.timezone ?? 'UTC';

  const decisions: RoutingDecision[] = [];

  for (const channel of CANDIDATE_CHANNELS) {
    const pref = prefs.channelPreferences.find(
      (p) => p.category === recipient.category && p.channel === channel,
    );
    // Absence of an explicit row means enabled by default (matches DB default
    // and InMemoryPreferencesStore).
    const enabled = pref ? pref.enabled : true;
    if (!enabled) {
      continue;
    }

    const setting = prefs.digestSettings.find(
      (d) => d.category === recipient.category,
    );
    const cadence = setting?.cadence ?? 'instant';

    if (cadence !== 'instant') {
      decisions.push({
        channel,
        cadence,
        deliverAt: digestWindowEnd(cadence, now, homeTz).toISOString(),
        digestWindowKey: digestWindowKey(cadence, now, homeTz),
      });
      continue;
    }

    // Quiet hours only defer interruptive channels (email / web_push).
    // in_app is a passive inbox item, not an interruption, so quiet hours
    // do not apply to it.
    const isInterruptive = channel === 'email' || channel === 'web_push';
    if (
      isInterruptive &&
      prefs.quietHours &&
      isWithinQuietHours(prefs.quietHours, now)
    ) {
      decisions.push({
        channel,
        cadence: 'instant' as const,
        deliverAt: nextQuietHoursEnd(prefs.quietHours, now).toISOString(),
        digestWindowKey: null,
      });
      continue;
    }

    decisions.push({
      channel,
      cadence: 'instant' as const,
      deliverAt: now.toISOString(),
      digestWindowKey: null,
    });
  }

  return decisions;
};
