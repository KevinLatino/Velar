import type { NotificationChannelKind, DigestCadence } from './preferences';
export interface RoutingDecision {
    channel: NotificationChannelKind;
    cadence: DigestCadence;
    deliverAt: string;
    digestWindowKey: string | null;
}
