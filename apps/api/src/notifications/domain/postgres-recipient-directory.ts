import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@velar/types';
import { SupabaseService } from '../../common/supabase/supabase.service';
import {
  categoryForEvent,
  type RecipientCandidate,
  type RecipientDirectory,
} from './recipients.interface';

@Injectable()
export class PostgresRecipientDirectory implements RecipientDirectory {
  constructor(private readonly supabase: SupabaseService) {}

  async resolveForEvent(event: DomainEvent): Promise<RecipientCandidate[]> {
    const category = categoryForEvent(event);
    const payload = event.payload ?? {};

    switch (event.aggregateType) {
      case 'bond': {
        const owner = payload.currentOwner;
        if (typeof owner !== 'string' || !owner) return [];
        return [{ userId: owner, category }];
      }

      case 'transfer': {
        const from =
          typeof payload.fromOwner === 'string' ? payload.fromOwner : null;
        const to =
          typeof payload.toOwner === 'string' ? payload.toOwner : null;
        const ids = [...new Set([from, to].filter((id): id is string => !!id))];
        return ids.map((userId) => ({ userId, category }));
      }

      case 'report': {
        const partyId =
          typeof payload.partyId === 'string' ? payload.partyId : null;
        const [partyIds, tseIds] = await Promise.all([
          partyId ? this.partyMemberIds(partyId) : Promise.resolve([] as string[]),
          this.tseUserIds(),
        ]);
        const ids = [...new Set([...partyIds, ...tseIds])];
        return ids.map((userId) => ({ userId, category }));
      }

      default:
        return [];
    }
  }

  /** Same shape as report-lifecycle.service.ts::tseUserIds(). */
  private async tseUserIds(): Promise<string[]> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id')
      .eq('role', 'tse');
    if (error) {
      throw new Error(
        `PostgresRecipientDirectory.tseUserIds failed: ${error.message}`,
      );
    }
    return (data ?? []).map((p: { id: string }) => p.id);
  }

  private async partyMemberIds(partyId: string): Promise<string[]> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select('id')
      .eq('party_id', partyId);
    if (error) {
      throw new Error(
        `PostgresRecipientDirectory.partyMemberIds failed: ${error.message}`,
      );
    }
    return (data ?? []).map((p: { id: string }) => p.id);
  }
}
