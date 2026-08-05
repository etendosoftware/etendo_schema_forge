/**
 * ETP-4563 [SEC T01 2/3] — RED tests for integrating the app-shell-core shared
 * cache into useEntity.
 *
 * These assert the target caching behavior and are expected to FAIL until the
 * GREEN integration lands: today useEntity fetches directly on every mount with
 * no shared cache, so cross-mount reuse, dedup, and mutation-driven invalidation
 * do not happen.
 *
 * Run under the LOCAL_CORE profile so @etendosoftware/app-shell-core resolves to
 * the sibling schema_forge_core source (feature/ETP-4562, which ships the cache):
 *   cd tools/app-shell && LOCAL_CORE=1 npx vitest run src/hooks/__tests__/useEntity.cache.vitest.jsx
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider } from '@etendosoftware/app-shell-core/data';
import { createQueryCache } from '@etendosoftware/app-shell-core/data';
import { toast } from 'sonner';
import { useEntity } from '../useEntity';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('@/auth/useLogout.js', () => ({ useLogout: () => vi.fn() }));

const API = 'http://localhost/api';
const TOKEN = 'test-token';
const SESSION = { token: TOKEN, selectedRole: { id: 'r1' }, selectedOrg: { id: 'o1' } };

const jsonOk = (data) => ({ ok: true, status: 200, json: async () => ({ response: { data } }) });
const recordOk = (record) => ({ ok: true, status: 200, json: async () => ({ response: { data: [record] } }) });

/**
 * A fetch mock that routes by method+path and counts calls per logical query.
 * Returns { fetch, counts } where counts is keyed by a coarse label.
 */
function makeFetch(overrides = {}) {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    const u = new URL(url, 'http://localhost');
    const path = u.pathname.replace('/api', '');
    if (overrides.handler) {
      const res = overrides.handler({ method, path, url, opts, u });
      if (res) { bump(res._label || `${method} ${path}`); return res; }
    }
    // Defaults
    if (method === 'GET' && /^\/header\/[^/]+$/.test(path)) { bump('record'); return recordOk({ id: path.split('/')[2], name: 'R', _amt: 1 }); }
    if (method === 'GET' && path === '/header') { bump('list'); return jsonOk([{ id: '1', name: 'Item 1' }]); }
    if (method === 'GET' && path === '/lines') { bump('children'); return jsonOk([{ id: 'c1' }]); }
    if (method === 'PATCH') { bump('patch'); return recordOk({ id: path.split('/')[2], name: 'patched' }); }
    if (method === 'POST') { bump('post'); return recordOk({ id: 'new-1', name: 'created' }); }
    if (method === 'DELETE') { bump('delete'); return { ok: true, status: 200, json: async () => ({}) }; }
    bump('other');
    return jsonOk([]);
  });
  return { fetchMock, counts };
}

function makeWrapper(cache) {
  return function Wrapper({ children }) {
    return (
      <AuthProvider storage={createMemoryAuthStorage(SESSION)} initialSession={SESSION}>
        <DataProvider cache={cache}>{children}</DataProvider>
      </AuthProvider>
    );
  };
}

const opts = (extra = {}) => ({ token: TOKEN, apiBaseUrl: API, specName: 'contact', ...extra });

