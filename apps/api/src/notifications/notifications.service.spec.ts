import { Test } from '@nestjs/testing';
import { SupabaseService } from '../common/supabase/supabase.service';
import { NotificationsService } from './notifications.service';

type Chain = Record<string, jest.Mock> & PromiseLike<{ data: unknown; error: unknown }>;

function createChain(result: { data: unknown; error: unknown } = { data: [], error: null }): Chain {
  const chain: any = {};
  const methods = [
    'select',
    'eq',
    'in',
    'is',
    'not',
    'or',
    'order',
    'limit',
    'update',
  ];
  for (const method of methods) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('NotificationsService inbox/bulk', () => {
  let service: NotificationsService;
  let fromMock: jest.Mock;
  let chain: Chain;

  beforeEach(async () => {
    chain = createChain();
    fromMock = jest.fn(() => chain);

    const mod = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: SupabaseService, useValue: { admin: { from: fromMock } } },
      ],
    }).compile();

    service = mod.get(NotificationsService);
  });

  describe('inbox()', () => {
    it('applies category/severity/read filters and defaults to active (non-archived)', async () => {
      chain = createChain({
        data: [
          {
            id: 'n-1',
            created_at: '2026-07-01T12:00:00.000Z',
            category: 'bond',
          },
        ],
        error: null,
      });
      fromMock.mockReturnValue(chain);

      const result = await service.inbox('user-1', {
        category: 'bond',
        severity: 'warning',
        read: false,
        limit: 10,
      });

      expect(fromMock).toHaveBeenCalledWith('notifications');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.eq).toHaveBeenCalledWith('category', 'bond');
      expect(chain.eq).toHaveBeenCalledWith('severity', 'warning');
      expect(chain.eq).toHaveBeenCalledWith('read', false);
      expect(chain.is).toHaveBeenCalledWith('archived_at', null);
      expect(chain.limit).toHaveBeenCalledWith(11);
      expect(result.notifications).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('applies free-text search via payload subject/body ilike or-filter', async () => {
      fromMock.mockReturnValue(chain);

      await service.inbox('user-1', { search: 'offer' });

      expect(chain.or).toHaveBeenCalledWith(
        'payload->>subject.ilike.%offer%,payload->>body.ilike.%offer%',
      );
    });
  });

  describe('bulkMarkRead()', () => {
    it('scopes update to current user and given ids, setting read + read_at', async () => {
      const updateChain = createChain({ data: null, error: null });
      fromMock.mockReturnValue(updateChain);

      const result = await service.bulkMarkRead('user-1', ['n-1', 'n-2']);

      expect(fromMock).toHaveBeenCalledWith('notifications');
      expect(updateChain.update).toHaveBeenCalledWith(
        expect.objectContaining({ read: true, read_at: expect.any(String) }),
      );
      expect(updateChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(updateChain.in).toHaveBeenCalledWith('id', ['n-1', 'n-2']);
      expect(result).toEqual({ ok: true });
    });
  });
});
