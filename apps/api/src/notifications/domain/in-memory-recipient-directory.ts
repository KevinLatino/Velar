import type { DomainEvent } from '@velar/types';
import {
  categoryForEvent,
  type RecipientCandidate,
  type RecipientDirectory,
} from './recipients.interface';

/**
 * Seed map: aggregateId or partyId → userIds.
 * Report events also fan out to `tseUserIds`.
 */
export class InMemoryRecipientDirectory implements RecipientDirectory {
  constructor(
    private readonly seed: Map<string, string[]> = new Map(),
    private readonly tseUserIds: string[] = [],
  ) {}

  async resolveForEvent(event: DomainEvent): Promise<RecipientCandidate[]> {
    const category = categoryForEvent(event);
    const userIds = new Set<string>();

    const addFromKey = (key: string | undefined | null) => {
      if (!key) return;
      for (const id of this.seed.get(key) ?? []) {
        userIds.add(id);
      }
    };

    addFromKey(event.aggregateId);

    const payload = event.payload as Record<string, unknown>;
    for (const field of [
      'currentOwner',
      'issuerPartyId',
      'fromOwner',
      'toOwner',
      'partyId',
    ] as const) {
      const value = payload[field];
      if (typeof value === 'string') {
        addFromKey(value);
      }
    }

    if (event.eventType.startsWith('report.')) {
      for (const id of this.tseUserIds) {
        userIds.add(id);
      }
    }

    return [...userIds].map((userId) => ({ userId, category }));
  }
}
