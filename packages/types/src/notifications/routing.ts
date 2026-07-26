import type { NotificationChannelKind, DigestCadence } from './preferences';

export interface RoutingDecision {
  channel: NotificationChannelKind;
  cadence: DigestCadence;
  deliverAt: string; // ISO-8601
  digestWindowKey: string | null;
}
