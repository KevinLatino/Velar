import { Test } from '@nestjs/testing';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockService = {
    list: jest.fn(),
    markAllRead: jest.fn(),
    markRead: jest.fn(),
    inbox: jest.fn(),
    bulkMarkRead: jest.fn(),
    archive: jest.fn(),
    unarchive: jest.fn(),
    groupedCounts: jest.fn(),
  };

  const mockAuthGuard = { canActivate: jest.fn(() => true) };
  const user = { id: 'user-1', profile: { role: 'comprador' } };

  beforeEach(async () => {
    jest.clearAllMocks();

    const mod = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .compile();

    controller = mod.get(NotificationsController);
  });

  it('has AuthGuard on the controller', () => {
    const guards = Reflect.getMetadata('__guards__', NotificationsController);
    expect(guards).toBeDefined();
    const guardTypes = guards.map((g: any) => g.name ?? g.toString());
    expect(guardTypes.some((n: string) => n.includes('AuthGuard'))).toBe(true);
  });

  describe('route: GET /notifications/inbox', () => {
    it('applies filters and scopes to the current user', async () => {
      mockService.inbox.mockResolvedValue({ notifications: [], nextCursor: null });

      await controller.inbox(
        user,
        'bond',
        'critical',
        'false',
        'false',
        'payment due',
        'cursor-abc',
        '25',
      );

      expect(mockService.inbox).toHaveBeenCalledWith('user-1', {
        category: 'bond',
        severity: 'critical',
        read: false,
        archived: false,
        search: 'payment due',
        cursor: 'cursor-abc',
        limit: 25,
      });
    });
  });

  describe('route: PATCH /notifications/bulk-read', () => {
    it('only passes ids for the current user to the service', async () => {
      mockService.bulkMarkRead.mockResolvedValue({ ok: true });

      const result = await controller.bulkRead({ ids: ['n-1', 'n-2'] }, user);

      expect(mockService.bulkMarkRead).toHaveBeenCalledWith('user-1', ['n-1', 'n-2']);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('route: GET /notifications/grouped', () => {
    it('returns grouped counts for the current user', async () => {
      mockService.groupedCounts.mockResolvedValue({ bond: 3, transfer: 5 });

      const result = await controller.grouped(user);

      expect(mockService.groupedCounts).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ bond: 3, transfer: 5 });
    });
  });

  describe('route: PATCH /notifications/:id/archive|unarchive', () => {
    it('archives scoped to owner', async () => {
      mockService.archive.mockResolvedValue({ ok: true });
      await controller.archive('n-9', user);
      expect(mockService.archive).toHaveBeenCalledWith('n-9', 'user-1');
    });

    it('unarches scoped to owner', async () => {
      mockService.unarchive.mockResolvedValue({ ok: true });
      await controller.unarchive('n-9', user);
      expect(mockService.unarchive).toHaveBeenCalledWith('n-9', 'user-1');
    });
  });
});
