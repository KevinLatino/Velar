import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { WalletReconciliationService } from './wallet-reconciliation.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@velar/types';

const FUNDED_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

type Row = Record<string, unknown>;

function createMemoryAdmin(initial: { profiles?: Row[]; parties?: Row[] }) {
  const tables: Record<string, Row[]> = {
    profiles: (initial.profiles ?? []).map((r) => ({ ...r })),
    parties: (initial.parties ?? []).map((r) => ({ ...r })),
  };

  const from = jest.fn((table: string) => createQuery(table));

  function createQuery(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let mode: 'select' | 'update' = 'select';
    let patch: Row = {};
    let limitN: number | null = null;

    const apply = () => {
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        const ids = new Set(rows.map((r) => r.id));
        tables[table] = (tables[table] ?? []).map((r) =>
          ids.has(r.id) ? { ...r, ...patch } : r,
        );
        rows = (tables[table] ?? []).filter((r) => ids.has(r.id));
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows;
    };

    const result = (single: boolean, maybe = false) => {
      const rows = apply();
      if (single || maybe) {
        const data = rows[0] ?? null;
        return {
          data,
          error: single && !data ? { message: 'not found', code: 'PGRST116' } : null,
        };
      }
      return { data: rows, error: null };
    };

    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.update = (p: Row) => {
      mode = 'update';
      patch = p;
      return q;
    };
    q.eq = (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    };
    q.neq = (col: string, val: unknown) => {
      filters.push((r) => r[col] !== val);
      return q;
    };
    q.lt = (col: string, val: unknown) => {
      filters.push((r) => Number(r[col]) < Number(val));
      return q;
    };
    q.lte = (col: string, val: unknown) => {
      filters.push((r) => Number(r[col]) <= Number(val));
      return q;
    };
    q.is = (col: string, val: unknown) => {
      filters.push((r) => (val === null ? r[col] == null : r[col] === val));
      return q;
    };
    q.in = (col: string, vals: unknown[]) => {
      filters.push((r) => vals.includes(r[col]));
      return q;
    };
    q.or = () => q;
    q.order = () => q;
    q.limit = (n: number) => {
      limitN = n;
      return q;
    };
    q.single = () => Promise.resolve(result(true));
    q.maybeSingle = () => Promise.resolve(result(true, true));
    q.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result(false)).then(onFulfilled, onRejected);

    return q;
  }

  return { from, tables };
}

/**
 * POST /users/:id/wallet/retry — admin-only + auditoría.
 * WalletService y Supabase mockeados; no hay Friendbot ni credenciales.
 */
describe('UsersService — retryWallet', () => {
  let service: UsersService;
  let audit: { emit: jest.Mock };
  let createWalletRecord: jest.Mock;
  let memory: ReturnType<typeof createMemoryAdmin>;

  beforeEach(async () => {
    createWalletRecord = jest.fn().mockResolvedValue({
      publicKey: FUNDED_PUBLIC_KEY,
      status: 'funded',
      network: 'testnet',
    });
    audit = { emit: jest.fn().mockResolvedValue(undefined) };
    memory = createMemoryAdmin({
      profiles: [
        {
          id: 'target-1',
          email: 'comprador@velar.cr',
          role: 'comprador',
          stellar_wallet: null,
          stellar_wallet_status: 'failed',
          stellar_wallet_error: 'friendbot timeout',
          stellar_wallet_retry_count: 0,
          stellar_wallet_last_retry_at: null,
        },
      ],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        WalletReconciliationService,
        { provide: SupabaseService, useValue: { admin: { from: memory.from } } },
        { provide: WalletService, useValue: { createWalletRecord } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('el admin reintenta y persiste funded/created', async () => {
    const result = await service.retryWallet('target-1', 'admin', 'admin-1');

    expect(createWalletRecord).toHaveBeenCalled();
    const updated = memory.tables.profiles[0];
    expect(updated.stellar_wallet_status).toMatch(/^(funded|created)$/);
    expect(result).toEqual(
      expect.objectContaining({
        stellar_wallet_status: expect.stringMatching(/^(funded|created)$/),
      }),
    );
  });

  it('audita con actorId del admin y targetUserId de la cuenta', async () => {
    await service.retryWallet('target-1', 'admin', 'admin-1');

    expect(audit.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        payload: expect.objectContaining({ targetUserId: 'target-1' }),
      }),
    );
  });

  it.each(['comprador', 'emisor', 'tse', 'recomprador', 'validador'] as const)(
    'rechaza al rol %s: es admin-only',
    async (role: Role) => {
      await expect(service.retryWallet('target-1', role, 'actor-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(createWalletRecord).not.toHaveBeenCalled();
      expect(audit.emit).not.toHaveBeenCalled();
    },
  );
});
