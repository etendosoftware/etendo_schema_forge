// @covers tools/app-shell/src/hooks/useReconciliation.js
// @covers tools/app-shell/src/hooks/useReconciliationPost.js
// @covers tools/app-shell/src/hooks/useBouncePairActions.js
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
import { useReconciliationPost, RECONCILIATION_BASE_PATH } from '../useReconciliationPost.js';
import { useDiscardPair, usePendingLineCounts, useRestorePair } from '../useBouncePairActions.js';
import { findFetchCall } from './findFetchCall.js';

const BASE = '/sws/neo/bank-reconciliation';

// ETP-5424 — the provider must keep the seeded session for the whole test. Left on the default
// `auto` credential mode it probes `GET /sws/go/session` on mount; with a fetch mock that answers
// every URL alike, that probe "restored" a different session mid-test (and a failed probe logs
// out), so the POST's response was correctly discarded as superseded. The tests only passed while
// the POST happened to settle before the probe did. `restoreSession={null}` removes the probe, so
// there is no session swap to race against.
const wrapper = ({ children }) => (
  <AuthProvider initialSession={{ token: 'test-token' }} restoreSession={null}>
    {children}
  </AuthProvider>
);

// ETP-5195 — the provider also fires a silent `GET /sws/neo/refreshtoken` on mount. Route it to a
// 401 (which the refresh ignores, keeping the session) so only the hook's own action URL sees the
// response under test — a refresh must never be fed the action's body.
const AUTH_ENDPOINT = /\/sws\/(go\/session|neo\/refreshtoken)(\?|$)/;

function mockAction(impl) {
  globalThis.fetch.mockImplementation((url, init) => (
    AUTH_ENDPOINT.test(String(url))
      ? Promise.resolve({ ok: false, status: 401, json: async () => ({}) })
      : impl(url, init)
  ));
}

