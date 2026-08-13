import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useFinancialAccount } from '../useFinancialAccount.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

describe('useFinancialAccount', () => {
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

  it('hits the financial-accounts-page endpoint', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: [] }));

    renderHook(() => useFinancialAccount('acc-1'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-accounts-page');
  });

  it('returns the account matched by id', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({
        accounts: [
          { id: 'acc-1', name: 'BBVA' },
          { id: 'acc-2', name: 'Caixa' },
        ],
      }),
    );

    const { result } = renderHook(() => useFinancialAccount('acc-2'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.account).toEqual({ id: 'acc-2', name: 'Caixa' });
    expect(result.current.error).toBeNull();
  });

  it('returns null when no account matches the id', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ accounts: [{ id: 'acc-1', name: 'BBVA' }] }),
    );

    const { result } = renderHook(() => useFinancialAccount('nope'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.account).toBeNull();
  });

  it('compares ids as strings (numeric id from server still matches string id)', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ accounts: [{ id: 42, name: 'Cash' }] }),
    );

    const { result } = renderHook(() => useFinancialAccount('42'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.account).toEqual({ id: 42, name: 'Cash' });
  });

  it('treats a non-array accounts payload as empty', async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ accounts: null }));

    const { result } = renderHook(() => useFinancialAccount('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.account).toBeNull();
  });

  it('surfaces HTTP errors as error and keeps account null', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useFinancialAccount('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.account).toBeNull();
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
