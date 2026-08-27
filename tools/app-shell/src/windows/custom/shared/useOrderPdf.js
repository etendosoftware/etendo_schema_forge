import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from './documentPdf.js';

/**
 * The sales order's label overrides, as a plain function of `ui` — so the print flow
 * (`documentPdfRegistry.js`, which has no hooks) builds the very same labels instead of
 * a near-copy that drifts.
 *
 * @param {(key: string) => string} ui
 */
export function buildSalesOrderPdfLabels(ui) {
  return buildDocumentPdfLabels(ui, {
    title:           ui('orderPdfTitle'),
    documentNo:      ui('orderPdfDocumentNo'),
    documentSection: ui('orderPdfSection'),
    date:            ui('orderPdfDate'),
    colQty:          ui('orderPdfColQty'),
  });
}

export function useOrderPdf(orderId, apiBaseUrl, currencyData = null, cacheConfig = null) {
  const ui = useUI();
  const labels = buildSalesOrderPdfLabels(ui);
  const buildSalesOrderData = useCallback(
    (recordId, base, tk) => buildOrderData('sales-order', recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, buildSalesOrderData, labels, cacheConfig);
}
