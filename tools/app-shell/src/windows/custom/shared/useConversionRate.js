import { useState, useEffect } from 'react';
import { fetchOptionalJson } from './pdfUtils.js';

/**
 * Fetches the exchange rate between two currencies for a given date, used to
 * prefill the editable conversion-rate field in the Cobros/Pagos modal when the
 * invoice currency differs from the selected financial account's currency.
 *
 * Both ISO 4217 codes (e.g. "USD") and internal DB IDs are accepted for the
 * currency arguments — the server resolves either format unambiguously (same
 * contract as useDocumentCurrency / validate-exchange-rate).
 *
 * Returns { rate: null, hasRate: false } while loading, when the two currencies
 * match, when a required argument is missing, or when the DB has no rate for the
 * pair/date. A null rate is not an error here: the modal still lets the user type
 * a rate manually, so the caller only uses this value as a prefill.
 *
 * @param {object} params
 * @param {string} params.fromCode   - ISO 4217 code (or DB id) of the source currency (invoice currency)
 * @param {string} params.toCode     - ISO 4217 code (or DB id) of the target currency (account currency)
 * @param {string} params.date       - Rate date (ISO string, e.g. "2026-01-15")
 * @param {string} params.apiBaseUrl - Window API base (e.g. /sws/neo/sales-invoice)
 * @returns {{ rate: number|null, hasRate: boolean, loading: boolean }}
 */
export function useConversionRate({ fromCode, toCode, date, apiBaseUrl }) {
  const [state, setState] = useState({
    rate: null,
    hasRate: false,
    loading: true,
  });

  useEffect(() => {
    // Same currency (or missing inputs) → nothing to convert; no fetch needed.
    // ETP-4576 — `token` was part of this gate, and under a cookie session it is
    // structurally undefined, so the rate was never fetched: the conversion
    // fields rendered empty with no request and no error.
    if (!fromCode || !toCode || fromCode === toCode || !apiBaseUrl) {
      setState({ rate: null, hasRate: false, loading: false });
      return undefined;
    }
    if (!date) {
      setState({ rate: null, hasRate: false, loading: false });
      return undefined;
    }

    let cancelled = false;
    // Mirror useDocumentCurrency: apiBaseUrl includes the spec segment, so strip
    // the last path segment to reach the shared endpoint root.
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');
    setState(s => ({ ...s, loading: true }));

    (async () => {
      try {
        const rateData = await fetchOptionalJson(
          `${base}/validate-exchange-rate?fromCurrency=${encodeURIComponent(fromCode)}&toCurrency=${encodeURIComponent(toCode)}&date=${encodeURIComponent(date)}`,
        );
        if (cancelled) return;
        const rate = rateData?.rate ?? null;
        setState({ rate, hasRate: rate != null, loading: false });
      } catch {
        if (!cancelled) setState({ rate: null, hasRate: false, loading: false });
      }
    })();

    return () => { cancelled = true; };
  }, [fromCode, toCode, date, apiBaseUrl]);

  return state;
}
