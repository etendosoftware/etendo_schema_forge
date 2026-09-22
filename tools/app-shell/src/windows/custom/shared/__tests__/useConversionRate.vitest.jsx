// Mock fetchOptionalJson BEFORE imports (Vitest hoisting)
vi.mock('../pdfUtils.js', () => ({
  fetchOptionalJson: vi.fn(),
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useConversionRate } from '../useConversionRate.js';
import { fetchOptionalJson } from '../pdfUtils.js';

// ETP-4504: prefills the editable conversion-rate field in the Cobros/Pagos
// modal when the invoice currency differs from the selected account currency.
// Modeled on useDocumentCurrency.vitest.jsx — same fetchOptionalJson mock shape.

const BASE_PARAMS = {
  fromCode: 'USD',       // invoice currency
  toCode: 'EUR',         // account currency
  date: '2026-01-15',
  apiBaseUrl: '/sws/neo/sales-invoice',
  token: 'test-token',
};

// The hook strips the last path segment of apiBaseUrl to reach the endpoint root.
const BASE_URL = '/sws/neo';

describe('useConversionRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Different currencies, rate found ────────────────────────────────────────

  describe('when the two currencies differ and the DB has a rate', () => {
    it('returns the rate and hasRate: true once loaded', async () => {
      fetchOptionalJson.mockResolvedValueOnce({ rate: 0.92 });

      const { result } = renderHook(() => useConversionRate(BASE_PARAMS));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBe(0.92);
      expect(result.current.hasRate).toBe(true);
    });

    it('calls validate-exchange-rate with the correct query params', async () => {
      fetchOptionalJson.mockResolvedValueOnce({ rate: 0.92 });

      renderHook(() => useConversionRate(BASE_PARAMS));

      await waitFor(() => expect(fetchOptionalJson).toHaveBeenCalledTimes(1));

      const [url, token] = fetchOptionalJson.mock.calls[0];
      expect(url).toContain(`${BASE_URL}/validate-exchange-rate`);
      expect(url).toContain('fromCurrency=USD');
      expect(url).toContain('toCurrency=EUR');
      expect(url).toContain('date=2026-01-15');
      expect(token).toBe('test-token');
    });
  });

  // ── Same currency → no fetch ────────────────────────────────────────────────

  describe('when both currencies are the same', () => {
    it('returns { rate: null, hasRate: false } and never fetches', async () => {
      const { result } = renderHook(() =>
        useConversionRate({ ...BASE_PARAMS, fromCode: 'EUR', toCode: 'EUR' }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBeNull();
      expect(result.current.hasRate).toBe(false);
      expect(fetchOptionalJson).not.toHaveBeenCalled();
    });
  });

  // ── Different currencies, no rate in the DB ─────────────────────────────────

  describe('when the currencies differ but the DB has no rate', () => {
    it('returns { rate: null, hasRate: false } (a null rate is not an error)', async () => {
      fetchOptionalJson.mockResolvedValueOnce({ rate: null });

      const { result } = renderHook(() => useConversionRate(BASE_PARAMS));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBeNull();
      expect(result.current.hasRate).toBe(false);
    });

    it('treats a null response body the same way (endpoint returned nothing)', async () => {
      fetchOptionalJson.mockResolvedValueOnce(null);

      const { result } = renderHook(() => useConversionRate(BASE_PARAMS));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBeNull();
      expect(result.current.hasRate).toBe(false);
    });
  });

  // ── Missing required params → no fetch ──────────────────────────────────────

  describe('when a required argument is missing', () => {
    it.each([
      ['fromCode', { fromCode: '' }],
      ['toCode', { toCode: '' }],
      ['apiBaseUrl', { apiBaseUrl: undefined }],
      // ETP-4576 — `token` is no longer one of these: under the cookie scheme the client holds
      // none, so treating it as a required argument skipped the lookup for every user.
      ['date', { date: '' }],
    ])('returns null/false and does not fetch when %s is missing', async (_name, override) => {
      const { result } = renderHook(() =>
        useConversionRate({ ...BASE_PARAMS, ...override }),
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBeNull();
      expect(result.current.hasRate).toBe(false);
      expect(fetchOptionalJson).not.toHaveBeenCalled();
    });
  });

  // ── Network error ───────────────────────────────────────────────────────────

  describe('when the fetch throws', () => {
    it('sets loading: false and safe defaults without crashing', async () => {
      fetchOptionalJson.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useConversionRate(BASE_PARAMS));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.rate).toBeNull();
      expect(result.current.hasRate).toBe(false);
    });
  });

  // ── Effect cleanup ──────────────────────────────────────────────────────────

  describe('effect cleanup', () => {
    it('does not set state after unmount (avoids stale setState)', async () => {
      let resolveRate;
      fetchOptionalJson.mockReturnValueOnce(
        new Promise((resolve) => { resolveRate = resolve; }),
      );

      const { result, unmount } = renderHook(() => useConversionRate(BASE_PARAMS));
      unmount();
      resolveRate({ rate: 0.92 });
      await new Promise((r) => setTimeout(r, 0));

      // After unmount the cancelled guard prevents the state update.
      expect(result.current.rate).toBeNull();
    });
  });
});
