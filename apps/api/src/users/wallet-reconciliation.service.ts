import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@velar/types';
import { AuditService } from '../audit/audit.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import {
  CustodyWalletCreation,
  WalletService,
} from '../escrow/wallet.service';

/** Hard stop: do not call Friendbot again for this row. */
export const WALLET_RETRY_MAX_ATTEMPTS = 5;

/** Cap Friendbot calls per serverless invocation (~60s). Shared across profiles + parties. */
export const WALLET_RETRY_BATCH_SIZE = 10;

/**
 * Delay after N failures before the next attempt is eligible.
 * Index 0 = wait after 1st failure, … index 4 = wait after 5th (unused once MAX is hit).
 */
export const WALLET_RETRY_BACKOFF_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

const FETCH_WINDOW = 50;

export type WalletReconcileSummary = {
  profilesAttempted: number;
  partiesAttempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
};

export type ProfileWalletRetryResult = {
  id: string;
  stellar_wallet: string | null;
  stellar_wallet_status: string | null;
  stellar_network: string | null;
  stellar_created_at: string | null;
  stellar_wallet_error: string | null;
  stellar_wallet_retry_count: number;
  stellar_wallet_last_retry_at: string | null;
  previousStatus: string | null;
  partyUpdated: boolean;
  skipped?: 'not_failed' | 'max_attempts' | 'raced';
};

type FailedWalletRow = {
  id: string;
  stellar_wallet?: string | null;
  stellar_wallet_status?: string | null;
  stellar_wallet_error?: string | null;
  stellar_wallet_retry_count?: number | null;
  stellar_wallet_last_retry_at?: string | null;
  stellar_network?: string | null;
  stellar_created_at?: string | null;
};

type FailedProfileRow = FailedWalletRow & {
  email?: string | null;
  role?: string | null;
  party_id?: string | null;
};

type FailedPartyRow = FailedWalletRow & {
  code?: string | null;
};

const PROFILE_SELECT =
  'id, email, role, party_id, stellar_wallet, stellar_wallet_status, stellar_network, stellar_created_at, stellar_wallet_error, stellar_wallet_retry_count, stellar_wallet_last_retry_at';
const PARTY_SELECT =
  'id, code, stellar_wallet, stellar_wallet_status, stellar_network, stellar_created_at, stellar_wallet_error, stellar_wallet_retry_count, stellar_wallet_last_retry_at';

export function walletRetryBackoffElapsed(
  lastRetryAt: string | null | undefined,
  retryCount: number,
  nowMs = Date.now(),
): boolean {
  if (!lastRetryAt) return true;
  const idx = Math.min(Math.max(retryCount - 1, 0), WALLET_RETRY_BACKOFF_MS.length - 1);
  const waitMs = WALLET_RETRY_BACKOFF_MS[idx];
  return nowMs - Date.parse(lastRetryAt) >= waitMs;
}

function retryCountOf(row: FailedWalletRow): number {
  return row.stellar_wallet_retry_count ?? 0;
}

function isSuccessStatus(status: CustodyWalletCreation['status']): boolean {
  return status === 'created' || status === 'funded';
}

function toProfileResult(
  row: FailedProfileRow,
  partyUpdated: boolean,
  skipped?: ProfileWalletRetryResult['skipped'],
  previousStatus?: string | null,
): ProfileWalletRetryResult {
  return {
    id: row.id,
    stellar_wallet: row.stellar_wallet ?? null,
    stellar_wallet_status: row.stellar_wallet_status ?? null,
    stellar_network: row.stellar_network ?? null,
    stellar_created_at: row.stellar_created_at ?? null,
    stellar_wallet_error: row.stellar_wallet_error ?? null,
    stellar_wallet_retry_count: retryCountOf(row),
    stellar_wallet_last_retry_at: row.stellar_wallet_last_retry_at ?? null,
    previousStatus: previousStatus ?? row.stellar_wallet_status ?? null,
    partyUpdated,
    ...(skipped ? { skipped } : {}),
  };
}

@Injectable()
export class WalletReconciliationService {
  private readonly logger = new Logger(WalletReconciliationService.name);

