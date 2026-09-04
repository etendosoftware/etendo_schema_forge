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
