import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { SupabaseService } from '../common/supabase/supabase.service';
import { PREFERENCES_STORE } from './notifications.tokens';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let fromMock: jest.Mock;
  let upsertMock: jest.Mock;

  const prefsShape = {
    userId: 'user-1',
    channelPreferences: [
      { category: 'bond' as const, channel: 'email' as const, enabled: false },
    ],
    quietHours: {
      timezone: 'America/Costa_Rica',
      startMinute: 1320,
      endMinute: 420,
      days: [0, 1, 2, 3, 4, 5, 6],
    },
    digestSettings: [{ category: 'transfer' as const, cadence: 'daily' as const }],
  };

  const mockStore = {
    getForUser: jest.fn(),
  };

  const mockAuthGuard = { canActivate: jest.fn(() => true) };
  const user = { id: 'user-1', profile: { role: 'comprador' } };

  beforeEach(async () => {
    jest.clearAllMocks();
    upsertMock = jest.fn().mockResolvedValue({ data: null, error: null });
    fromMock = jest.fn(() => ({ upsert: upsertMock }));

    const mod = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        PreferencesService,
        { provide: PREFERENCES_STORE, useValue: mockStore },
        { provide: SupabaseService, useValue: { admin: { from: fromMock } } },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = mod.get(PreferencesController);
  });

  it('has AuthGuard on the controller', () => {
    const guards = Reflect.getMetadata('__guards__', PreferencesController);
    expect(guards).toBeDefined();
    const guardTypes = guards.map((g: any) => g.name ?? g.toString());
    expect(guardTypes.some((n: string) => n.includes('AuthGuard'))).toBe(true);
  });

  describe('route: GET /notifications/preferences', () => {
    it('returns the assembled UserNotificationPreferences shape', async () => {
      mockStore.getForUser.mockResolvedValue(prefsShape);

      const result = await controller.get(user);

      expect(mockStore.getForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(prefsShape);
    });
  });

  describe('route: PATCH /notifications/preferences/channels', () => {
    it('upserts with on_conflict user_id,category,channel scoped to current user', async () => {
      const body = {
        category: 'bond' as const,
        channel: 'email' as const,
        enabled: false,
      };

      const result = await controller.upsertChannel(body, user);

      expect(fromMock).toHaveBeenCalledWith('notification_preferences');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          category: 'bond',
          channel: 'email',
          enabled: false,
        }),
        { onConflict: 'user_id,category,channel' },
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('route: PATCH /notifications/preferences/quiet-hours', () => {
    it('upserts with on_conflict user_id scoped to current user', async () => {
      const body = {
        timezone: 'America/Costa_Rica',
        startMinute: 1320,
        endMinute: 420,
        days: [0, 6],
      };

      const result = await controller.upsertQuietHours(body, user);

      expect(fromMock).toHaveBeenCalledWith('notification_quiet_hours');
      expect(upsertMock).toHaveBeenCalledWith(
        {
          user_id: 'user-1',
          timezone: 'America/Costa_Rica',
          start_minute: 1320,
          end_minute: 420,
          days: [0, 6],
        },
        { onConflict: 'user_id' },
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('route: PATCH /notifications/preferences/digest', () => {
    it('upserts with on_conflict user_id,category scoped to current user', async () => {
      const body = { category: 'report' as const, cadence: 'weekly' as const };

      const result = await controller.upsertDigest(body, user);

      expect(fromMock).toHaveBeenCalledWith('notification_digest_settings');
      expect(upsertMock).toHaveBeenCalledWith(
        {
          user_id: 'user-1',
          category: 'report',
          cadence: 'weekly',
        },
        { onConflict: 'user_id,category' },
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
