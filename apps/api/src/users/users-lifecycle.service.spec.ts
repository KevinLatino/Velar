import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';
import { AuditService } from '../audit/audit.service';

/**
 * Desactivación/reactivación de cuentas (issue #77), contra un SupabaseService
 * mockeado. Sin base de datos ni credenciales.
 */
describe('UsersService — desactivación de cuentas', () => {
  let service: UsersService;
  let audit: { emit: jest.Mock };
  let updateUserById: jest.Mock;

  beforeEach(async () => {
    updateUserById = jest.fn().mockResolvedValue({ error: null });
    audit = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: SupabaseService,
          useValue: { admin: { auth: { admin: { updateUserById } }, from: jest.fn() } },
        },
        { provide: WalletService, useValue: { createWalletRecord: jest.fn() } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('deactivate()', () => {
    it('banea la cuenta por un plazo efectivamente infinito', async () => {
      const result = await service.deactivate('target-1', 'admin', 'admin-1');

      expect(updateUserById).toHaveBeenCalledWith('target-1', { ban_duration: '876000h' });
      expect(result).toEqual({ ok: true, userId: 'target-1', active: false });
    });

    it('audita con el admin como actor y la cuenta afectada en el payload', async () => {
      await service.deactivate('target-1', 'admin', 'admin-1');

      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_account_deactivated',
        actorId: 'admin-1',
        payload: { targetUserId: 'target-1' },
      });
    });

    it.each(['comprador', 'emisor', 'tse', 'recomprador', 'validador'] as const)(
      'rechaza al rol %s: es admin-only',
      async (role) => {
        await expect(service.deactivate('target-1', role, 'actor-1'))
          .rejects.toThrow(ForbiddenException);
        expect(updateUserById).not.toHaveBeenCalled();
        expect(audit.emit).not.toHaveBeenCalled();
      },
    );

    it('impide que un admin se desactive a sí mismo', async () => {
      await expect(service.deactivate('admin-1', 'admin', 'admin-1'))
        .rejects.toThrow(BadRequestException);
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it('no audita si Supabase falla', async () => {
      updateUserById.mockResolvedValueOnce({ error: { message: 'user not found' } });

      await expect(service.deactivate('fantasma', 'admin', 'admin-1'))
        .rejects.toThrow(BadRequestException);
      expect(audit.emit).not.toHaveBeenCalled();
    });
  });

  describe('reactivate()', () => {
    it('levanta el ban y devuelve la cuenta a activa', async () => {
      const result = await service.reactivate('target-1', 'admin', 'admin-1');

      expect(updateUserById).toHaveBeenCalledWith('target-1', { ban_duration: 'none' });
      expect(result).toEqual({ ok: true, userId: 'target-1', active: true });
      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_account_reactivated',
        actorId: 'admin-1',
        payload: { targetUserId: 'target-1' },
      });
    });

    it('también es admin-only', async () => {
      await expect(service.reactivate('target-1', 'tse', 'actor-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('ciclo completo', () => {
    it('desactivar y reactivar deja la cuenta como al inicio, con dos eventos auditados', async () => {
      await service.deactivate('target-1', 'admin', 'admin-1');
      await service.reactivate('target-1', 'admin', 'admin-1');

      expect(updateUserById).toHaveBeenNthCalledWith(1, 'target-1', { ban_duration: '876000h' });
      expect(updateUserById).toHaveBeenNthCalledWith(2, 'target-1', { ban_duration: 'none' });
      expect(audit.emit).toHaveBeenCalledTimes(2);
    });
  });
});
