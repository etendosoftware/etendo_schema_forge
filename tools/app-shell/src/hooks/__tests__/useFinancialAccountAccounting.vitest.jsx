/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: both of its requests must pass
 * `credentials: 'include'` explicitly and carry NO Authorization header.
 *
 * This hook is the sharpest GET/POST asymmetry in the batch — one read and one
 * write against the SAME entity path, previously sharing one header builder.
 * The `X-Go-CSRF` proof only belongs on the unsafe method, so:
 *   - `saveAccountingConfiguration` (POST) MUST send it;
 *   - `fetchAccountingConfiguration` (GET) MUST NOT.
 * An implementation that reaches for one blanket header function fails one of
 * the two, whichever way it is written.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook, act } from '@testing-library/react';

let mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

import { useFinancialAccountAccounting } from '../useFinancialAccountAccounting.js';

// ETP-4530 — Tab Contabilidad. This hook is a thin fetch/save wrapper around the
// `accountingConfiguration` entity (fully intercepted server-side by
// FinancialAccountAccountingHandler). It is only exercised indirectly (mocked away) in
// EditAccountModal.vitest.jsx / index.vitest.jsx, so it needs direct coverage of its own
// request shape, response unwrapping, and error mapping.

const ENTITY_URL = '/etendo/sws/neo/financial-account/accountingConfiguration';
const CSRF_HEADER = 'X-Go-CSRF';

function okResponse(rows) {
  return { ok: true, json: async () => ({ response: { data: rows } }) };
}

function errorResponse(status, message) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}

