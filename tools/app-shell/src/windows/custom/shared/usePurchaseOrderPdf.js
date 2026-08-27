import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from './documentPdf.js';

/**
 * Label overrides as a plain function of `ui`, so the print flow
 * (`documentPdfRegistry.js`, hook-free) builds the same labels. See
 * `docs/document-printables.md`.
 *
 * @param {(key: string) => string} ui
 */
export function buildPurchaseOrderPdfLabels(ui) {
  return buildDocumentPdfLabels(ui, {
    title:           ui('purchaseOrderPdfTitle'),
    documentNo:      ui('purchaseOrderPdfDocumentNo'),
    documentSection: ui('purchaseOrderPdfSection'),
    date:            ui('orderPdfDate'),
    colQty:          ui('orderPdfColQty'),
  });
}

export function usePurchaseOrderPdf(orderId, apiBaseUrl, currencyData = null, cacheConfig = null) {
  const ui = useUI();
  const labels = buildPurchaseOrderPdfLabels(ui);
  const buildPurchaseOrderData = useCallback(
    (recordId, base, tk) => buildOrderData('purchase-order', recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, buildPurchaseOrderData, labels, cacheConfig);
}
