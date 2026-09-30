import { renderHook } from '@testing-library/react';

// ETP-5195 — useApiFetch() now forwards `apiSessionScope` from the session (read via the
// core's `useAuthOptional`) as createApiFetch's 4th argument. Spy on `createApiFetch` while
// spreading the rest of the module (mirrors src/hooks/__tests__/useBankStatements.vitest.jsx's
// established convention for mocking this core module), and stub `useAuthOptional` so each
// test controls the session shape.
const mockUseAuthOptional = vi.fn();
const mockCreateApiFetch = vi.fn();
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => mockUseAuthOptional(),
  createApiFetch: (...args) => mockCreateApiFetch(...args),
}));

const mockLogout = vi.fn();
vi.mock('@/auth/useLogout.js', () => ({
  useLogout: () => mockLogout,
}));

import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache, createQueryKey } from '@etendosoftware/app-shell-core/data';
import { useApiFetch } from '../useApiFetch.js';

describe('useApiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateApiFetch.mockReturnValue(vi.fn());
  });

  it('forwards apiSessionScope as the 4th arg to createApiFetch when the session carries one', () => {
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-1' });

    renderHook(() => useApiFetch('/api'));

    expect(mockCreateApiFetch).toHaveBeenCalledTimes(1);
    expect(mockCreateApiFetch).toHaveBeenCalledWith('/api', expect.any(Function), mockLogout, 'scope-1');
  });

  it('forwards undefined as the 4th arg when the session has no apiSessionScope', () => {
    // createApiFetch distinguishes null ("opt out of ambient inheritance") from undefined
    // ("inherit whatever scope is registered ambiently") — a session object that simply
    // doesn't carry apiSessionScope must produce undefined, not force an opt-out.
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1' });

    renderHook(() => useApiFetch('/api'));

    expect(mockCreateApiFetch).toHaveBeenCalledWith('/api', expect.any(Function), mockLogout, undefined);
  });

  it('forwards undefined as the 4th arg when there is no session at all (ambient fallback)', () => {
    // ETP-5195 regression guard: this hook works without an AuthProvider above it (see its
    // own doc comment), falling back to the ambient session for both token AND scope. Forcing
    // null here would silently disable the stale-request guard for every call site that only
    // has the ambient session, not a local one -- undefined lets createApiFetch inherit
    // whatever scope is registered ambiently, matching the core hook's own contract exactly.
    mockUseAuthOptional.mockReturnValue(null);

    renderHook(() => useApiFetch());

    expect(mockCreateApiFetch).toHaveBeenCalledWith(undefined, expect.any(Function), mockLogout, undefined);
  });

  it('recomputes (calls createApiFetch again) when apiSessionScope changes between renders', () => {
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-1' });
    const { rerender } = renderHook(() => useApiFetch('/api'));
    expect(mockCreateApiFetch).toHaveBeenCalledTimes(1);

    mockUseAuthOptional.mockReturnValue({ token: 'tok-1', apiSessionScope: 'scope-2' });
    rerender();

    expect(mockCreateApiFetch).toHaveBeenCalledTimes(2);
    expect(mockCreateApiFetch).toHaveBeenLastCalledWith('/api', expect.any(Function), mockLogout, 'scope-2');
  });
});

// ETP-5525 — with a DataProvider mounted, a successful write to a child document marks the parent
// order's cached records stale (see src/lib/crossSpecCacheInvalidation.js, whose URL/method
// matching is unit-tested in src/lib/__tests__/crossSpecCacheInvalidation.test.js). What is
// pinned HERE is only the wiring: the URL the helper sees is the composed base + path (or the
// per-call `baseUrl` override), only an `ok` response invalidates, and the response is returned
// untouched. A real query cache is used, so "stale" means what useEntity will read.
describe('useApiFetch — cross-spec cache invalidation after a write (ETP-5525)', () => {
  const SESSION = { token: 'tok', selectedRole: { id: 'r1' }, selectedOrg: { id: 'o1' } };
  const SCOPE = { auth: 'tok', org: 'o1', role: 'r1', apiBase: '/api' };
  const SO_KEY = createQueryKey({ ...SCOPE, spec: 'sales-order', entity: 'header', recordId: 'so-1' });
  const PO_KEY = createQueryKey({ ...SCOPE, spec: 'purchase-order', entity: 'header', recordId: 'po-1' });

  async function seededCache() {
    const cache = createQueryCache({ defaultStaleTime: 10_000 });
    await cache.fetchQuery({ key: SO_KEY, fetcher: () => Promise.resolve({ id: 'so-1' }) });
    await cache.fetchQuery({ key: PO_KEY, fetcher: () => Promise.resolve({ id: 'po-1' }) });
    return cache;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthOptional.mockReturnValue({ token: 'tok-1' });
  });

  it.each([
    ['ok POST to a child spec (hook base) → parent sales-order stale', '/sws/neo/goods-shipment', '/goodsShipment', { method: 'POST' }, true, true],
    ['ok POST via per-call baseUrl override → parent sales-order stale', '/sws/neo/sales-order', '/sws/neo/goods-shipment/goodsShipment',
      { method: 'POST', baseUrl: '' }, true, true],
    ['non-ok POST → sales-order stays fresh', '/sws/neo/goods-shipment', '/goodsShipment', { method: 'POST' }, false, false],
    ['ok GET → sales-order stays fresh', '/sws/neo/goods-shipment', '/goodsShipment', {}, true, false],
  ])('%s', async (_label, hookBase, path, options, ok, expectStale) => {
    const res = { ok, status: ok ? 200 : 500 };
    const request = vi.fn().mockResolvedValue(res);
    mockCreateApiFetch.mockReturnValue(request);
    const cache = await seededCache();

    const { result } = renderHook(() => useApiFetch(hookBase), {
      wrapper: ({ children }) => (
        // DataProvider reads the session through useAuth(), so a real AuthProvider is mounted
        // (restoreSession={null}: opt out of ETP-4576 auto-restore, as in useEntity.cache).
        <AuthProvider storage={createMemoryAuthStorage(SESSION)} initialSession={SESSION} restoreSession={null}>
          <DataProvider cache={cache}>{children}</DataProvider>
        </AuthProvider>
      ),
    });
    const returned = await result.current(path, options);

    expect(returned).toBe(res);
    expect(request).toHaveBeenCalledWith(path, options);
    expect(cache.isFresh(SO_KEY)).toBe(!expectStale);
    expect(cache.isFresh(PO_KEY), 'a shipment write must not touch purchase-order').toBe(true);
  });

  it('without a DataProvider returns the core request function itself (no wrapper)', () => {
    const request = vi.fn();
    mockCreateApiFetch.mockReturnValue(request);

    const { result } = renderHook(() => useApiFetch('/sws/neo/goods-shipment'));

    expect(result.current).toBe(request);
  });
});
