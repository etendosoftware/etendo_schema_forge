/**
 * useEntity — the `meta` field (ETP-4658 Fase 0).
 *
 * NEO serialises a handler's response body verbatim, so a NeoHandler's `afterHandle` can
 * attach collection-level aggregates next to `response.data` (the accounts list ships a
 * `summary` with the balance totals its sidebar renders). Those siblings used to be parsed
 * and dropped; `meta` surfaces everything in the list envelope except the rows.
 *
 * Covered here: populated from the siblings on the initial fetch, null for a bare array
 * and for an envelope with no siblings, reset to null when the fetch fails, and refreshed
 * (not merged) on loadMore.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntity } from '../useEntity';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Matches useEntity's own BATCH_SIZE — a full page keeps `hasMore` true so loadMore runs.
const BATCH_SIZE = 75;

const SUMMARY = {
  totalBalance: 273853.46,
  byCurrency: [{ currencyIso: 'EUR', total: 273853.46 }],
  pending: { accountsWithPending: 3, suggestionsReady: 0, byRule: 0 },
};

function fullPage(prefix) {
  return Array.from({ length: BATCH_SIZE }, (_, i) => ({ id: `${prefix}-${i}` }));
}

describe('useEntity — meta', () => {
  const defaultOpts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(opts = {}) {
    return renderHook(() => useEntity('account', null, { ...defaultOpts, ...opts }));
  }

  it('starts as null before the list fetch resolves', () => {
    globalThis.fetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderEntity();

    expect(result.current.meta).toBeNull();
  });

  it('exposes every sibling of response.data after the list fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: { data: [{ id: 'acc-1' }], totalRows: 1, summary: SUMMARY },
      }),
    });

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta).toEqual({ totalRows: 1, summary: SUMMARY });
  });

  it('does not include the rows themselves in meta', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'acc-1' }], summary: SUMMARY } }),
    });

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta).not.toHaveProperty('data');
    expect(result.current.items).toHaveLength(1);
  });

  it('is null when the envelope carries no siblings besides the rows', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'acc-1' }] } }),
    });

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta).toBeNull();
  });

  it('is null for a bare-array payload (no response envelope at all)', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'acc-1' }],
    });

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.meta).toBeNull();
  });

  it('is null when the response envelope is not an object', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: 'unexpected' }),
    });

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta).toBeNull();
  });

  it('resets to null when the list fetch fails', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));

    const { result } = renderEntity();

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(result.current.meta).toBeNull();
  });

  it('resets to null when a refresh after a good fetch fails', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'acc-1' }], summary: SUMMARY } }),
      })
      .mockRejectedValueOnce(new Error('network'));

    const { result } = renderEntity();
    await waitFor(() => expect(result.current.meta).not.toBeNull());

    await act(async () => { result.current.refresh(); });

    await waitFor(() => expect(result.current.meta).toBeNull());
  });

  it('refreshes meta from the newest page on loadMore instead of merging', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: fullPage('p1'), summary: SUMMARY } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: { data: [{ id: 'p2-0' }], summary: { ...SUMMARY, totalBalance: 42 } },
        }),
      });

    const { result } = renderEntity();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meta.summary.totalBalance).toBe(SUMMARY.totalBalance);

    await act(async () => { result.current.loadMore(); });

    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.items).toHaveLength(BATCH_SIZE + 1);
    expect(result.current.meta.summary.totalBalance).toBe(42);
  });

  it('leaves meta untouched when loadMore fails', async () => {
    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: fullPage('p1'), summary: SUMMARY } }),
      })
      .mockRejectedValueOnce(new Error('network'));

    const { result } = renderEntity();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { result.current.loadMore(); });

    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.meta).toEqual({ summary: SUMMARY });
  });
});