  constructor(
    private readonly wallets: WalletService,
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Batch job for failed custodial wallets (admin HTTP or future Vercel Cron).
   * No @nestjs/schedule — that does not run on Vercel serverless.
   */
  async reconcileFailedWallets(): Promise<WalletReconcileSummary> {
    const summary: WalletReconcileSummary = {
      profilesAttempted: 0,
      partiesAttempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    const profiles = await this.loadFailedProfiles();
    const parties = await this.loadFailedParties();
    const eligibleProfiles = profiles.filter((row) => this.isBatchEligible(row));
    const eligibleParties = parties.filter((row) => this.isBatchEligible(row));
    summary.skipped =
      profiles.length - eligibleProfiles.length + (parties.length - eligibleParties.length);

    let remaining = WALLET_RETRY_BATCH_SIZE;
    const syncedPartyIds = new Set<string>();

    for (const profile of eligibleProfiles) {
      if (remaining <= 0) {
        summary.skipped += 1;
        continue;
      }
      remaining -= 1;
      summary.profilesAttempted += 1;
      const result = await this.attemptProfile(profile, {
        bypassBackoff: false,
        emitAudit: false,
      });
      if (result.skipped === 'raced' || result.skipped === 'not_failed' || result.skipped === 'max_attempts') {
        summary.skipped += 1;
        continue;
      }
      if (isSuccessStatus((result.stellar_wallet_status as CustodyWalletCreation['status']) ?? 'failed')) {
        summary.succeeded += 1;
      } else {
        summary.failed += 1;
      }
      if (result.partyUpdated && profile.party_id) {
        syncedPartyIds.add(profile.party_id);
      }
    }

    for (const party of eligibleParties) {
      if (syncedPartyIds.has(party.id)) {
        summary.skipped += 1;
        continue;
      }
      if (remaining <= 0) {
        summary.skipped += 1;
        continue;
      }
      remaining -= 1;
      summary.partiesAttempted += 1;
      const ok = await this.attemptParty(party);
      if (ok === 'skipped') {
        summary.skipped += 1;
      } else if (ok === 'success') {
        summary.succeeded += 1;
      } else {
        summary.failed += 1;
      }
    }

    await this.audit.emit({
      type: AuditEventType.WALLET_PROVISIONED,
      payload: { source: 'wallet_reconciliation_batch', ...summary },
    });
    return summary;
  }

  /**
   * Manual single-user retry (HTTP agent wires admin POST). Bypasses backoff
   * so an admin can retry immediately; still refuses rows at MAX attempts.
   */
  async retryProfile(profileId: string, actorId?: string): Promise<ProfileWalletRetryResult> {
    const profile = await this.loadProfileById(profileId);
    if (!profile) throw new NotFoundException('Usuario no encontrado');

    return this.attemptProfile(profile, { bypassBackoff: true, emitAudit: false, actorId });
  }

  private isBatchEligible(row: FailedWalletRow): boolean {
    const count = retryCountOf(row);
    if (count >= WALLET_RETRY_MAX_ATTEMPTS) return false;
    return walletRetryBackoffElapsed(row.stellar_wallet_last_retry_at, count);
  }

  private async loadFailedProfiles(): Promise<FailedProfileRow[]> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('stellar_wallet_status', 'failed')
      .lt('stellar_wallet_retry_count', WALLET_RETRY_MAX_ATTEMPTS)
      .limit(FETCH_WINDOW);
    if (error) {
      this.logger.warn(`loadFailedProfiles: ${error.message}`);
      return [];
    }
    return (data ?? []) as FailedProfileRow[];
  }

  private async loadFailedParties(): Promise<FailedPartyRow[]> {
    const { data, error } = await this.supabase.admin
      .from('parties')
      .select(PARTY_SELECT)
      .eq('stellar_wallet_status', 'failed')
      .lt('stellar_wallet_retry_count', WALLET_RETRY_MAX_ATTEMPTS)
      .limit(FETCH_WINDOW);
    if (error) {
      this.logger.warn(`loadFailedParties: ${error.message}`);
      return [];
    }
    return (data ?? []) as FailedPartyRow[];
  }

  private async loadProfileById(id: string): Promise<FailedProfileRow | null> {
    const { data, error } = await this.supabase.admin
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) {
      this.logger.warn(`loadProfileById: ${error.message}`);
      return null;
    }
    return (data as FailedProfileRow | null) ?? null;
  }

  private async attemptProfile(
    profile: FailedProfileRow,
    opts: { bypassBackoff: boolean; emitAudit: boolean; actorId?: string },
  ): Promise<ProfileWalletRetryResult> {
    if (profile.stellar_wallet_status !== 'failed') {
      return toProfileResult(profile, false, 'not_failed');
    }
    const count = retryCountOf(profile);
    if (count >= WALLET_RETRY_MAX_ATTEMPTS) {
      return toProfileResult(profile, false, 'max_attempts');
    }
    if (!opts.bypassBackoff && !walletRetryBackoffElapsed(profile.stellar_wallet_last_retry_at, count)) {
      return toProfileResult(profile, false, 'not_failed');
    }

    const previousKey = profile.stellar_wallet ?? null;
    const previousStatus = profile.stellar_wallet_status;
    const label = profile.email ?? profile.id;
    const wallet = await this.createWalletRecordSafely(label);
    const persisted = await this.persistRetry('profiles', profile.id, count, wallet);
    if (!persisted) {
      const fresh = (await this.loadProfileById(profile.id)) ?? profile;
      return toProfileResult(fresh, false, 'raced');
    }

    const partyUpdated = await this.syncPartyIfSameBrokenWallet(
      profile.party_id,
      previousKey,
      wallet,
      count,
    );

    const fresh = (await this.loadProfileById(profile.id)) ?? {
      ...profile,
      ...this.patchFromWallet(count, wallet),
    };
    if (opts.emitAudit) {
      await this.audit.emit({
        type: AuditEventType.WALLET_PROVISIONED,
        actorId: opts.actorId,
        payload: {
          source: 'wallet_reconciliation',
          targetUserId: profile.id,
          previousStatus,
          newStatus: wallet.status,
          publicKey: wallet.publicKey || null,
          error: wallet.error ?? null,
          partyUpdated,
        },
      });
    }
    return toProfileResult(fresh, partyUpdated, undefined, previousStatus);
  }

