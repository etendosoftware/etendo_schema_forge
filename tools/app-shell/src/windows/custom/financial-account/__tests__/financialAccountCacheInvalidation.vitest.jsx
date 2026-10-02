/**
 * ETP-5522 — Financial account cache invalidation helper. The Cuentas list reads the accounts
 * through `useEntity('account')`, served from the shared query cache; the detail's mutations
 * (statements, reconcile, automatch, cash close, movements) bypass it, so the list showed a stale
 * reconciliation badge on the way back. Proves the invalidation pattern matches the query keys
 * the list uses (every `account` entry, regardless of scope/spec/recordId), leaves other
 * entities alone, and no-ops without a DataProvider. Mirrors contactsCacheInvalidation.vitest.jsx.
 */
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache, createQueryKey } from '@etendosoftware/app-shell-core/data';
import { useFinancialAccountCacheInvalidation } from '../financialAccountCacheInvalidation';

const SCOPE = { auth: 'tok', org: 'o1', role: 'r1' };
const key = (entity, recordId) => createQueryKey({
  ...SCOPE, apiBase: '/api', spec: 'financial-account', entity, recordId,
});

async function seed(cache) {
  // List query (no recordId) and a single-record query of the same entity.
  await cache.fetchQuery({ key: key('account'), fetcher: () => Promise.resolve(['a1']) });
  await cache.fetchQuery({ key: key('account', 'acc-1'), fetcher: () => Promise.resolve('a1') });
  await cache.fetchQuery({ key: key('businessPartner', '1'), fetcher: () => Promise.resolve('bp') });
}

function makeWrapper(cache) {
  const session = { token: 'tok', selectedRole: { id: 'r1' }, selectedOrg: { id: 'o1' } };
  return function Wrapper({ children }) {
    // restoreSession={null}: opt out of ETP-4576 auto-restore — see useEntity.cache
    return (
      <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
        <DataProvider cache={cache}>{children}</DataProvider>
      </AuthProvider>
    );
  };
}

describe('useFinancialAccountCacheInvalidation (ETP-5522)', () => {
  it('exposes an invalidateAccountList function', () => {
    const { result } = renderHook(() => useFinancialAccountCacheInvalidation());
    expect(typeof result.current.invalidateAccountList).toBe('function');
  });

  it('invalidateAccountList marks every account entry stale (list + record), not other entities', async () => {
    const cache = createQueryCache({ defaultStaleTime: 30_000 });
    await seed(cache);
    const { result } = renderHook(() => useFinancialAccountCacheInvalidation(), { wrapper: makeWrapper(cache) });

    expect(cache.isFresh(key('account'))).toBe(true);

    act(() => { result.current.invalidateAccountList(); });

    expect(cache.isFresh(key('account'))).toBe(false);
    expect(cache.isFresh(key('account', 'acc-1'))).toBe(false);
    expect(cache.isFresh(key('businessPartner', '1'))).toBe(true);
  });

  it('calls cache.invalidate with the { entity: "account" } pattern', async () => {
    const cache = createQueryCache({ defaultStaleTime: 30_000 });
    const spy = vi.spyOn(cache, 'invalidate');
    const { result } = renderHook(() => useFinancialAccountCacheInvalidation(), { wrapper: makeWrapper(cache) });

    act(() => { result.current.invalidateAccountList(); });

    expect(spy).toHaveBeenCalledWith({ entity: 'account' });
  });

  it('does not invalidate anything just by mounting', async () => {
    const cache = createQueryCache({ defaultStaleTime: 30_000 });
    await seed(cache);
    const spy = vi.spyOn(cache, 'invalidate');
    renderHook(() => useFinancialAccountCacheInvalidation(), { wrapper: makeWrapper(cache) });

    expect(spy).not.toHaveBeenCalled();
    expect(cache.isFresh(key('account'))).toBe(true);
  });

  it('is a no-op (no throw) when no DataProvider is mounted', () => {
    const { result } = renderHook(() => useFinancialAccountCacheInvalidation());
    expect(() => { result.current.invalidateAccountList(); }).not.toThrow();
  });
});
