// @covers tools/app-shell/src/windows/custom/invoice-inbox/useInvoiceInboxList.js
import { renderHook, act, waitFor } from '@testing-library/react';

const mockNextPage = vi.fn();
const mockCounts = vi.fn();
vi.mock('../invoiceInboxApi.js', () => ({
  fetchNextPage: (...a) => mockNextPage(...a),
  fetchCounts: (...a) => mockCounts(...a),
}));

import { useInvoiceInboxList } from '../useInvoiceInboxList.js';

const apiFetch = vi.fn();
const rows = (...ids) => ids.map((id) => ({ id }));

beforeEach(() => {
  mockNextPage.mockReset();
  mockCounts.mockReset().mockResolvedValue({ pending: 1, error: 2, confirmed: 3, discarded: 4 });
});

describe('useInvoiceInboxList', () => {
  it('loads the first page and the counters (with the derived all)', async () => {
    mockNextPage.mockResolvedValue({ rows: rows('a', 'b'), cursor: { index: 0, offset: 2 }, more: true });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);
    await waitFor(() => expect(result.current.counts).toEqual({ pending: 1, error: 2, confirmed: 3, discarded: 4, all: 6 }));
  });

  it('counts stay null until the first answer', async () => {
    mockNextPage.mockResolvedValue({ rows: [], cursor: { index: 1, offset: 0 }, more: false });
    mockCounts.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts).toBeNull();
  });

  it('loadMore appends the next page from the saved cursor', async () => {
    mockNextPage
      .mockResolvedValueOnce({ rows: rows('a'), cursor: { index: 0, offset: 1 }, more: true })
      .mockResolvedValueOnce({ rows: rows('b'), cursor: { index: 1, offset: 0 }, more: false });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(mockNextPage.mock.calls[1][2]).toEqual({ index: 0, offset: 1 });
    expect(result.current.hasMore).toBe(false);
  });

  it('loadMore dedupes rows by id (a row that shifted across pages is not shown twice)', async () => {
    mockNextPage
      .mockResolvedValueOnce({ rows: rows('a', 'b'), cursor: { index: 0, offset: 2 }, more: true })
      .mockResolvedValueOnce({ rows: rows('b', 'c'), cursor: { index: 0, offset: 4 }, more: false });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(2));
    expect(result.current.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('loadMore does nothing when there is no more', async () => {
    mockNextPage.mockResolvedValue({ rows: rows('a'), cursor: { index: 1, offset: 0 }, more: false });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.loadMore());
    expect(mockNextPage).toHaveBeenCalledTimes(1);
  });

  it('a filter change restarts from the first page', async () => {
    mockNextPage.mockResolvedValueOnce({ rows: rows('a'), cursor: { index: 0, offset: 1 }, more: true })
      .mockResolvedValueOnce({ rows: rows('e1'), cursor: { index: 1, offset: 0 }, more: false });
    const { result, rerender } = renderHook(({ f }) => useInvoiceInboxList(apiFetch, f), { initialProps: { f: 'all' } });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['a']));
    rerender({ f: 'error' });
    await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(['e1']));
    expect(mockNextPage.mock.calls[1][2]).toEqual({ index: 0, offset: 0 });
  });

  it('exposes loadError and empties the rows when the first page fails; reload retries', async () => {
    mockNextPage.mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValueOnce({ rows: rows('a'), cursor: { index: 1, offset: 0 }, more: false });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    expect(result.current.rows).toEqual([]);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(result.current.loadError).toBe(false);
  });

  it('replaceRows swaps rows in place by id and ignores empty input', async () => {
    mockNextPage.mockResolvedValue({ rows: [{ id: 'a', status: 'PROCESSING' }, { id: 'b', status: 'READY' }], cursor: { index: 1, offset: 0 }, more: false });
    const { result } = renderHook(() => useInvoiceInboxList(apiFetch, 'all'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => result.current.replaceRows([{ id: 'a', status: 'READY' }]));
    expect(result.current.rows).toEqual([{ id: 'a', status: 'READY' }, { id: 'b', status: 'READY' }]);
    act(() => result.current.replaceRows([]));
    expect(result.current.rows).toHaveLength(2);
  });
});