  private async attemptParty(party: FailedPartyRow): Promise<'success' | 'failed' | 'skipped'> {
    if (party.stellar_wallet_status !== 'failed') return 'skipped';
    const count = retryCountOf(party);
    if (count >= WALLET_RETRY_MAX_ATTEMPTS) return 'skipped';
    if (!walletRetryBackoffElapsed(party.stellar_wallet_last_retry_at, count)) return 'skipped';

    const wallet = await this.createWalletRecordSafely(`party:${party.code ?? party.id}`);
    const persisted = await this.persistRetry('parties', party.id, count, wallet);
    if (!persisted) return 'skipped';
    return isSuccessStatus(wallet.status) ? 'success' : 'failed';
  }

  /**
   * Always mint via createWalletRecord(label). That method uses Keypair.random(),
   * so every retry provisions a **new** keypair (even when Friendbot fails and the
   * secret is still persisted). We do not fund an existing public key here.
   */
  private async createWalletRecordSafely(label: string): Promise<CustodyWalletCreation> {
    try {
      return await this.wallets.createWalletRecord(label);
    } catch (e) {
      const error = (e as Error).message;
      this.logger.warn(`createWalletRecord threw for ${label}: ${error}`);
      return { publicKey: '', status: 'failed', network: 'testnet', error };
    }
  }

  private patchFromWallet(
    previousRetryCount: number,
    wallet: CustodyWalletCreation,
  ): Record<string, unknown> {
    const now = new Date().toISOString();
    const ok = isSuccessStatus(wallet.status);
    const patch: Record<string, unknown> = {
      stellar_wallet_status: wallet.status,
      stellar_network: wallet.network,
      stellar_wallet_error: ok ? null : (wallet.error ?? 'wallet retry failed'),
      stellar_wallet_retry_count: ok ? 0 : previousRetryCount + 1,
      stellar_wallet_last_retry_at: now,
    };
    if (wallet.publicKey) {
      patch.stellar_wallet = wallet.publicKey;
      patch.stellar_created_at = now;
    }
    return patch;
  }

  private async persistRetry(
    table: 'profiles' | 'parties',
    id: string,
    previousRetryCount: number,
    wallet: CustodyWalletCreation,
  ): Promise<boolean> {
    const patch = this.patchFromWallet(previousRetryCount, wallet);
    const { data, error } = await this.supabase.admin
      .from(table)
      .update(patch)
      .eq('id', id)
      .eq('stellar_wallet_status', 'failed')
      .select('id')
      .maybeSingle();
    if (error) {
      this.logger.warn(`persistRetry ${table}/${id}: ${error.message}`);
      return false;
    }
    return Boolean(data);
  }

  /**
   * Emisor profiles often share the custodial key with `parties`. Copy the new
   * record only when the party is clearly the same broken wallet — never clobber
   * a funded/created party wallet or a different failed key.
   */
  private async syncPartyIfSameBrokenWallet(
    partyId: string | null | undefined,
    previousProfileKey: string | null,
    wallet: CustodyWalletCreation,
    previousRetryCount: number,
  ): Promise<boolean> {
    if (!partyId) return false;
    const { data, error } = await this.supabase.admin
      .from('parties')
      .select(PARTY_SELECT)
      .eq('id', partyId)
      .maybeSingle();
    if (error || !data) return false;
    const party = data as FailedPartyRow;
    if (!this.isSameBrokenPartyWallet(party, previousProfileKey)) return false;
    return this.persistRetry('parties', party.id, previousRetryCount, wallet);
  }

  private isSameBrokenPartyWallet(party: FailedPartyRow, previousProfileKey: string | null): boolean {
    if (party.stellar_wallet_status !== 'failed') return false;
    if (!party.stellar_wallet) return true;
    return Boolean(previousProfileKey) && party.stellar_wallet === previousProfileKey;
  }
}
