import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExplorerService } from './explorer.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';

/**
 * Mockea el query builder fluido de Supabase: cada método de la cadena
 * devuelve el mismo objeto, que además es "thenable" (como el builder real)
 * para poder hacer `await db.from(...).select()...` sin llamar `.single()`.
 */
function chain(result: { data?: any; error?: any; count?: number | null }) {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    ilike: jest.fn(() => obj),
    in: jest.fn(() => obj),
    or: jest.fn(() => obj),
    not: jest.fn(() => obj),
    order: jest.fn(() => obj),
    range: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

describe('ExplorerService', () => {
  let service: ExplorerService;
  let fromMock: jest.Mock;

  beforeEach(async () => {
    fromMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExplorerService,
        { provide: SupabaseService, useValue: { admin: { from: fromMock } } },
        { provide: WalletService, useValue: { platformAddress: 'GPLATFORM', escrowAddress: 'GESCROW' } },
      ],
    }).compile();

    service = module.get(ExplorerService);
  });

  describe('snapshot', () => {
    it('pagina las listas y calcula stats sobre toda la tabla, no solo la página', async () => {
      fromMock
        // recent_bonds (página)
        .mockReturnValueOnce(chain({
          data: [{ bond_id: 'B-1', status: 'activo', face_value: 1000, currency: 'CRC', soroban_contract_id: 'C1', created_at: 't', parties: { name: 'Partido X' } }],
        }))
        // total_bonds (count exacto)
        .mockReturnValueOnce(chain({ count: 42 }))
        // todos los face_value, para el total emitido
        .mockReturnValueOnce(chain({ data: [{ face_value: 1000 }, { face_value: 2000 }] }))
        // transfers liberadas, para ventas/volumen
        .mockReturnValueOnce(chain({ data: [{ amount: 500 }, { amount: 1500 }] }))
        // soroban_nfts (página)
        .mockReturnValueOnce(chain({ data: [{ soroban_contract_id: 'C1', bond_id: 'B-1' }] }))
        // soroban count
        .mockReturnValueOnce(chain({ count: 5 }))
        // trustless_work_contracts (página)
        .mockReturnValueOnce(chain({ data: [{ escrow_contract_id: 'E1', id: 't1', status: 'liberada', bonds: { bond_id: 'B-1' } }] }))
        // trustless work count
        .mockReturnValueOnce(chain({ count: 7 }));

      const result = await service.snapshot('1', '20');

      expect(result.stats).toEqual({
        total_bonds: 42,
        total_emitted_crc: 3000,
        total_sales: 2,
        total_volume_crc: 2000,
        sorobanContracts: 5,
        trustlessWorkContracts: 7,
      });
      expect(result.recent_bonds).toEqual({
        data: [{
          bond_id: 'B-1',
          party: 'Partido X',
          face_value: 1000,
          currency: 'CRC',
          status: 'activo',
          asset_url: expect.stringContaining('B1-GPLATFORM'),
          soroban_contract_url: expect.stringContaining('C1'),
          soroban_contract_id: 'C1',
        }],
        total: 42,
        page: 1,
        limit: 20,
      });
      expect(result.soroban_nfts.total).toBe(5);
      expect(result.trustless_work_contracts.total).toBe(7);
    });
  });

  describe('findBondDetail', () => {
    it('devuelve el bono con partido, dueño, historial y links on-chain', async () => {
      fromMock
        .mockReturnValueOnce(chain({
          data: {
            token_id: 'tok-1',
            bond_id: 'B-1',
            status: 'activo',
            face_value: 1000,
            currency: 'CRC',
            document_hash: 'hash',
            soroban_contract_id: 'C1',
            created_at: 't1',
            updated_at: 't2',
            parties: { name: 'Partido X', code: 'PX', stellar_wallet: 'GPARTY' },
            profiles: { id: 'u1', full_name: 'Juan', email: 'j@x.com', stellar_wallet: 'GUSER' },
          },
        }))
        .mockReturnValueOnce(chain({
          data: [{
            id: 'tr-1',
            status: 'liberada',
            amount: 500,
            escrow_contract_id: 'ESC1',
            payment_evidence_hash: 'ph',
            created_at: 'ta',
            updated_at: 'tb',
            from_profile: { id: 'u0', full_name: 'Vendedor', email: 'v@x.com' },
            to_profile: { id: 'u1', full_name: 'Juan', email: 'j@x.com' },
          }],
        }));

      const result = await service.findBondDetail('B-1');

      expect(result.party).toEqual({ name: 'Partido X', code: 'PX', wallet: 'GPARTY' });
      expect(result.current_owner).toEqual({ id: 'u1', name: 'Juan', email: 'j@x.com', wallet: 'GUSER' });
      expect(result.soroban_contract_url).toContain('C1');
      expect(result.trustless_work_contracts).toEqual([
        { transfer_id: 'tr-1', status: 'liberada', contract_id: 'ESC1', url: expect.stringContaining('ESC1') },
      ]);
      expect(result.transfers).toHaveLength(1);
      expect(result.transfers[0].from).toEqual({ id: 'u0', name: 'Vendedor' });
      expect(result.transfers[0].to).toEqual({ id: 'u1', name: 'Juan' });
    });

    it('lanza 404 cuando el bono no existe', async () => {
      fromMock.mockReturnValueOnce(chain({ data: null, error: null }));

      await expect(service.findBondDetail('no-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    it('rechaza una búsqueda vacía sin consultar la base', async () => {
      await expect(service.search('  ')).rejects.toThrow(BadRequestException);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('combina resultados por bond_id y por partido, sin duplicados', async () => {
      const bondRow = {
        bond_id: 'B-1', status: 'activo', face_value: 1000, currency: 'CRC',
        soroban_contract_id: null, created_at: 't', parties: { name: 'Partido X' },
      };
      fromMock
        // by bond_id
        .mockReturnValueOnce(chain({ data: [bondRow] }))
        // parties by name
        .mockReturnValueOnce(chain({ data: [{ id: 'p1' }] }))
        // parties by wallet
        .mockReturnValueOnce(chain({ data: [] }))
        // profiles by wallet
        .mockReturnValueOnce(chain({ data: [] }))
        // bonds by party id (mismo bono, debe deduplicarse)
        .mockReturnValueOnce(chain({ data: [bondRow] }));

      const result = await service.search('Partido X');

      expect(result.count).toBe(1);
      expect(result.results).toEqual([{
        bond_id: 'B-1',
        party: 'Partido X',
        face_value: 1000,
        currency: 'CRC',
        status: 'activo',
        asset_url: expect.any(String),
        soroban_contract_url: null,
        soroban_contract_id: null,
      }]);
    });
  });
});
