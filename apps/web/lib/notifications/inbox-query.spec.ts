import { buildInboxQueryString } from './inbox-query';

describe('buildInboxQueryString', () => {
  it('omits undefined and empty filters', () => {
    expect(buildInboxQueryString({})).toBe('');
    expect(
      buildInboxQueryString({
        category: undefined,
        search: '',
        read: undefined,
        archived: undefined,
        cursor: undefined,
      }),
    ).toBe('');
  });

  it('encodes search text', () => {
    const qs = buildInboxQueryString({ search: 'oferta CRC 100' });
    expect(qs).toBe('search=oferta+CRC+100');
    expect(new URLSearchParams(qs).get('search')).toBe('oferta CRC 100');
  });

  it('includes cursor only when present', () => {
    expect(buildInboxQueryString({ limit: 20 })).toBe('limit=20');
    expect(buildInboxQueryString({ cursor: 'abc', limit: 20 })).toBe('cursor=abc&limit=20');
  });

  it('includes category, read, and archived when set', () => {
    const qs = buildInboxQueryString({
      category: 'bond',
      read: 'false',
      archived: 'true',
    });
    const params = new URLSearchParams(qs);
    expect(params.get('category')).toBe('bond');
    expect(params.get('read')).toBe('false');
    expect(params.get('archived')).toBe('true');
  });
});
