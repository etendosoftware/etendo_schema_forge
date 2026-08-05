/**
 * ETP-4564 [SEC T01 3/3] — Contacts cache invalidation helper. Proves the
 * invalidation patterns match the query keys the readers use (businessPartner
 * list/record, bp-stats, bp-trend), and that it no-ops without a DataProvider.
 * Runs under both dev profiles.
 *
 * AuthProvider opts out of the cookie-session restore (`restoreSession={null}`):
 * this test exercises the query cache, not the auth restore, and the default
 * restore flow would otherwise clobber the `token` from `initialSession`
 * (the fetch it triggers is unmocked here and rejects, which clears the
 * session entirely), flipping DataProvider's identity scope and clearing the
 * shared cache mid-test.
 */
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache, createQueryKey } from '@etendosoftware/app-shell-core/data';
import { useContactsCacheInvalidation } from '../contactsCacheInvalidation';

const SCOPE = { auth: 'tok', org: 'o1', role: 'r1' };
const key = (entity, recordId) => createQueryKey({ ...SCOPE, apiBase: '/api', spec: 'contacts', entity, recordId });

async function seed(cache) {
  await cache.fetchQuery({ key: key('businessPartner', '1'), fetcher: () => Promise.resolve('bp') });
  await cache.fetchQuery({ key: key('bp-stats', '1'), fetcher: () => Promise.resolve('s') });
  await cache.fetchQuery({ key: key('bp-trend', '1'), fetcher: () => Promise.resolve('t') });
  await cache.fetchQuery({ key: key('attachments', '1'), fetcher: () => Promise.resolve('a') });
}

function makeWrapper(cache) {
  const session = { token: 'tok', selectedRole: { id: 'r1' }, selectedOrg: { id: 'o1' } };
  return function Wrapper({ children }) {
    return (
      <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
        <DataProvider cache={cache}>{children}</DataProvider>
      </AuthProvider>
    );
  };
}

describe('useContactsCacheInvalidation (ETP-4564)', () => {
  it('invalidateBusinessPartner marks only businessPartner entries stale', async () => {
    const cache = createQueryCache({ defaultStaleTime: 10_000 });
    await seed(cache);
    const { result } = renderHook(() => useContactsCacheInvalidation(), { wrapper: makeWrapper(cache) });

    act(() => { result.current.invalidateBusinessPartner(); });

    expect(cache.isFresh(key('businessPartner', '1'))).toBe(false);
    expect(cache.isFresh(key('bp-stats', '1'))).toBe(true);
    expect(cache.isFresh(key('attachments', '1'))).toBe(true);
  });

  it('invalidateFinanceKpis marks bp-stats and bp-trend stale (not others)', async () => {
    const cache = createQueryCache({ defaultStaleTime: 10_000 });
    await seed(cache);
    const { result } = renderHook(() => useContactsCacheInvalidation(), { wrapper: makeWrapper(cache) });

    act(() => { result.current.invalidateFinanceKpis(); });

    expect(cache.isFresh(key('bp-stats', '1'))).toBe(false);
    expect(cache.isFresh(key('bp-trend', '1'))).toBe(false);
    expect(cache.isFresh(key('businessPartner', '1'))).toBe(true);
    expect(cache.isFresh(key('attachments', '1'))).toBe(true);
  });

  it('is a no-op (no throw) when no DataProvider is mounted', () => {
    const { result } = renderHook(() => useContactsCacheInvalidation());
    expect(() => {
      result.current.invalidateBusinessPartner();
      result.current.invalidateFinanceKpis();
    }).not.toThrow();
  });
});
