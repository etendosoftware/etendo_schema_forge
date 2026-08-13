import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

import { useAccountMovements } from '../useAccountMovements.js';

function okResponse(payload) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

describe('useAccountMovements', () => {
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

  it('hits financial-account-transactions with the account id in the query string', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ transactions: [], totals: {} }),
    );

    renderHook(() => useAccountMovements('acc-1'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-account-transactions');
    expect(url).toContain('FIN_Financial_Account_ID=acc-1');
  });

  it('URL-encodes special characters in the account id', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ transactions: [], totals: {} }),
    );

    renderHook(() => useAccountMovements('acc/with space'));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const [url] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('FIN_Financial_Account_ID=acc%2Fwith%20space');
  });

  it('maps transactions + totals from the response payload', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({
        transactions: [
          { id: 'm1', amount: 100, paymentStatus: 'RPR' },
          { id: 'm2', amount: -50, paymentStatus: 'RPAP' },
        ],
        totals: { balance: 50, inflows: 100, outflows: -50, currency: 'USD' },
      }),
    );

    const { result } = renderHook(() => useAccountMovements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.movements).toHaveLength(2);
    expect(result.current.movements[0].id).toBe('m1');
    expect(result.current.totals).toEqual({
      balance: 50,
      inflows: 100,
      outflows: -50,
      currency: 'USD',
    });
  });

  it('normalizes missing totals to the empty totals shape with EUR fallback', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ transactions: [], totals: null }),
    );

    const { result } = renderHook(() => useAccountMovements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totals).toEqual({
      balance: 0,
      inflows: 0,
      outflows: 0,
      currency: 'EUR',
    });
  });

  it('coerces numeric totals fields with Number()', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({
        transactions: [],
        totals: { balance: '12.5', inflows: '10', outflows: '0' },
      }),
    );

    const { result } = renderHook(() => useAccountMovements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.totals.balance).toBe(12.5);
    expect(result.current.totals.inflows).toBe(10);
    expect(result.current.totals.currency).toBe('EUR');
  });

  it('returns empty movements + EUR fallback totals when accountId is falsy (no fetch)', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ transactions: [], totals: {} }),
    );

    const { result } = renderHook(() => useAccountMovements(''));

    // No fetch should be issued — the hook stays idle
    await new Promise((r) => setTimeout(r, 0));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.movements).toEqual([]);
    expect(result.current.totals.currency).toBe('EUR');
  });

  it('treats a non-array transactions field as empty', async () => {
    globalThis.fetch.mockResolvedValue(
      okResponse({ transactions: null, totals: {} }),
    );

    const { result } = renderHook(() => useAccountMovements('acc-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.movements).toEqual([]);
  });
});
