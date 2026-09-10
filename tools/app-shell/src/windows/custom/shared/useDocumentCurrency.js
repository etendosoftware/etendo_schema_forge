import { useState, useEffect } from 'react';
import { fetchOptionalJson } from './pdfUtils.js';

/**
 * Fetches the org currency from session and, if the document currency differs,
 * fetches the exchange rate from the validate-exchange-rate endpoint.
 *
 * Both ISO 4217 codes (e.g. "USD") and internal DB IDs are accepted for
 * docCurrencyCode — the server resolves either format unambiguously.
 *
 * Returns null values while loading or when currencies match.
 *
 * @param {object} params
 * @param {string} params.docCurrencyCode - ISO 4217 code of the document currency (e.g. "USD"),
 *                                          typically order['currency$_identifier']
 * @param {string} params.orderDate       - Document date (ISO string, e.g. "2026-01-15")
 * @param {string} params.apiBaseUrl      - Window API base (e.g. /sws/neo/sales-order)
 * @param {string} params.token           - Bearer token
 */
export function useDocumentCurrency({ docCurrencyCode, orderDate, apiBaseUrl, token }) {
  const [state, setState] = useState({
    orgCurrencyCode: null,
    exchangeRate: null,
    isSameCurrency: true,
    loading: true,
  });

  useEffect(() => {
    if (!docCurrencyCode || !apiBaseUrl || !token) {
      setState(s => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    const base = apiBaseUrl.replace(/\/[^/]+$/, '');

    (async () => {
      try {
        // /session returns { currencyCode: "EUR", ... } — ISO 4217 code of the org currency
        const session = await fetchOptionalJson(`${base}/session`, token);
        const orgCurrencyCode = session?.currencyCode ?? null;

        if (!orgCurrencyCode || cancelled) {
          if (!cancelled) setState(s => ({ ...s, loading: false }));
          return;
        }

        const isSame = !docCurrencyCode || docCurrencyCode === orgCurrencyCode;

        if (isSame || !orderDate) {
          if (!cancelled) setState({ orgCurrencyCode, exchangeRate: null, isSameCurrency: true, loading: false });
          return;
        }

        // Currencies differ — both values are ISO codes; server resolves them to DB IDs
        const rateData = await fetchOptionalJson(
          `${base}/validate-exchange-rate?fromCurrency=${encodeURIComponent(docCurrencyCode)}&toCurrency=${encodeURIComponent(orgCurrencyCode)}&date=${encodeURIComponent(orderDate)}`,
          token,
        );

        if (!cancelled) {
          setState({
            orgCurrencyCode,
            exchangeRate: rateData?.rate ?? null,
            isSameCurrency: false,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [docCurrencyCode, orderDate, apiBaseUrl, token]);

  const convertAmount = (amount) => {
    if (!amount || state.isSameCurrency) return amount;
    // Currencies differ but no rate available — signal that conversion is not possible.
    if (!state.exchangeRate) return null;
    // multiplyrate convention (mirrors Etendo's C_Currency_Convert_Precision):
    //   to_amount = from_amount * multiplyrate
    // For the inverse fallback case the server already returns 1/inverseRate so
    // the same formula applies regardless of which direction was stored in the DB.
    return Number(amount) * state.exchangeRate;
  };

  return { ...state, convertAmount };
}

/**
 * Resolves the effective exchange rate and org-currency grand total for
 * dual-currency preview panels (ETP-4717 — extracted, behavior-identical, out
 * of OrderPreview.jsx / InvoicePreview.jsx so those components don't carry
 * this branching in their own cognitive-complexity budget; both previously
 * inlined the exact same three-ternary calculation).
 *
 * `record.eTGOCurrencyRate` is the org→doc multiplyRate (e.g. 1.20 = "1 EUR =
 * 1.20 USD"). It's used directly as `exchangeRate` so 1.20 is displayed, not
 * the inverse (0.8333). `orgGrandTotal` = docTotal / eTGOCurrencyRate converts
 * doc→org.
 *
 * ETP-4836 fix — do NOT special-case `etgoRate === 1`. That exclusion was
 * copied from `CurrencyRatePicker.jsx`, where the *selector's* `rate` field is
 * hardcoded to 1.0 by `CurrencyOptionsHandler.java` purely as an org-currency
 * marker for that one dropdown option — a convention that only holds for that
 * API response. `record.eTGOCurrencyRate` is a different, real, nullable DB
 * column the user sets via the same picker's inline rate editor, and it can
 * legitimately be exactly 1 for a genuinely different (deliberately 1:1
 * pegged) currency — that case is already correctly distinguished from "this
 * is the org currency" by the `!isSameCurrency` guard below, so treating `1`
 * as a second, redundant "no real rate" sentinel here silently substitutes
 * the system rate for the document's actual rate and shows the wrong total.
 * `0` and `null`/`undefined`/`NaN` remain the only "no override" sentinels —
 * `etgoRate`'s truthiness already excludes all of them.
 *
 * @param {object}  params
 * @param {object}  params.record             Document record carrying `eTGOCurrencyRate` / `grandTotalAmount`.
 * @param {boolean} params.isSameCurrency     From `useDocumentCurrency`.
 * @param {?number} params.systemExchangeRate From `useDocumentCurrency`.
 * @returns {{ exchangeRate: ?number, orgGrandTotal: ?number }}
 */
export function resolveDualCurrencyDisplay({ record, isSameCurrency, systemExchangeRate }) {
  const etgoRate = (!isSameCurrency && record?.eTGOCurrencyRate)
    ? parseFloat(record.eTGOCurrencyRate)
    : null;
  const exchangeRate = etgoRate || systemExchangeRate;
  const orgGrandTotal = (!isSameCurrency && exchangeRate && record?.grandTotalAmount != null)
    ? Number(record.grandTotalAmount) / exchangeRate
    : null;
  return { exchangeRate, orgGrandTotal };
}
