import { Test, TestingModule } from '@nestjs/testing';
import {
  WALLET_RETRY_MAX_ATTEMPTS,
  WalletReconciliationService,
} from './wallet-reconciliation.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';
import { AuditService } from '../audit/audit.service';

const FUNDED_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

type Row = Record<string, unknown>;

/**
 * Cadena mínima estilo PostgREST: select/eq/lt/update/limit/single.
 * Sin cliente real de Supabase ni credenciales.
 */
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
    q.gt = (col: string, val: unknown) => {
      filters.push((r) => String(r[col] ?? '') > String(val));
      return q;
    };
    q.gte = (col: string, val: unknown) => {
      filters.push((r) => String(r[col] ?? '') >= String(val));
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

  return {
    from,
    tables,
    expireBackoff(table: string) {
      tables[table] = tables[table].map((r) => ({
        ...r,
        stellar_wallet_last_retry_at: '2020-01-01T00:00:00.000Z',
      }));
    },
  };
}

function failedProfile(overrides: Row = {}): Row {
  return {
    id: 'profile-failed-1',
    email: 'stuck@velar.cr',
    stellar_wallet: null,
    stellar_wallet_status: 'failed',
    stellar_wallet_error: 'friendbot timeout',
    stellar_wallet_retry_count: 0,
    stellar_wallet_last_retry_at: null,
    stellar_network: null,
    ...overrides,
  };
}

describe('WalletReconciliationService', () => {
  let service: WalletReconciliationService;
  let createWalletRecord: jest.Mock;
  let audit: { emit: jest.Mock };
  let memory: ReturnType<typeof createMemoryAdmin>;

  async function compile(profiles: Row[], parties: Row[] = []) {
    createWalletRecord = jest.fn();
    audit = { emit: jest.fn().mockResolvedValue(undefined) };
    memory = createMemoryAdmin({ profiles, parties });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletReconciliationService,
        { provide: SupabaseService, useValue: { admin: { from: memory.from } } },
        { provide: WalletService, useValue: { createWalletRecord } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(WalletReconciliationService);
  }

  describe('reconcileFailedWallets — failed → funded', () => {
    it('persiste status funded cuando createWalletRecord (mock) financia la cuenta', async () => {
      await compile([failedProfile()]);
      createWalletRecord.mockResolvedValue({
        publicKey: FUNDED_PUBLIC_KEY,
        status: 'funded',
        network: 'testnet',
      });

      await service.reconcileFailedWallets();

      expect(createWalletRecord).toHaveBeenCalledTimes(1);
      const updated = memory.tables.profiles[0];
      expect(updated.stellar_wallet_status).toMatch(/^(funded|created)$/);
      expect(updated.stellar_wallet).toBe(FUNDED_PUBLIC_KEY);
    });
  });

  describe('retryProfile — failed → funded', () => {
    it('actualiza el perfil a funded/created con la clave mockeada', async () => {
      await compile([failedProfile()]);
      createWalletRecord.mockResolvedValue({
        publicKey: FUNDED_PUBLIC_KEY,
        status: 'funded',
        network: 'testnet',
      });

      await service.retryProfile('profile-failed-1');

      expect(createWalletRecord).toHaveBeenCalled();
      const updated = memory.tables.profiles[0];
      expect(updated.stellar_wallet_status).toMatch(/^(funded|created)$/);
      expect(updated.stellar_wallet).toBe(FUNDED_PUBLIC_KEY);
    });
  });

  describe('reintentos acotados', () => {
    it('no llama createWalletRecord si retry_count ya está en MAX', async () => {
      const max = WALLET_RETRY_MAX_ATTEMPTS;
      await compile([
        failedProfile({
          stellar_wallet_retry_count: max,
          stellar_wallet_last_retry_at: '2020-01-01T00:00:00.000Z',
        }),
      ]);
      createWalletRecord.mockResolvedValue({
        publicKey: FUNDED_PUBLIC_KEY,
        status: 'failed',
        network: 'testnet',
        error: 'still down',
      });

      await service.reconcileFailedWallets();

      expect(createWalletRecord).not.toHaveBeenCalled();
      expect(memory.tables.profiles[0].stellar_wallet_retry_count).toBe(max);
    });

    it('deja de reintentar al llegar a MAX aunque el mock falle siempre', async () => {
      const max = WALLET_RETRY_MAX_ATTEMPTS;
      await compile([failedProfile()]);
      createWalletRecord.mockResolvedValue({
        publicKey: FUNDED_PUBLIC_KEY,
        status: 'failed',
        network: 'testnet',
        error: 'permanent',
      });

      for (let i = 0; i < max + 8; i++) {
        memory.expireBackoff('profiles');
        memory.expireBackoff('parties');
        await service.reconcileFailedWallets();
      }

      expect(createWalletRecord.mock.calls.length).toBeLessThanOrEqual(max);
      expect(createWalletRecord).toHaveBeenCalled();
      expect(Number(memory.tables.profiles[0].stellar_wallet_retry_count)).toBeLessThanOrEqual(max);
      expect(Number(memory.tables.profiles[0].stellar_wallet_retry_count)).toBe(max);
    });
  });

  describe('backoff', () => {
    it('omite filas con last_retry_at reciente', async () => {
      await compile([
        failedProfile({
          stellar_wallet_retry_count: 1,
          stellar_wallet_last_retry_at: new Date().toISOString(),
        }),
      ]);
      createWalletRecord.mockResolvedValue({
        publicKey: FUNDED_PUBLIC_KEY,
        status: 'funded',
        network: 'testnet',
      });

      await service.reconcileFailedWallets();

      expect(createWalletRecord).not.toHaveBeenCalled();
      expect(memory.tables.profiles[0].stellar_wallet_status).toBe('failed');
    });
  });
});
