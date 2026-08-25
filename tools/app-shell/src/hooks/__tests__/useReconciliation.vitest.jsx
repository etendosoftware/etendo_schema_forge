/**
 * Tests for the bank-reconciliation hooks: the GET readers (via useNeoResource)
 * and the shared useNeoPost mutation helper.
 *
 * ETP-4576 — the session is a server-side `__Host-` cookie, so every request
 * gates on `isAuthenticated` (never a client-held `token`), carries no
 * Authorization header, and opts into cookie transport with
 * `credentials: 'include'`. The POST actions are unsafe methods, so they must
 * also carry the session-bound `X-Go-CSRF` proof or the backend answers 403.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { setAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

import {
  usePendingStatementLines,
  useCandidateOperations,
  useReconcileGroup,
  useRemoveOperation,
  useReactivateSelected,
  useAutoMatch,
  useApplySuggestions,
} from '../useReconciliation.js';

const BASE = '/sws/neo/bank-reconciliation';

function getResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function postResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

function setPathname(pathname) {
  Object.defineProperty(window, 'location', {
    value: { pathname },
    writable: true,
  });
}

beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on. The builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    declareCookieSession();
  setPathname('/etendo/web/app');
  setAuthMock({ isAuthenticated: true, csrfToken: 'test-csrf' });
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePendingStatementLines (GET)', () => {
  it('stays idle (no fetch, empty data) when accountId is null', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    const { result } = renderHook(() => usePendingStatementLines(null));

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.lines).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.counts).toEqual({});
  });

  it('stays idle (no fetch) when the user is not authenticated', async () => {
    setAuthMock({ isAuthenticated: false, csrfToken: null });
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    const { result } = renderHook(() => usePendingStatementLines('acc-1'));

    // Give microtasks a tick to confirm no request escaped the gate.
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.lines).toEqual([]);
  });

  it('fetches the pendingLines action with accountId in the query string', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [], total: 0, counts: {} }));

    renderHook(() => usePendingStatementLines('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=pendingLines&accountId=acc-1`);
  });

  it('authenticates the GET with the session cookie, not a bearer token', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [], total: 0, counts: {} }));

    renderHook(() => usePendingStatementLines('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [, init] = globalThis.fetch.mock.calls[0];
    // The `__Host-` session cookie only travels when the request opts in.
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
  });

  it('appends optional date/q filters to the query string, skipping empties', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    renderHook(() =>
      usePendingStatementLines('acc-1', { dateFrom: '2026-01-01', dateTo: '', q: 'inv' }),
    );

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('dateFrom=2026-01-01');
    expect(url).toContain('q=inv');
    expect(url).not.toContain('dateTo=');
  });

  it('maps lines, total and counts from the payload', async () => {
    globalThis.fetch.mockResolvedValue(
      getResponse({ lines: [{ id: 'l1' }], total: '5', counts: { pending: 5 } }),
    );

    const { result } = renderHook(() => usePendingStatementLines('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([{ id: 'l1' }]);
    expect(result.current.total).toBe(5);
    expect(result.current.counts).toEqual({ pending: 5 });
  });

  it('falls back to empty defaults when the payload omits keys', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ unrelated: true }));

    const { result } = renderHook(() => usePendingStatementLines('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.lines).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.counts).toEqual({});
  });

  it('captures the error on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => usePendingStatementLines('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.lines).toEqual([]);
  });

  it('reload() re-issues the same request', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    const { result } = renderHook(() => usePendingStatementLines('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('useCandidateOperations (GET)', () => {
  it('stays idle when accountId or lineId is missing', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ candidates: [] }));

    const { result } = renderHook(() => useCandidateOperations('acc-1', null));

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.candidates).toEqual([]);
  });

  it('fetches the candidates action with accountId, lineId and docType', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ candidates: [{ id: 'c1' }] }));

    const { result } = renderHook(() => useCandidateOperations('acc-1', 'line-1', 'AP'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('action=candidates');
    expect(url).toContain('accountId=acc-1');
    expect(url).toContain('lineId=line-1');
    expect(url).toContain('docType=AP');
    expect(result.current.candidates).toEqual([{ id: 'c1' }]);
  });

  it('returns an empty array when candidates is absent', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ noise: 1 }));

    const { result } = renderHook(() => useCandidateOperations('acc-1', 'line-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.candidates).toEqual([]);
  });

  it('appends kind=invoices to the query when listing invoices', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ candidates: [{ id: 'c1', kind: 'invoice' }] }));

    const { result } = renderHook(() =>
      useCandidateOperations('acc-1', 'line-1', null, 'invoices'),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('action=candidates');
    expect(url).toContain('accountId=acc-1');
    expect(url).toContain('lineId=line-1');
    expect(url).toContain('kind=invoices');
    // docType is null here → must be skipped from the query string.
    expect(url).not.toContain('docType=');
  });
});

describe('useAutoMatch (GET)', () => {
  it('stays idle when accountId is null and exposes default kpis', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ groups: [] }));

    const { result } = renderHook(() => useAutoMatch(null));

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.groups).toEqual([]);
    expect(result.current.kpis).toEqual({
      pendingLines: 0, groupsFound: 0, opsToLink: 0, willCreate: 0,
    });
  });

  it('fetches the autoMatch action and maps groups + kpis', async () => {
    globalThis.fetch.mockResolvedValue(
      getResponse({ groups: [{ id: 'g1' }], kpis: { pendingLines: 3, groupsFound: 1, opsToLink: 2, willCreate: 0 } }),
    );

    const { result } = renderHook(() => useAutoMatch('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('action=autoMatch');
    expect(url).toContain('accountId=acc-1');
    expect(result.current.groups).toEqual([{ id: 'g1' }]);
    expect(result.current.kpis.pendingLines).toBe(3);
  });

  it('falls back to default kpis when the payload omits them', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ groups: [] }));

    const { result } = renderHook(() => useAutoMatch('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups).toEqual([]);
    expect(result.current.kpis).toEqual({
      pendingLines: 0, groupsFound: 0, opsToLink: 0, willCreate: 0,
    });
  });

  it('reload() re-issues the autoMatch request', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ groups: [] }));

    const { result } = renderHook(() => useAutoMatch('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // ETP-4922: the automatch preview intentionally has no date prefilter — suggestions with dates
  // outside the active Conciliación filter period must still surface. Locks in that the request
  // URL only ever carries `action` + `accountId`, never a date range.
  it('never sends a date range — the endpoint has no date filtering by design', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ groups: [] }));

    renderHook(() => useAutoMatch('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=autoMatch&accountId=acc-1`);
    expect(url).not.toContain('dateFrom=');
    expect(url).not.toContain('dateTo=');
  });
});

describe('useReconcileGroup (POST via useNeoPost)', () => {
  it('posts the reconcileGroup action with the payload and returns response.data', async () => {
    globalThis.fetch.mockResolvedValue(postResponse({ reconciledId: 'rec-1' }));

    const { result } = renderHook(() => useReconcileGroup());
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reconcile({ lineId: 'l1', ops: ['o1'] });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=reconcileGroup`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ lineId: 'l1', ops: ['o1'] });
    expect(returned).toEqual({ reconciledId: 'rec-1' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('authenticates the POST with the session cookie plus the X-Go-CSRF proof', async () => {
    globalThis.fetch.mockResolvedValue(postResponse({ reconciledId: 'rec-1' }));

    const { result } = renderHook(() => useReconcileGroup());
    await act(async () => {
      await result.current.reconcile({ lineId: 'l1', ops: ['o1'] });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    // The `__Host-` session cookie only travels when the request opts in, and an
    // unsafe method additionally needs the session-bound CSRF proof.
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
  });

  it('omits X-Go-CSRF (without throwing) when no CSRF proof is available', async () => {
    setAuthMock({ isAuthenticated: true, csrfToken: null });
    globalThis.fetch.mockResolvedValue(postResponse({ reconciledId: 'rec-1' }));

    const { result } = renderHook(() => useReconcileGroup());
    await act(async () => {
      await result.current.reconcile({ lineId: 'l1' });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReconcileGroup());
    let returned;
    await act(async () => {
      returned = await result.current.reconcile({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'Already reconciled', status: 'CONFLICT' } }),
    });

    const { result } = renderHook(() => useReconcileGroup());

    await act(async () => {
      await expect(result.current.reconcile({})).rejects.toThrow('Already reconciled');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.status).toBe('CONFLICT');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to "HTTP <status>" when the error body cannot be parsed', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useReconcileGroup());

    await act(async () => {
      await expect(result.current.reconcile({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useReconcileGroup());

    await act(async () => {
      await expect(result.current.reconcile({})).rejects.toThrow('Network down');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
  });
});

// Payload shared by the two un-reconcile actions below — both take the same
// { financialAccountId, statementLineId, transactionIds } shape and differ only in the action they
// POST to (and therefore in the backend effect: delete the reconciliation vs. leave it in draft).
const UNRECONCILE_PAYLOAD = {
  financialAccountId: 'acc-1',
  statementLineId: 'l1',
  transactionIds: ['t1'],
};

describe('useRemoveOperation (POST via useNeoPost)', () => {
  it('posts the removeOperation action with the payload and returns response.data', async () => {
    globalThis.fetch.mockResolvedValue(postResponse({ transactionIds: ['t1'] }));

    const { result } = renderHook(() => useRemoveOperation());
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.removeOperation(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=removeOperation`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ transactionIds: ['t1'] });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useRemoveOperation());
    let returned;
    await act(async () => {
      returned = await result.current.removeOperation({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'Transaction not linked', status: 'CONFLICT' } }),
    });

    const { result } = renderHook(() => useRemoveOperation());

    await act(async () => {
      await expect(result.current.removeOperation({})).rejects.toThrow('Transaction not linked');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.status).toBe('CONFLICT');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to "HTTP <status>" when the error body cannot be parsed', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useRemoveOperation());

    await act(async () => {
      await expect(result.current.removeOperation({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useRemoveOperation());

    await act(async () => {
      await expect(result.current.removeOperation({})).rejects.toThrow('Network down');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
  });
});

describe('useReactivateSelected (POST via useNeoPost)', () => {
  it('posts the reactivateSelected action with the payload and returns response.data', async () => {
    globalThis.fetch.mockResolvedValue(postResponse({ reactivated: true }));

    const { result } = renderHook(() => useReactivateSelected());
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reactivateSelected(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=reactivateSelected`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ reactivated: true });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReactivateSelected());
    let returned;
    await act(async () => {
      returned = await result.current.reactivateSelected({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'Already in draft', status: 'CONFLICT' } }),
    });

    const { result } = renderHook(() => useReactivateSelected());

    await act(async () => {
      await expect(result.current.reactivateSelected({})).rejects.toThrow('Already in draft');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.status).toBe('CONFLICT');
    expect(result.current.loading).toBe(false);
  });

  it('falls back to "HTTP <status>" when the error body cannot be parsed', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useReactivateSelected());

    await act(async () => {
      await expect(result.current.reactivateSelected({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useReactivateSelected());

    await act(async () => {
      await expect(result.current.reactivateSelected({})).rejects.toThrow('Network down');
    });
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.loading).toBe(false);
  });
});

describe('useApplySuggestions (POST via useNeoPost)', () => {
  it('posts the applySuggestions action and returns parsed data', async () => {
    globalThis.fetch.mockResolvedValue(postResponse({ applied: 2 }));

    const { result } = renderHook(() => useApplySuggestions());
    let returned;
    await act(async () => {
      returned = await result.current.apply({ groups: ['g1', 'g2'] });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=applySuggestions`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ groups: ['g1', 'g2'] });
    expect(returned).toEqual({ applied: 2 });
  });

  it('propagates errors from the apply action', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Bad groups' } }),
    });

    const { result } = renderHook(() => useApplySuggestions());
    await act(async () => {
      await expect(result.current.apply({})).rejects.toThrow('Bad groups');
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