const mockActionResponse = (response) => mockAction(async () => response);
const mockActionRejection = (error) => mockAction(async () => { throw error; });

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

  // ETP-5581 — the Descartadas filter is served by its own request; the other filters stay
  // client-side over the default answer.
  it('sends status=discarded when asked, and refetches when the status changes', async () => {
    globalThis.fetch.mockResolvedValue(getResponse({ lines: [] }));

    const { rerender } = renderHook(
      ({ status }) => usePendingStatementLines('acc-1', { status }),
      { initialProps: { status: undefined } },
    );
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch.mock.calls[0][0]).not.toContain('status=');

    rerender({ status: 'discarded' });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(globalThis.fetch.mock.calls[1][0]).toBe(
      `/etendo${BASE}?action=pendingLines&accountId=acc-1&status=discarded`,
    );
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
    mockActionResponse(postResponse({ reconciledId: 'rec-1' }));

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reconcile({ lineId: 'l1', ops: ['o1'] });
    });

    const [url, init] = findFetchCall(`/etendo${BASE}?action=reconcileGroup`);
    expect(url).toBe(`/etendo${BASE}?action=reconcileGroup`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ lineId: 'l1', ops: ['o1'] });
    expect(returned).toEqual({ reconciledId: 'rec-1' });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    mockActionResponse({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReconcileGroup(), { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.reconcile({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    mockActionResponse({
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
    mockActionResponse({
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
    mockActionRejection(new Error('Network down'));

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
    mockActionResponse(postResponse({ transactionIds: ['t1'] }));

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.removeOperation(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = findFetchCall(`/etendo${BASE}?action=removeOperation`);
    expect(url).toBe(`/etendo${BASE}?action=removeOperation`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ transactionIds: ['t1'] });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    mockActionResponse({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useRemoveOperation(), { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.removeOperation({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    mockActionResponse({
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
    mockActionResponse({
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
    mockActionRejection(new Error('Network down'));

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
    mockActionResponse(postResponse({ reactivated: true }));

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });
    expect(result.current.loading).toBe(false);

    let returned;
    await act(async () => {
      returned = await result.current.reactivateSelected(UNRECONCILE_PAYLOAD);
    });

    const [url, init] = findFetchCall(`/etendo${BASE}?action=reactivateSelected`);
    expect(url).toBe(`/etendo${BASE}?action=reactivateSelected`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual(UNRECONCILE_PAYLOAD);
    expect(returned).toEqual({ reactivated: true });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns {} when response.data is absent', async () => {
    mockActionResponse({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useReactivateSelected(), { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.reactivateSelected({});
    });
    expect(returned).toEqual({});
  });

  it('throws and sets error with the server message on a non-ok response', async () => {
    mockActionResponse({
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
    mockActionResponse({
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
    mockActionRejection(new Error('Network down'));

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
    mockActionResponse(postResponse({ applied: 2 }));

    const { result } = renderHook(() => useApplySuggestions(), { wrapper });
    let returned;
    await act(async () => {
      returned = await result.current.apply({ groups: ['g1', 'g2'] });
    });

    const [url, init] = findFetchCall(`/etendo${BASE}?action=applySuggestions`);
    expect(url).toBe(`/etendo${BASE}?action=applySuggestions`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ groups: ['g1', 'g2'] });
    expect(returned).toEqual({ applied: 2 });
  });

  it('propagates errors from the apply action', async () => {
    mockActionResponse({
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
    mockActionResponse({
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
    mockActionResponse({
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
    mockActionResponse({
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

// ---------------------------------------------------------------------------
// ETP-5581 — the shared POST helper moved to its own module, and the two bounce-pair actions.
// Same AuthProvider `wrapper` as the POST hooks above: the session supplies the token.
// ---------------------------------------------------------------------------

describe('useReconciliationPost', () => {
  it('keeps the bank-reconciliation route as the base path of every action', () => {
    expect(RECONCILIATION_BASE_PATH).toBe(BASE);
  });

  it('posts ?action=<action> with the JSON payload and returns response.data', async () => {
    mockActionResponse(postResponse({ ok: 1 }));
    const { result } = renderHook(() => useReconciliationPost('anyAction'), { wrapper });

    let returned;
    await act(async () => { returned = await result.current.post({ a: 1 }); });

    const [, init] = findFetchCall(`/etendo${BASE}?action=anyAction`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ a: 1 });
    expect(returned).toEqual({ ok: 1 });
    expect(result.current.loading).toBe(false);
  });
});

/** A coded 409 refusal of a bounce action, as BankBounceErrors answers it. */
function bounceRefusal(code, messageKey, message) {
  return {
    ok: false,
    status: 409,
    json: async () => ({ error: { message, status: 409, messageKeys: [messageKey] }, code }),
  };
}

describe('useDiscardPair (POST discardPair)', () => {
  const PAYLOAD = { financialAccountId: 'acc-1', statementLineId: 'L-OUT', counterpartLineId: 'L-IN' };

  it('posts the discardPair action with the original and the bounce', async () => {
    const answer = { discarded: true, statementLineId: 'L-OUT', counterpartLineId: 'L-IN', signal: 'pis_link', confidence: 'high' };
    mockActionResponse(postResponse(answer));
    const { result } = renderHook(() => useDiscardPair(), { wrapper });

    let returned;
    await act(async () => { returned = await result.current.discardPair(PAYLOAD); });

    const [url, init] = findFetchCall(`/etendo${BASE}?action=discardPair`);
    expect(url).toBe(`/etendo${BASE}?action=discardPair`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual(PAYLOAD);
    expect(returned).toEqual(answer);
    expect(result.current.error).toBeNull();
  });

  it('exposes err.code and err.body of a coded 409 refusal', async () => {
    mockActionResponse(bounceRefusal('HAS_PAYMENT', 'ETGO_BounceHasPayment', 'One of the lines is the bank movement of a payment'));
    const { result } = renderHook(() => useDiscardPair(), { wrapper });

    let caught;
    await act(async () => { caught = await result.current.discardPair(PAYLOAD).catch((e) => e); });

    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(409);
    expect(caught.code).toBe('HAS_PAYMENT');
    expect(caught.body.error.messageKeys).toEqual(['ETGO_BounceHasPayment']);
    expect(result.current.error).toBe(caught);
    expect(result.current.loading).toBe(false);
  });
});

describe('useRestorePair (POST restorePair)', () => {
  it('posts the restorePair action with the line id', async () => {
    const answer = { restored: ['L-OUT', 'L-IN'], lineId: 'L-OUT', counterpartLineId: 'L-IN' };
    mockActionResponse(postResponse(answer));
    const { result } = renderHook(() => useRestorePair(), { wrapper });

    let returned;
    await act(async () => {
      returned = await result.current.restorePair({ financialAccountId: 'acc-1', lineId: 'L-OUT' });
    });

    const [, init] = findFetchCall(`/etendo${BASE}?action=restorePair`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body)).toEqual({ financialAccountId: 'acc-1', lineId: 'L-OUT' });
    expect(returned).toEqual(answer);
  });

  it('exposes err.code and err.body of a 409, and a null code when the body has none', async () => {
    mockActionResponse(bounceRefusal('LINE_NOT_PENDING', 'ETGO_BounceLineNotPending', 'not pending'));
    const { result } = renderHook(() => useRestorePair(), { wrapper });
    let caught;
    await act(async () => { caught = await result.current.restorePair({ lineId: 'x' }).catch((e) => e); });
    expect(caught.code).toBe('LINE_NOT_PENDING');
    expect(caught.body.code).toBe('LINE_NOT_PENDING');

    mockActionResponse({ ok: false, status: 409, json: async () => ({ error: { message: 'plain' } }) });
    await act(async () => { caught = await result.current.restorePair({ lineId: 'x' }).catch((e) => e); });
    expect(caught.message).toBe('plain');
    expect(caught.code).toBeNull();
    expect(caught.status).toBe(409);
  });
});

describe('usePendingLineCounts (GET pendingLines counts)', () => {
  it('asks the default pendingLines answer (no status) for the date range and returns its counts', async () => {
    const counts = { all: 8, pending: 3, bounce: 5, discarded: 1 };
    mockActionResponse(getResponse({ lines: [], total: 0, counts }));
    const { result } = renderHook(() => usePendingLineCounts(), { wrapper });

    let returned;
    await act(async () => {
      returned = await result.current({ financialAccountId: 'acc-1', dateFrom: '2026-01-01', dateTo: '2026-12-31' });
    });

    const [, init] = findFetchCall(`/etendo${BASE}?action=pendingLines&accountId=acc-1&dateFrom=2026-01-01&dateTo=2026-12-31`);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    expect(returned).toEqual(counts);
  });

  it('omits an absent date bound and answers null when the answer has no counts', async () => {
    mockActionResponse(getResponse({ lines: [] }));
    const { result } = renderHook(() => usePendingLineCounts(), { wrapper });
    let returned;
    await act(async () => { returned = await result.current({ financialAccountId: 'acc-1' }); });
    findFetchCall(`/etendo${BASE}?action=pendingLines&accountId=acc-1`);
    expect(returned).toBeNull();
  });

  it('rejects on a non-ok answer', async () => {
    mockActionResponse({ ok: false, status: 403, json: async () => ({}) });
    const { result } = renderHook(() => usePendingLineCounts(), { wrapper });
    let caught;
    await act(async () => { caught = await result.current({ financialAccountId: 'acc-1' }).catch((e) => e); });
    expect(caught).toBeInstanceOf(Error);
    expect(caught.message).toBe('HTTP 403');
  });
});
