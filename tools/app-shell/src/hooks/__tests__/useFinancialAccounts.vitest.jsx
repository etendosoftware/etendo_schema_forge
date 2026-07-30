import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * ETP-4576 — the session is a server-side `__Host-` cookie, so this hook gates
 * on `isAuthenticated` and sends no Authorization header.
 *
 * The auth mock is a plain mutable object, not a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
let mockAuth = { isAuthenticated: true };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

import { useFinancialAccounts } from '../useFinancialAccounts.js';

/** Asserts no request carried a bearer token — the point of ETP-4576. */
function expectNoAuthorizationHeader() {
  for (const [, init] of globalThis.fetch.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}

describe('useFinancialAccounts', () => {
  beforeEach(() => {
    mockAuth = { isAuthenticated: true };
    Object.defineProperty(window, 'location', {
      value: { pathname: '/etendo/web/app' },
      writable: true,
    });
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function okResponse(payload) {
    return { ok: true, json: async () => ({ response: { data: payload } }) };
  }

  it('starts in loading state and resolves with accounts + summary', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({
        accounts: [
          { id: 'a1', name: 'BBVA', type: 'B', currentBalance: 100, currencyIso: 'EUR', pendingCount: 0 },
        ],
        summary: {
          totalBalance: 100,
          byCurrency: [{ currencyIso: 'EUR', total: 100 }],
          pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
        },
      }),
    );

    const { result } = renderHook(() => useFinancialAccounts());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.summary.totalBalance).toBe(100);
    expect(result.current.error).toBeNull();
  });

  it('calls the financial-accounts-page endpoint without an Authorization header', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [], summary: {} }));

    renderHook(() => useFinancialAccounts());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-accounts-page');
    // ETP-4576 — the `__Host-` session cookie authenticates the request.
    expectNoAuthorizationHeader();
  });

  it('does not fetch when the user is not authenticated', async () => {
    mockAuth = { isAuthenticated: false };
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [], summary: {} }));

    const { result } = renderHook(() => useFinancialAccounts());

    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.accounts).toEqual([]);
  });

  it('fetches when authenticated even though the client holds no token', async () => {
    // The cookie-session shape: authenticated, no client-held token.
    mockAuth = { isAuthenticated: true, token: null };
    globalThis.fetch.mockResolvedValue(
      okResponse({ accounts: [{ id: 'a1', name: 'BBVA' }], summary: {} }),
    );

    const { result } = renderHook(() => useFinancialAccounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toHaveLength(1);
    expectNoAuthorizationHeader();
  });

  it('captures the error and keeps accounts empty on HTTP failure', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useFinancialAccounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('falls back to the empty summary shape when the API omits it', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [] }));

    const { result } = renderHook(() => useFinancialAccounts());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary).toEqual({
      totalBalance: 0,
      byCurrency: [],
      pending: { accountsWithPending: 0, suggestionsReady: 0, byRule: 0 },
    });
  });

  it('re-fetches when reload() is invoked', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [], summary: {} }));

    const { result } = renderHook(() => useFinancialAccounts());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reload();
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