/** Asserts no request carried a bearer token — the point of ETP-4576. */
function expectNoAuthorizationHeader() {
  for (const [, init] of globalThis.fetch.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}

/** Cookie-session request shape shared by every call: explicit credentials. */
function expectSendsSessionCookie(init) {
  expect(init.credentials).toBe('include');
}

describe('useFinancialAccountAccounting', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── fetchAccountingConfiguration ─────────────────────────────────────────

  it('fetchAccountingConfiguration GETs the entity with financialAccountId and the cookie session', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: null }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}?financialAccountId=acc-1`);
    expect(init.method).toBeUndefined(); // GET: no explicit method
    expectSendsSessionCookie(init);
    expect(init.headers['Content-Type']).toBe('application/json');
    expectNoAuthorizationHeader();
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: null });
  });

  it('fetchAccountingConfiguration does not attach the CSRF proof to the safe GET', async () => {
    // The asymmetry that matters: the read and the write hit the same entity
    // path, so a single blanket header builder would leak the proof onto this
    // GET. Safe methods must never carry it.
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.fetchAccountingConfiguration('acc-1');
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBeUndefined();
    expect(Object.keys(init.headers ?? {})).not.toContain(CSRF_HEADER);
    expectSendsSessionCookie(init);
    expectNoAuthorizationHeader();
  });

  it('fetchAccountingConfiguration URL-encodes the account id', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.fetchAccountingConfiguration('acc/with space');
    });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(`${ENTITY_URL}?financialAccountId=acc%2Fwith%20space`);
  });

  it('fetchAccountingConfiguration returns the first record of the response.data envelope', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', fINAssetAcct: 'AST1' }, { id: 'row-2', fINAssetAcct: 'AST2' }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  it('fetchAccountingConfiguration unwraps a non-array data envelope (single object)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ id: 'row-1', fINAssetAcct: 'AST1' }));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  it('fetchAccountingConfiguration returns null when the envelope has no data', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toBeNull();
  });

  it('fetchAccountingConfiguration returns null when the data array is empty', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    let row;
    await act(async () => {
      row = await result.current.fetchAccountingConfiguration('acc-1');
    });
    expect(row).toBeNull();
  });

  it('fetchAccountingConfiguration throws an Error with .status on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(404, 'no ledger'));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.fetchAccountingConfiguration('acc-1'),
      ).rejects.toMatchObject({ message: 'no ledger', status: 404 });
    });
  });

  it('fetchAccountingConfiguration falls back to "HTTP <status>" when the error body is unparseable', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.fetchAccountingConfiguration('acc-1'),
      ).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
    });
  });

  it('fetchAccountingConfiguration stays pending until the underlying fetch settles (loading semantics)', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let resolved = false;
    let capturedRow;
    const promise = result.current.fetchAccountingConfiguration('acc-1').then((row) => {
      resolved = true;
      capturedRow = row;
    });

    // Flush microtasks — the fetch promise has not settled yet, so the hook's
    // promise (what a caller would gate a `loading` flag on) must still be pending.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    await act(async () => {
      resolveFetch(okResponse([{ id: 'row-1', fINAssetAcct: 'AST1' }]));
      await promise;
    });

    expect(resolved).toBe(true);
    expect(capturedRow).toEqual({ id: 'row-1', fINAssetAcct: 'AST1' });
  });

  // ── saveAccountingConfiguration ──────────────────────────────────────────

  it('saveAccountingConfiguration POSTs the DAL field names with the cookie session and CSRF proof', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse([{ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: 'TRA1' }]),
    );

    const { result } = renderHook(() => useFinancialAccountAccounting());

    let saved;
    await act(async () => {
      saved = await result.current.saveAccountingConfiguration('acc-1', {
        fINAssetAcct: 'AST1',
        fINTransitoryAcct: 'TRA1',
      });
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(ENTITY_URL);
    expect(init.method).toBe('POST');
    expectSendsSessionCookie(init);
    expect(init.headers[CSRF_HEADER]).toBe('test-csrf');
    expect(init.headers['Content-Type']).toBe('application/json');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'acc-1',
      fINAssetAcct: 'AST1',
      fINTransitoryAcct: 'TRA1',
    });
    expect(saved).toEqual({ id: 'row-1', fINAssetAcct: 'AST1', fINTransitoryAcct: 'TRA1' });
  });

  it('saveAccountingConfiguration omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    mockAuth = { isAuthenticated: true, csrfToken: null };
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.saveAccountingConfiguration('acc-1', { fINAssetAcct: 'AST1' });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(Object.keys(init.headers ?? {})).not.toContain(CSRF_HEADER);
    expectSendsSessionCookie(init);
    expectNoAuthorizationHeader();
  });

  it('saveAccountingConfiguration coerces a falsy Cuenta transitoria to null (optional field)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.saveAccountingConfiguration('acc-1', {
        fINAssetAcct: 'AST1',
        fINTransitoryAcct: '',
      });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'acc-1',
      fINAssetAcct: 'AST1',
      fINTransitoryAcct: null,
    });
  });

  it('saveAccountingConfiguration coerces a falsy Cuenta bancaria to null (defensive — required is enforced client-side)', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.saveAccountingConfiguration('acc-1', {
        fINAssetAcct: undefined,
        fINTransitoryAcct: undefined,
      });
    });

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      financialAccountId: 'acc-1',
      fINAssetAcct: null,
      fINTransitoryAcct: null,
    });
  });

  it('saveAccountingConfiguration throws an Error with .status on a non-ok response', async () => {
    globalThis.fetch.mockResolvedValue(errorResponse(400, 'invalid account'));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.saveAccountingConfiguration('acc-1', { fINAssetAcct: 'AST1' }),
      ).rejects.toMatchObject({ message: 'invalid account', status: 400 });
    });
  });

  it('saveAccountingConfiguration falls back to "HTTP <status>" when the error body is unparseable', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await expect(
        result.current.saveAccountingConfiguration('acc-1', { fINAssetAcct: 'AST1' }),
      ).rejects.toMatchObject({ message: 'HTTP 500', status: 500 });
    });
  });

  // ── GET/POST asymmetry on the same entity path ──────────────────────────────

  it('sends the CSRF proof on the write but not on the read of the same entity', async () => {
    globalThis.fetch.mockResolvedValue(okResponse([{ id: 'row-1' }]));

    const { result } = renderHook(() => useFinancialAccountAccounting());
    await act(async () => {
      await result.current.fetchAccountingConfiguration('acc-1');
      await result.current.saveAccountingConfiguration('acc-1', { fINAssetAcct: 'AST1' });
    });

    const [getUrl, getInit] = globalThis.fetch.mock.calls[0];
    const [postUrl, postInit] = globalThis.fetch.mock.calls[1];
    expect(getUrl.startsWith(ENTITY_URL)).toBe(true);
    expect(postUrl).toBe(ENTITY_URL);

    expect(getInit.method).toBeUndefined();
    expect(Object.keys(getInit.headers ?? {})).not.toContain(CSRF_HEADER);

    expect(postInit.method).toBe('POST');
    expect(postInit.headers[CSRF_HEADER]).toBe('test-csrf');

    expectSendsSessionCookie(getInit);
    expectSendsSessionCookie(postInit);
    expectNoAuthorizationHeader();
  });
});
