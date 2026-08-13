import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useFinancialAccounts } from '../useFinancialAccounts.js';

describe('useFinancialAccounts', () => {
  beforeEach(() => {
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

  it('calls the financial-accounts-page endpoint with the bearer token', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [], summary: {} }));

    renderHook(() => useFinancialAccounts());

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-accounts-page');
    expect(init.headers.Authorization).toBe('Bearer test-token');
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
