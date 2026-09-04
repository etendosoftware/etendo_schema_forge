import { renderHook, waitFor, act } from '@testing-library/react';
import { setSessionCredentials, CREDENTIAL_MODES } from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';

// The GET hooks below (usePendingStatementLines, useCandidateOperations, useAutoMatch) still
// go through useNeoResource.js, which reads its token via the aliased `useAuth` — this mock
// covers those. The POST hooks (useNeoPost) were migrated to `useApiFetch` (ETP-5022), which
// reads auth via the core package's OWN relative import of AuthContext — this alias mock never
// crosses that boundary — so those describe blocks instead wrap with a real `AuthProvider`
// (imported directly from the core package below, bypassing this alias mock).
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { AuthProvider } from '@etendosoftware/app-shell-core/auth';
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

const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }}>{children}</AuthProvider>
);

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
  setPathname('/etendo/web/app');
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePendingStatementLines (GET)', () => {
  // ETP-4576 — apiFetch takes the credential from the active scheme, not from an argument,
  // so a test that expects an Authorization header has to declare the scheme first.
  beforeEach(() => setSessionCredentials({ mode: CREDENTIAL_MODES.bearer, token: 'test-token' }));

  it('stays idle (no fetch, empty data) when accountId is null', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    const { result } = renderHook(() => usePendingStatementLines(null));

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.lines).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.counts).toEqual({});
  });

  it('fetches the pendingLines action with accountId in the query string', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [], total: 0, counts: {} }));

    // usePendingStatementLines goes through useNeoResource, which is itself on useApiFetch —
    // same reasoning as the POST-hook `wrapper` above: a real AuthProvider is required for the
    // Authorization header assertion below to see a token.
    renderHook(() => usePendingStatementLines('acc-1'), { wrapper });

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=pendingLines&accountId=acc-1`);
    expect(init.headers.Authorization).toBe('Bearer test-token');
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

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reconcile({ lineId: 'l1', ops: ['o1'] });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=reconcileGroup`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ lineId: 'l1', ops: ['o1'] });
    expect(returned).toEqual({ reconciledId: 'rec-1' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });
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

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

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

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

    await act(async () => {
      await expect(result.current.reconcile({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

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

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.removeOperation(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=removeOperation`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ transactionIds: ['t1'] });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });
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

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });

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

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });

    await act(async () => {
      await expect(result.current.removeOperation({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });

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

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reactivateSelected(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`/etendo${BASE}?action=reactivateSelected`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ reactivated: true });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });
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

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });

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

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });

    await act(async () => {
      await expect(result.current.reactivateSelected({})).rejects.toThrow('HTTP 500');
    });
    expect(result.current.error.status).toBe(500);
  });

  it('throws and sets error when the network rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });

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

    const { result } = renderHook(() => useApplySuggestions(), { wrapper });
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

    const { result } = renderHook(() => useApplySuggestions(), { wrapper });
    await act(async () => {
      await expect(result.current.apply({})).rejects.toThrow('Bad groups');
    });
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ETP-4965 — useNeoPost used to build the thrown Error out of `error.message` + status only, and
// DISCARD the rest of the parsed body. That made every machine-readable field the backend already
// sends invisible to callers: the 400's `code` (which tells the panel to open the accounting-concept
// picker and retry instead of just red-toasting an English sentence) and the 409's
// `remainderLineId` (which tells it to retarget the pending sub-line). Attaching the parsed JSON to
// `err.body` is the prerequisite for both flows.
describe('useNeoPost error body (ETP-4965)', () => {
  it('attaches the parsed error body to the thrown error', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'An accounting concept is required', status: 400 },
        code: 'GL_ITEM_REQUIRED',
        differenceAmount: '0.38',
      }),
    });

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

    let caught;
    await act(async () => {
      caught = await result.current.reconcile({}).catch((e) => e);
    });

    // The message/status contract is unchanged...
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('An accounting concept is required');
    expect(caught.status).toBe(400);
    // ...and the rest of the body is now reachable, which is the whole point.
    expect(caught.body).toEqual({
      error: { message: 'An accounting concept is required', status: 400 },
      code: 'GL_ITEM_REQUIRED',
      differenceAmount: '0.38',
    });
    expect(caught.body.code).toBe('GL_ITEM_REQUIRED');
    // The same error instance is what `error` exposes, so a component reading either sees the body.
    expect(result.current.error.body.code).toBe('GL_ITEM_REQUIRED');
  });

  it('exposes the 409 remainderLineId so the caller can retarget the pending sub-line', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: { message: 'Statement line is already reconciled', status: 409 },
        remainderLineId: 'LP1-rem',
      }),
    });

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

    let caught;
    await act(async () => {
      caught = await result.current.reconcile({}).catch((e) => e);
    });

    expect(caught.status).toBe(409);
    expect(caught.body.remainderLineId).toBe('LP1-rem');
  });

  it('leaves body undefined (never throws) when the error payload is not JSON', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });

    let caught;
    await act(async () => {
      caught = await result.current.reconcile({}).catch((e) => e);
    });

    expect(caught.message).toBe('HTTP 500');
    expect(caught.status).toBe(500);
    // `json` parsed to null — reading `.code` off the body must not blow up in the caller.
    expect(caught.body ?? null).toBeNull();
  });
});
