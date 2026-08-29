import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { WalletService } from '../escrow/wallet.service';
import { AuditService } from '../audit/audit.service';

/**
 * Ciclo de vida de la cuenta (issue #77). Todo contra un SupabaseService
 * mockeado: no se necesita base de datos ni credenciales de VELAR.
 */
describe('AuthService — ciclo de vida de la cuenta', () => {
  let service: AuthService;
  let audit: { emit: jest.Mock };
  let resetPasswordForEmail: jest.Mock;
  let verifyOtp: jest.Mock;
  let updateUserById: jest.Mock;
  let generateLink: jest.Mock;

  beforeEach(async () => {
    resetPasswordForEmail = jest.fn().mockResolvedValue({ data: {}, error: null });
    verifyOtp = jest.fn();
    updateUserById = jest.fn().mockResolvedValue({ error: null });
    generateLink = jest.fn().mockResolvedValue({ data: {}, error: null });
    audit = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: SupabaseService,
          useValue: {
            admin: {
              auth: {
                resetPasswordForEmail,
                verifyOtp,
                admin: { updateUserById, generateLink },
              },
            },
          },
        },
        { provide: WalletService, useValue: { createWalletRecord: jest.fn() } },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('forgotPassword()', () => {
    it('responde ok y audita cuando la cuenta existe', async () => {
      const result = await service.forgotPassword('existe@velar.cr');

      expect(result).toEqual({ ok: true });
      expect(resetPasswordForEmail).toHaveBeenCalledWith('existe@velar.cr', undefined);
      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_password_reset_requested',
        payload: { email: 'existe@velar.cr' },
      });
    });

    it('responde EXACTAMENTE igual si el email no existe (no filtra su existencia)', async () => {
      const existente = await service.forgotPassword('existe@velar.cr');

      resetPasswordForEmail.mockRejectedValueOnce(new Error('User not found'));
      const inexistente = await service.forgotPassword('fantasma@velar.cr');

      expect(inexistente).toEqual(existente);
      expect(inexistente).toEqual({ ok: true });
    });

    it('no propaga el error de Supabase al cliente', async () => {
      resetPasswordForEmail.mockRejectedValueOnce(new Error('rate limit exceeded'));

      await expect(service.forgotPassword('a@velar.cr')).resolves.toEqual({ ok: true });
    });

    it('audita el intento aunque la cuenta no exista, para detectar abuso', async () => {
      resetPasswordForEmail.mockRejectedValueOnce(new Error('User not found'));

      await service.forgotPassword('fantasma@velar.cr');

      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_password_reset_requested',
        payload: { email: 'fantasma@velar.cr' },
      });
    });

    it('rechaza email vacío', async () => {
      await expect(service.forgotPassword('')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resetPassword()', () => {
    it('canjea el token y fija la contraseña nueva', async () => {
      verifyOtp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });

      const result = await service.resetPassword('hash-123', 'NuevaClave123!');

      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-123', type: 'recovery' });
      expect(updateUserById).toHaveBeenCalledWith('user-1', { password: 'NuevaClave123!' });
      expect(result).toEqual({ ok: true });
      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_password_reset_completed',
        actorId: 'user-1',
      });
    });

    it('rechaza un token inválido o vencido sin tocar la contraseña', async () => {
      verifyOtp.mockResolvedValue({ data: null, error: { message: 'Token has expired' } });

      await expect(service.resetPassword('vencido', 'NuevaClave123!'))
        .rejects.toThrow(BadRequestException);
      expect(updateUserById).not.toHaveBeenCalled();
      expect(audit.emit).not.toHaveBeenCalled();
    });

    it('no audita si la actualización de contraseña falla', async () => {
      verifyOtp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
      updateUserById.mockResolvedValueOnce({ error: { message: 'weak password' } });

      await expect(service.resetPassword('hash-123', 'x')).rejects.toThrow(BadRequestException);
      expect(audit.emit).not.toHaveBeenCalled();
    });
  });

  describe('changeEmail()', () => {
    it('genera el enlace de confirmación y audita el cambio pedido', async () => {
      const result = await service.changeEmail('user-1', 'viejo@velar.cr', 'nuevo@velar.cr');

      expect(generateLink).toHaveBeenCalledWith({
        type: 'email_change_new',
        email: 'viejo@velar.cr',
        newEmail: 'nuevo@velar.cr',
      });
      expect(result).toEqual({ ok: true });
      expect(audit.emit).toHaveBeenCalledWith({
        type: 'auth_email_change_requested',
        actorId: 'user-1',
        payload: { from: 'viejo@velar.cr', to: 'nuevo@velar.cr' },
      });
    });

    it('NO aplica el cambio de inmediato: solo genera el enlace', async () => {
      await service.changeEmail('user-1', 'viejo@velar.cr', 'nuevo@velar.cr');

      expect(updateUserById).not.toHaveBeenCalled();
    });

    it('rechaza si el email nuevo es igual al actual', async () => {
      await expect(service.changeEmail('user-1', 'mismo@velar.cr', 'mismo@velar.cr'))
        .rejects.toThrow(BadRequestException);
      expect(generateLink).not.toHaveBeenCalled();
    });
  });
});
