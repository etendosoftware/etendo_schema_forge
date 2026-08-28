// Vitest tests for useActividadesIae — the "Actividades del IAE" data hook (ETP-4975).
//
// Focus: real fetch call shapes (load/create/update/delete) and, most importantly,
// enforceSingleDefault's hand-rolled replacement for Classic's SL_IsDefault callout
// (see the docstring in ../useActividadesIae.js) — it must persist `default: false`
// on every OTHER row via a REAL PATCH call, not just flip local component state.

import { renderHook, act, waitFor } from '@testing-library/react';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

import { useActividadesIae } from '../useActividadesIae.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body });
}

function rowsResponse(rows) {
  return jsonResponse({ response: { data: rows } });
}

function patchCallsOf(fetchMock) {
  return fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'PATCH');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useActividadesIae — load', () => {
  it('does not fetch and stays empty when orgId is falsy', () => {
    globalThis.fetch = vi.fn();
    const { result } = renderHook(() => useActividadesIae(null, API_BASE_URL));
    expect(result.current.loading).toBe(false);
    expect(result.current.rows).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fetches rows scoped to the org on mount', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      rowsResponse([{ id: 'row-1', default: true, epiaeCode: 'C1' }]),
    );
    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.rows).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining(`/actividadesDelIae?parentId=${ORG_ID}&_limit=100`),
      expect.anything(),
    );
  });

  it('sets an error and empty rows on a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.rows).toEqual([]);
  });
});

describe('useActividadesIae — createRow / updateRow / deleteRow', () => {
  it('createRow POSTs with parentId injected into the body (NeoCrudHandler#injectParentIdAsProperty)', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([]))
      .mockResolvedValueOnce(jsonResponse({ response: { data: [{ id: 'new-1' }] } }));

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createRow({ epgrafeIAE: 'x', default: false });
    });

    expect(created).toEqual({ id: 'new-1' });
    const postCall = globalThis.fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
    expect(postCall[0]).toContain('/actividadesDelIae');
    expect(JSON.parse(postCall[1].body)).toEqual({ epgrafeIAE: 'x', default: false, parentId: ORG_ID });
  });

  it('updateRow PATCHes the given id with exactly the given payload', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([{ id: 'row-1' }]))
      .mockResolvedValueOnce(jsonResponse({ response: { data: [{ id: 'row-1', epgrafeIAE: 'new' }] } }));

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.updateRow('row-1', { epgrafeIAE: 'new' }); });

    const patchCall = globalThis.fetch.mock.calls.find(([, opts]) => opts?.method === 'PATCH');
    expect(patchCall[0]).toContain('/actividadesDelIae/row-1');
    expect(JSON.parse(patchCall[1].body)).toEqual({ epgrafeIAE: 'new' });
  });

  it('deleteRow DELETEs the given id', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([{ id: 'row-1' }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.deleteRow('row-1'); });

    const delCall = globalThis.fetch.mock.calls.find(([, opts]) => opts?.method === 'DELETE');
    expect(delCall[0]).toContain('/actividadesDelIae/row-1');
  });

  it('createRow rejects with an HTTP error on a non-ok response', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse([]))
      .mockResolvedValueOnce({ ok: false, status: 400 });

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.createRow({})).rejects.toThrow('HTTP 400');
  });
});

describe('useActividadesIae — enforceSingleDefault (single-default rule, ETP-4975)', () => {
  // This replaces Classic's unported SL_IsDefault callout — see the docstring in
  // useActividadesIae.js. The load-bearing property under test: it must issue REAL
  // PATCH requests against every other currently-default row, not just update local
  // component state (a stale reload or a second editor must never see two defaults).

  it('PATCHes default:false on every OTHER row currently marked default, excluding the kept row and rows already false', async () => {
    const rows = [
      { id: 'row-1', default: true },
      { id: 'row-2', default: 'Y' }, // legacy boolean-as-string encoding must also count
      { id: 'row-3', default: false },
      { id: 'row-4', default: true }, // the row being kept
    ];
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse(rows))
      .mockResolvedValue(jsonResponse({ response: { data: [{}] } }));

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    globalThis.fetch.mockClear();
    await act(async () => { await result.current.enforceSingleDefault('row-4'); });

    const patchCalls = patchCallsOf(globalThis.fetch);
    expect(patchCalls).toHaveLength(2);
    const urls = patchCalls.map(([url]) => url);
    expect(urls.some(u => u.includes('/actividadesDelIae/row-1'))).toBe(true);
    expect(urls.some(u => u.includes('/actividadesDelIae/row-2'))).toBe(true);
    expect(urls.some(u => u.includes('/actividadesDelIae/row-3'))).toBe(false);
    expect(urls.some(u => u.includes('/actividadesDelIae/row-4'))).toBe(false);
    patchCalls.forEach(([, opts]) => {
      expect(JSON.parse(opts.body)).toEqual({ default: false });
    });
  });

  it('does nothing (no PATCH calls) when no other row is currently default', async () => {
    const rows = [{ id: 'row-1', default: false }, { id: 'row-2', default: true }];
    globalThis.fetch = vi.fn().mockResolvedValueOnce(rowsResponse(rows));

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    globalThis.fetch.mockClear();
    await act(async () => { await result.current.enforceSingleDefault('row-2'); });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('swallows a failed PATCH on one sibling without throwing, and still PATCHes the others', async () => {
    const rows = [
      { id: 'row-1', default: true },
      { id: 'row-2', default: true },
      { id: 'row-3', default: true }, // kept
    ];
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(rowsResponse(rows))
      .mockImplementation((url) => {
        if (url.includes('/row-1')) return Promise.reject(new Error('network down'));
        return jsonResponse({ response: { data: [{}] } });
      });

    const { result } = renderHook(() => useActividadesIae(ORG_ID, API_BASE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));

    globalThis.fetch.mockClear();
    await expect(act(async () => {
      await result.current.enforceSingleDefault('row-3');
    })).resolves.toBeUndefined();

    const attemptedUrls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(attemptedUrls.some(u => u.includes('/actividadesDelIae/row-1'))).toBe(true);
    expect(attemptedUrls.some(u => u.includes('/actividadesDelIae/row-2'))).toBe(true);
  });
});
