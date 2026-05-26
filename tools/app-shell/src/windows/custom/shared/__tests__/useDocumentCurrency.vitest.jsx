// Mock fetchOptionalJson BEFORE imports (Vitest hoisting)
vi.mock('../pdfUtils.js', () => ({
  fetchOptionalJson: vi.fn(),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useDocumentCurrency } from '../useDocumentCurrency.js';
import { fetchOptionalJson } from '../pdfUtils.js';

// Base params reused across tests
const BASE_PARAMS = {
  docCurrencyCode: 'USD',
  orderDate: '2026-01-15',
  apiBaseUrl: '/sws/neo/sales-order',
  token: 'test-token',
};

// Expected base URL derived by stripping the last segment
const BASE_URL = '/sws/neo';

describe('useDocumentCurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Same currency ───────────────────────────────────────────────────────────

  describe('when doc currency matches org currency', () => {
    it('returns isSameCurrency: true, exchangeRate: null, loading: false', async () => {
      fetchOptionalJson.mockResolvedValueOnce({ currencyCode: 'USD' }); // session

      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isSameCurrency).toBe(true);
      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.orgCurrencyCode).toBe('USD');
      // exchange rate endpoint must NOT be called
      expect(fetchOptionalJson).toHaveBeenCalledTimes(1);
    });

    it('convertAmount returns original amount unchanged', async () => {
      fetchOptionalJson.mockResolvedValueOnce({ currencyCode: 'USD' });

      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.convertAmount(500)).toBe(500);
    });
  });

  // ── Different currencies, rate found ────────────────────────────────────────

  describe('when doc currency differs from org currency and a rate is found', () => {
    beforeEach(() => {
      fetchOptionalJson
        .mockResolvedValueOnce({ currencyCode: 'EUR' })              // session
        .mockResolvedValueOnce({ rate: 0.86 });                       // validate-exchange-rate
    });

    it('returns isSameCurrency: false, exchangeRate set, loading: false', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isSameCurrency).toBe(false);
      expect(result.current.exchangeRate).toBe(0.86);
      expect(result.current.orgCurrencyCode).toBe('EUR');
    });

    it('calls validate-exchange-rate with correct query params', async () => {
      renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(fetchOptionalJson).toHaveBeenCalledTimes(2));

      const rateUrl = fetchOptionalJson.mock.calls[1][0];
      expect(rateUrl).toContain(`${BASE_URL}/validate-exchange-rate`);
      expect(rateUrl).toContain('fromCurrency=USD');
      expect(rateUrl).toContain('toCurrency=EUR');
      expect(rateUrl).toContain('date=2026-01-15');
    });

    it('convertAmount returns amount * exchangeRate', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.convertAmount(200)).toBeCloseTo(200 * 0.86);
    });
  });

  // ── Different currencies, no rate ───────────────────────────────────────────

  describe('when doc currency differs from org currency but no rate is available', () => {
    beforeEach(() => {
      fetchOptionalJson
        .mockResolvedValueOnce({ currencyCode: 'EUR' })   // session
        .mockResolvedValueOnce(null);                      // validate-exchange-rate returns null
    });

    it('returns exchangeRate: null, isSameCurrency: false, loading: false', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.isSameCurrency).toBe(false);
    });

    it('convertAmount returns null when no rate is available', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: 'USD' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.convertAmount(200)).toBeNull();
    });
  });

  // ── Missing required params ─────────────────────────────────────────────────

  describe('when required params are missing', () => {
    it('sets loading: false immediately when docCurrencyCode is absent', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, docCurrencyCode: undefined }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchOptionalJson).not.toHaveBeenCalled();
    });

    it('sets loading: false immediately when apiBaseUrl is absent', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, apiBaseUrl: undefined }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchOptionalJson).not.toHaveBeenCalled();
    });

    it('sets loading: false immediately when token is absent', async () => {
      const { result } = renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, token: undefined }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(fetchOptionalJson).not.toHaveBeenCalled();
    });
  });

  // ── Session fetch failure ───────────────────────────────────────────────────

  describe('when session fetch throws a network error', () => {
    it('sets loading: false without crashing', async () => {
      fetchOptionalJson.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useDocumentCurrency(BASE_PARAMS));

      await waitFor(() => expect(result.current.loading).toBe(false));

      // State should remain at safe defaults
      expect(result.current.exchangeRate).toBeNull();
      expect(result.current.orgCurrencyCode).toBeNull();
    });
  });

  // ── Effect cleanup (cancelled) ──────────────────────────────────────────────

  describe('effect cleanup', () => {
    it('does not set state after unmount (avoids stale setState)', async () => {
      // Delay resolution so the unmount happens before the async chain settles
      let resolveSession;
      fetchOptionalJson.mockReturnValueOnce(
        new Promise((resolve) => { resolveSession = resolve; }),
      );

      const { result, unmount } = renderHook(() => useDocumentCurrency(BASE_PARAMS));

      // Unmount before the fetch resolves
      unmount();

      // Now resolve — if cancelled guard is broken, this would call setState on
      // an unmounted component and produce a warning. The test passes if no error
      // or warning is thrown.
      resolveSession({ currencyCode: 'EUR' });

      // Give microtasks a tick to flush
      await new Promise((r) => setTimeout(r, 0));

      // After unmount the result should still reflect the initial state
      expect(result.current.loading).toBe(true);
    });
  });

  // ── URL base derivation ─────────────────────────────────────────────────────

  describe('API URL construction', () => {
    it('strips the last path segment to build the base URL for /session', async () => {
      fetchOptionalJson.mockResolvedValue({ currencyCode: 'USD' });

      renderHook(() =>
        useDocumentCurrency({ ...BASE_PARAMS, apiBaseUrl: '/sws/neo/sales-order' }),
      );

      await waitFor(() => expect(fetchOptionalJson).toHaveBeenCalled());

      const sessionUrl = fetchOptionalJson.mock.calls[0][0];
      expect(sessionUrl).toBe('/sws/neo/session');
    });

    it('passes the token as the second argument to fetchOptionalJson', async () => {
      fetchOptionalJson.mockResolvedValue({ currencyCode: 'USD' });

      renderHook(() => useDocumentCurrency({ ...BASE_PARAMS, token: 'my-token' }));

      await waitFor(() => expect(fetchOptionalJson).toHaveBeenCalled());

      expect(fetchOptionalJson.mock.calls[0][1]).toBe('my-token');
    });
  });
});
