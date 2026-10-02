/**
 * ETP-4564 [SEC T01 3/3] — attachments cache + true lazy-load behavior.
 * Counts requests per endpoint. Run under LOCAL_CORE so the shared cache resolves
 * from local source:
 *   cd tools/app-shell && LOCAL_CORE=1 npx vitest run \
 *     src/components/attachments/__tests__/useAttachments.cache.vitest.jsx
 */
vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache } from '@etendosoftware/app-shell-core/data';
import { useAttachments } from '../useAttachments';

const API = 'http://host/sws/neo/contacts';

function makeFetch() {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const fetchMock = vi.fn(async (url, opts = {}) => {
    const method = (opts.method || 'GET').toUpperCase();
    // ETP-5526: the badge count endpoint — matched before the list, whose URL it extends.
    if (method === 'GET' && url.endsWith('/attachments/C_BPartner/BP1/count')) {
      bump('count');
      return { ok: true, json: async () => ({ count: 1 }) };
    }
    if (method === 'GET' && url.includes('/attachments/C_BPartner/BP1')) {
      bump('list');
      return { ok: true, json: async () => ({ items: [{ id: 'a1', name: 'a1.pdf' }] }) };
    }
    if (method === 'POST') { bump('upload'); return { ok: true, json: async () => ({ response: { data: { id: 'a2', name: 'a2.pdf' } } }) }; }
    if (method === 'DELETE') { bump('delete'); return { ok: true, json: async () => ({}) }; }
    bump('other');
    return { ok: true, json: async () => ({}) };
  });
  return { fetchMock, counts };
}

const opts = (extra = {}) => ({ tableName: 'C_BPartner', recordId: 'BP1', token: 'tok', apiBaseUrl: API, ...extra });

function makeWrapper(cache, session = { token: 'tok', selectedOrg: { id: 'o1' } }) {
  return function Wrapper({ children }) {
    // restoreSession={null}: opt out of ETP-4576 auto-restore — see useEntity.cache
    return (
      <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
        <DataProvider cache={cache}>{children}</DataProvider>
      </AuthProvider>
    );
  };
}

describe('useAttachments — cache + lazy load (ETP-4564)', () => {
  let cache;
  beforeEach(() => { cache = createQueryCache(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('does not request attachments until the tab becomes active', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const { rerender } = renderHook(
      ({ active }) => useAttachments(opts({ isActive: active })),
      { wrapper: makeWrapper(cache), initialProps: { active: false } },
    );
    await act(async () => {});
    expect(counts.list).toBeUndefined(); // inactive → no request

    rerender({ active: true });
    await waitFor(() => expect(counts.list).toBe(1)); // activated → one request
  });

  it('reopening the attachments tab reuses fresh cached data', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await waitFor(() => expect(counts.list).toBe(1));
    a.unmount();

    renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await act(async () => {});
    expect(counts.list).toBe(1); // reused from cache, no new request
  });

  it('uploading invalidates the cached list so a reopen refetches', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await waitFor(() => expect(counts.list).toBe(1));
    await act(async () => { await a.result.current.upload(new File(['x'], 'f.txt')); });
    expect(counts.upload).toBe(1);
    a.unmount();

    renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await waitFor(() => expect(counts.list).toBe(2)); // invalidated → refetch
  });

  it('deleting invalidates the cached list so a reopen refetches', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await waitFor(() => expect(counts.list).toBe(1));
    await act(async () => { await a.result.current.remove('a1'); });
    expect(counts.delete).toBe(1);
    a.unmount();

    renderHook(() => useAttachments(opts({ isActive: true })), { wrapper: makeWrapper(cache) });
    await waitFor(() => expect(counts.list).toBe(2));
  });

  // ETP-5526: the count and the list are cached under separate keys — one read
  // never answers the other, in either order.
  it.each([
    ['a cached count does not answer the list', 'count-first'],
    ['a cached list does not answer the count', 'list-first'],
  ])('count and list use separate cache keys: %s', async (_label, order) => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;
    const wrapper = makeWrapper(cache);

    if (order === 'count-first') {
      const { result, rerender } = renderHook(
        ({ active }) => useAttachments(opts({ isActive: active, prefetchCount: true })),
        { wrapper, initialProps: { active: false } },
      );
      await waitFor(() => expect(result.current.count).toBe(1));
      expect(counts.list).toBeUndefined();

      rerender({ active: true });
      await waitFor(() => expect(counts.list).toBe(1)); // not served by the cached count
      expect(counts.count).toBe(1);
    } else {
      const a = renderHook(() => useAttachments(opts({ isActive: true, prefetchCount: true })), { wrapper });
      await waitFor(() => expect(counts.list).toBe(1));
      expect(counts.count).toBeUndefined(); // active → the list length is the count
      a.unmount();

      const { result } = renderHook(() => useAttachments(opts({ isActive: false, prefetchCount: true })), { wrapper });
      await waitFor(() => expect(counts.count).toBe(1)); // not served by the cached list
      await waitFor(() => expect(result.current.count).toBe(1));
      expect(counts.list).toBe(1);
    }
  });

  it('reuses a cached count on reopen and re-requests it after an upload', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;
    const wrapper = makeWrapper(cache);
    const openBadgeOnly = () => renderHook(
      () => useAttachments(opts({ isActive: false, prefetchCount: true })),
      { wrapper },
    );

    const first = openBadgeOnly();
    await waitFor(() => expect(first.result.current.count).toBe(1));
    first.unmount();

    const second = openBadgeOnly();
    await waitFor(() => expect(second.result.current.count).toBe(1));
    expect(counts.count).toBe(1); // fresh cached count reused, no new request
    second.unmount();

    // Upload from an open tab (list loaded): marks the cached count stale too.
    const tab = renderHook(() => useAttachments(opts({ isActive: true })), { wrapper });
    await waitFor(() => expect(counts.list).toBe(1));
    await act(async () => { await tab.result.current.upload(new File(['x'], 'f.txt')); });
    expect(counts.upload).toBe(1);
    expect(counts.count).toBe(1); // the tab itself does not read the count
    tab.unmount();

    openBadgeOnly();
    await waitFor(() => expect(counts.count).toBe(2)); // invalidated → re-requested
  });

  it('cached attachments do not leak across organizations', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderHook(() => useAttachments(opts({ isActive: true })), {
      wrapper: makeWrapper(cache, { token: 'tok', selectedOrg: { id: 'o1' } }),
    });
    await waitFor(() => expect(counts.list).toBe(1));
    a.unmount();

    renderHook(() => useAttachments(opts({ isActive: true })), {
      wrapper: makeWrapper(cache, { token: 'tok', selectedOrg: { id: 'o2' } }),
    });
    await waitFor(() => expect(counts.list).toBe(2)); // distinct scope → refetch
  });
});
