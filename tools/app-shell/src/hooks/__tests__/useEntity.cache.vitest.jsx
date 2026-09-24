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
import { buildCustomAddModalOnSaved } from '../../components/contract-ui/detailViewHelpers.jsx';

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
    // restoreSession={null}: the cache is the subject, not session restore.
    // Under ETP-4576 credentialMode 'auto' the restore fires on mount, fails
    // with no server, and its catch clears the token — flipping the cache
    // identity (token ?? csrfToken) and firing cache.clear(). Opt out.
    return (
      <AuthProvider storage={createMemoryAuthStorage(SESSION)} initialSession={SESSION} restoreSession={null}>
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

  // ETP-5265 QA follow-up (2) — `fetchById` returns the refetch promise so a caller can
  // stay busy until the record is genuinely back. DetailView's `onRefresh` prop is
  // literally `() => hook.fetchById?.(id, { force: true })`, and the goods-shipment /
  // goods-receipt Confirm flow awaits it to keep the button's spinner up; before the
  // `return` was added it awaited `undefined` and resumed immediately.
  it('2b. fetchById returns an awaitable promise that settles once the record is loaded', async () => {
    const { fetchMock } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });

    let returned;
    await act(async () => { returned = a.result.current.fetchById('42'); });
    expect(typeof returned?.then).toBe('function');
    await act(async () => { await returned; });
    expect(a.result.current.selected?.id).toBe('42');

    // The id guard still short-circuits to undefined, exactly as before.
    let guarded = 'unset';
    await act(async () => { guarded = a.result.current.fetchById(''); });
    expect(guarded).toBeUndefined();
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

  it('6. adding a child invalidates its own children collection (and, per ETP-5366, the parent entity cache too — see test 19)', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    // Load parent p1 (fetchById also loads its children into the cache).
    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchById('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Re-reading the same children reuses the cache (no new request).
    await act(async () => { await a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Adding a child under the selected parent invalidates that collection,
    // so the next children read refetches. NOTE: as of ETP-5366, handleAddChild
    // ALSO invalidates the parent entity's own list/record cache (invalidateEntityCache) —
    // this test only exercises the children-collection side of that; test 19 below
    // covers the parent-entity side explicitly.
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
    // handleProcess re-reads the record version on failure (refreshRecordVersion,
    // ETP-5073), an *uncached* GET, so the raw count may have advanced past 1.
    // What this test verifies is that the cache was NOT invalidated — i.e. the
    // *next* fetchById adds no further request.
    const recordCountAfterProcess = counts.record;
    await act(async () => { a.result.current.fetchById('77'); });
    await waitFor(() => expect(counts.record).toBe(recordCountAfterProcess));
  });

  // --- ETP-5366 regression: invalidateChildrenCache is part of the public API ---
  // A secondary tab whose rows are written by a `customAddModal` never goes through
  // handleAddChild, so nothing marked the cached child collection stale and the
  // follow-up handleSelect re-read was served from the cache (same array instance →
  // no-op setChildren → the tab kept showing the pre-save rows). DetailView now calls
  // this from the modal's onSaved, which only works if the hook exports it.

  it('15. invalidateChildrenCache is exported by the hook', async () => {
    const { fetchMock } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    expect(typeof a.result.current.invalidateChildrenCache).toBe('function');
  });

  it('16. invalidateChildrenCache marks only the given parent collection stale', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));
    await act(async () => { a.result.current.fetchChildren('p2'); });
    await waitFor(() => expect(counts.children).toBe(2));

    // Both collections are fresh: plain re-reads are served from the cache.
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await act(async () => { a.result.current.fetchChildren('p2'); });
    await waitFor(() => expect(counts.children).toBe(2));

    await act(async () => { a.result.current.invalidateChildrenCache('p1'); });

    // p1 was dropped → a NON-forced read now reaches the network...
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(3));
    // ...while p2's entry is untouched and still served from the cache.
    await act(async () => { a.result.current.fetchChildren('p2'); });
    await waitFor(() => expect(counts.children).toBe(3));
  });

  it('17. invalidateChildrenCache without a parent id is a no-op', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));

    // Guarded on parentId: a parent-less call must not blow away every collection.
    await act(async () => { a.result.current.invalidateChildrenCache(undefined); });

    await act(async () => { a.result.current.fetchChildren('p1'); });
    await waitFor(() => expect(counts.children).toBe(1));
  });

  it('18. reproduces the customAddModal sequence: an out-of-band row surfaces only after the invalidation', async () => {
    // The server-side collection. The modal writes to it directly (its own raw
    // apiFetch POST), which is exactly why nothing in the hook knows it changed.
    const rows = [{ id: 'ADDR-1' }];
    const { fetchMock, counts } = makeFetch({
      handler: ({ method, path }) => (method === 'GET' && path === '/lines'
        ? { ok: true, status: 200, _label: 'children', json: async () => ({ response: { data: [...rows] } }) }
        : null),
    });
    globalThis.fetch = fetchMock;

    const parent = { id: 'BP-1', name: 'ACME' };
    const a = renderHook(() => useEntity('header', 'lines', opts({ skipListFetch: true })), { wrapper });
    await act(async () => { a.result.current.handleSelect(parent); });
    await waitFor(() => expect(a.result.current.children).toHaveLength(1));
    expect(counts.children).toBe(1);

    // The modal persisted a second row without going through handleAddChild.
    rows.push({ id: 'ADDR-2' });

    // Pre-fix path: DetailView's onSaved called handleSelect ALONE. Its non-forced
    // fetchChildren resolves from the still-fresh cache entry with the very same
    // array instance, so setChildren is an Object.is no-op and the tab never updates.
    const childrenBefore = a.result.current.children;
    await act(async () => { a.result.current.handleSelect(parent); });
    expect(counts.children).toBe(1);
    expect(a.result.current.children).toBe(childrenBefore);
    expect(a.result.current.children).toHaveLength(1);

    // ETP-5366: dropping the entry first is what makes that same handleSelect reach
    // the network — and only then does the new row reach the consumer.
    await act(async () => {
      a.result.current.invalidateChildrenCache(parent.id);
      a.result.current.handleSelect(parent);
    });
    await waitFor(() => expect(a.result.current.children).toHaveLength(2));
    expect(counts.children).toBe(2);
    expect(a.result.current.children.map(r => r.id)).toEqual(['ADDR-1', 'ADDR-2']);
  });

  // --- ETP-5366 regression: child mutations must also invalidate the PARENT entity's
  // own list/record cache, not just the children collection. A child row can carry
  // a value the parent list row displays (a computed header total, a rolled-up
  // address/count), so leaving the parent's cache entry fresh means the grid keeps
  // showing pre-mutation data for up to `recordStaleTime` after editing/adding/
  // deleting a child, until a manual refresh. Before the fix, handleAddChild/
  // handleUpdateChild/handleDeleteChild called ONLY invalidateChildrenCache — these
  // tests would have failed against that old code because `cache.invalidate` would
  // never have been called with `{ entity: 'header' }`, and the parent list re-mount
  // below would have kept serving the stale cached page (counts.list staying at 1).

  it('19. handleAddChild invalidates the parent entity cache, not just the children collection', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    await act(async () => { a.result.current.handleSelect({ id: '1', name: 'Item 1' }); });

    const invalidateSpy = vi.spyOn(cache, 'invalidate');
    await act(async () => { await a.result.current.handleAddChild({ qty: 1 }); });

    // The parent entity ('header'), not only the child entity ('lines'), was marked stale.
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ entity: 'header' }));
    a.unmount();

    // Behavioral proof: the parent LIST cache was actually dropped, so returning to the
    // grid (a fresh mount) refetches instead of serving the pre-add cached page.
    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(2);
  });

  it('20. handleUpdateChild invalidates the parent entity cache, not just the children collection', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    await act(async () => { a.result.current.handleSelect({ id: '1', name: 'Item 1' }); });

    const invalidateSpy = vi.spyOn(cache, 'invalidate');
    act(() => { a.result.current.handleUpdateChild('c1', 'qty', 5); });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ entity: 'header' }));
    a.unmount();

    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(2);
  });

  it('21. handleDeleteChild invalidates the parent entity cache, not just the children collection', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    await act(async () => { a.result.current.handleSelect({ id: '1', name: 'Item 1' }); });

    const invalidateSpy = vi.spyOn(cache, 'invalidate');
    act(() => { a.result.current.handleDeleteChild('c1'); });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ entity: 'header' }));
    a.unmount();

    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(2);
  });

  // --- ETP-5366 follow-up: the customAddModal onSaved path (Contacts' address form)
  // never goes through handleAddChild/handleUpdateChild at all — it persists via its
  // own raw fetch and invalidates through buildCustomAddModalOnSaved instead. This
  // mirrors test 18 (children-collection side) but goes through the REAL secondary
  // hook instance and buildCustomAddModalOnSaved itself, proving the PARENT entity's
  // list cache is also actually dropped end-to-end — not just that the pure function
  // calls the right mock, as the unit tests in detailViewHelpers.vitest.js already do.
  it('22. buildCustomAddModalOnSaved invalidates the parent entity list cache through a real useEntity instance', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(a.result.current.items.length).toBe(1));
    expect(counts.list).toBe(1);

    // `secondaryHooks[idx]` is the same useEntity instance as the main `hook` — per
    // buildCustomAddModalOnSaved's own doc comment, this is how a Contacts-style
    // window actually wires it.
    await act(async () => { a.result.current.handleSelect({ id: '1', name: 'Item 1' }); });
    const parent = a.result.current.selected;
    expect(parent?.id).toBe('1');

    const invalidateSpy = vi.spyOn(cache, 'invalidate');
    const setCustomModalState = vi.fn();
    const onSaved = buildCustomAddModalOnSaved({
      secondaryHooks: [a.result.current],
      idx: 0,
      hook: a.result.current,
      setCustomModalState,
    });
    await act(async () => { onSaved(); });

    // The parent entity ('header') cache was marked stale by the modal's onSaved,
    // exactly as the direct handleAddChild/handleUpdateChild/handleDeleteChild paths do.
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ entity: 'header' }));
    expect(setCustomModalState).toHaveBeenCalledWith({ key: null, rowId: null });
    a.unmount();

    // Behavioral proof: returning to the grid (a fresh mount) refetches instead of
    // serving the pre-save cached page.
    const b = renderHook(() => useEntity('header', 'lines', opts()), { wrapper });
    await waitFor(() => expect(b.result.current.items.length).toBe(1));
    expect(counts.list).toBe(2);
  });
});