describe('useEntity — shared cache integration (ETP-4563)', () => {
  let cache, wrapper;
  beforeEach(() => {
    cache = createQueryCache();      // one cache shared across mounts in a test
    wrapper = makeWrapper(cache);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('2. detail → list reuses the cached list without another request during freshness', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);
    a.unmount();

    // Navigate back to the list: a fresh mount with identical params.
    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1); // served from cache, no second request
  });

  it('1. list → detail reuses a previously loaded full record within freshness', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('42'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('42'));
    expect(counts.record).toBe(1);
    a.unmount();

    const b = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { b.result.current.fetchById('42'); });
    await waitFor(() => expect(b.result.current.selected?.id).toBe('42'));
    expect(counts.record).toBe(1); // reused from cache
  });

  it('3. two consumers requesting the same record share a single request', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    const b = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => {
      a.result.current.fetchById('7');
      b.result.current.fetchById('7');
    });
    await waitFor(() => {
      expect(a.result.current.selected?.id).toBe('7');
      expect(b.result.current.selected?.id).toBe('7');
    });
    expect(counts.record).toBe(1); // deduplicated
  });

  it('4. different filters, specs, entities, or parent IDs never collide', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ columnFilters: { name: 'x' } })), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    const b = renderHook(() => useEntity('header', 'lines', opts({ columnFilters: { name: 'y' } })), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));

    expect(counts.list).toBe(2); // distinct filters → distinct keys → two requests
  });

  it('8. explicit refresh forces a new request even when data is fresh', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    await act(async () => { a.result.current.refresh(); });
    await waitFor(() => expect(counts.list).toBe(2)); // forced reload hit the network
  });

  it('5. a PATCH updates the record cache and invalidates the list', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    await act(async () => {
      a.result.current.handleSelect({ id: '1', name: 'Item 1' });
      a.result.current.handleChange('name', 'edited');
    });
    await act(async () => { await a.result.current.handleSave(); });
    expect(counts.patch).toBe(1);
    a.unmount();

    // The list was invalidated by the save → remount must refetch.
    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(2);
  });

  it('7. a DELETE evicts the record from cache and invalidates the list', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('9'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('9'));
    expect(counts.record).toBe(1);

    await act(async () => { await a.result.current.handleDelete(); });
    expect(counts.delete).toBe(1);
    a.unmount();

    // Record evicted → a fresh detail load of the same id refetches.
    const b = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { b.result.current.fetchById('9'); });
    await waitFor(() => expect(b.result.current.selected?.id).toBe('9'));
    expect(counts.record).toBe(2);
  });

  it('6. adding a child invalidates only the affected parent collection', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    // Load parent p1 (fetchById also loads its children into the cache).
    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Re-reading the same children reuses the cache (no new request).
    await act(async () => { await a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Adding a child under the selected parent invalidates only that collection,
    // so the next children read refetches.
    await act(async () => { await a.result.current.handleAddChild({ qty: 1 }); });
    await waitFor(() => expect(counts.children).toBeGreaterThanOrEqual(2));
  });

  it('9. an older delayed record response cannot overwrite a newer mutation result', async () => {
    let releaseSlow;
    const slow = new Promise((r) => { releaseSlow = r; });
    const { fetchMock } = makeFetch({
      handler: ({ method, path }) => {
        if (method === 'GET' && path === '/header/5') {
          // resolve only when released, with STALE data
          return { ok: true, status: 200, _label: 'record', json: async () => { await slow; return { response: { data: [{ id: '5', name: 'STALE' }] } }; } };
        }
        if (method === 'PATCH' && path === '/header/5') {
          // the save echoes back the freshly persisted value
          return { ok: true, status: 200, _label: 'patch', json: async () => ({ response: { data: [{ id: '5', name: 'FRESH' }] } }) };
        }
        return null;
      },
    });
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('5'); });               // slow GET in flight
    // Separate acts so each state update flushes and the next call closes over it.
    await act(async () => { a.result.current.handleSelect({ id: '5', name: 'x' }); });
    await act(async () => { a.result.current.handleChange('name', 'FRESH'); });
    await act(async () => { await a.result.current.handleSave(); });           // newer PATCH result
    await act(async () => { releaseSlow(); await slow; });                     // stale GET resolves late

    await waitFor(() => expect(a.result.current.editing?.name).toBe('FRESH')); // not clobbered by STALE
  });

  it('10. loading, error, and pagination flags remain backward compatible', async () => {
    const { fetchMock } = makeFetch({
      handler: ({ method, path }) => (method === 'GET' && path === '/header'
        ? { ok: false, status: 500, _label: 'list', json: async () => ({}) }
        : null),
    });
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current.items).toEqual([]);   // error path clears items, no throw
    expect(a.result.current.hasMore).toBe(false);
  });

  // --- ETP-4563 regression: `force` bypasses freshness, process invalidates cache ---
  // These guard the cache-refresh fix: a stale read could be served from a fresh
  // cache entry after a mutation. The fix added `{ force }` to fetchById/fetchChildren
  // and made handleProcess invalidate the entity cache before re-reading.

  it('11. fetchById with { force: true } refetches even when the record is still fresh', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('42'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('42'));
    expect(counts.record).toBe(1);

    // Contrast: a plain re-read within the freshness window reuses the cache.
    await act(async () => { a.result.current.fetchById('42'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('42'));
    expect(counts.record).toBe(1);

    // force: true bypasses freshness → a brand-new network round-trip.
    await act(async () => { a.result.current.fetchById('42', { force: true }); });
    await waitFor(() => expect(counts.record).toBe(2));
  });

  it('12. fetchChildren with { force: true } refetches even when children are still fresh', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Contrast: a plain re-read within the freshness window reuses the cache.
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // force: true bypasses freshness → a brand-new network round-trip.
    await act(async () => { a.result.current.fetchChildren('p1', { force: true }); });
    await waitFor(() => expect(counts.children).toBe(2));
  });

  it('13. a successful handleProcess invalidates the entity cache so the next read refetches', async () => {
    const { fetchMock, counts } = makeFetch({
      handler: ({ method, path }) => (method === 'POST' && /\/header\/[^/]+\/action\//.test(path)
        ? { ok: true, status: 200, _label: 'process', json: async () => ({}) }
        : null),
    });
    globalThis.fetch = fetchMock;
    const invalidateSpy = vi.spyOn(cache, 'invalidate');

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('99'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('99'));
    expect(counts.record).toBe(1);

    // A hidden param exercises the process-param fan-out; the action succeeds.
    await act(async () => {
      await a.result.current.handleProcess({
        columnName: 'DOC_ACTION',
        label: 'Complete',
        params: [{ key: 'documentAction', value: 'CO', hidden: true }],
      });
    });
    expect(counts.process).toBe(1);

    // The success path invalidated this entity's cached lists and records...
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ entity: 'header' }));
    // ...so handleProcess's own post-process re-read reaches the network again
    // instead of serving the now-stale cache entry.
    await waitFor(() => expect(counts.record).toBe(2));
  });

  it('14. a failed handleProcess does NOT invalidate the cache and surfaces an error toast', async () => {
    const { fetchMock, counts } = makeFetch({
      handler: ({ method, path }) => (method === 'POST' && /\/header\/[^/]+\/action\//.test(path)
        ? { ok: false, status: 400, _label: 'process', json: async () => ({ error: { message: 'process failed' } }) }
        : null),
    });
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('77'); });
    await waitFor(() => expect(a.result.current.selected?.id).toBe('77'));
    expect(counts.record).toBe(1);

    const invalidateSpy = vi.spyOn(cache, 'invalidate');
    toast.error.mockClear();
    await act(async () => { await a.result.current.handleProcess({ columnName: 'DOC_ACTION' }); });
    expect(counts.process).toBe(1);

    // Failure keeps the cache intact and reports the error via a toast.
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();

    // The record entry stays fresh → a subsequent read is served from cache.
    await act(async () => { a.result.current.fetchById('77'); });
    await waitFor(() => expect(counts.record).toBe(1));
  });
});
