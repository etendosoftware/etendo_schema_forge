import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from './documentPdf.js';
import { PURCHASE_ORDER_PDF_LABEL_KEYS, resolveLabelKeys } from './printableSources.js';

/**
 * Label overrides as a plain function of `ui`, so the print flow
 * (`documentPdfRegistry.js`, hook-free) builds the same labels. See
 * `docs/document-printables.md`.
 *
 * @param {(key: string) => string} ui
 */
export function buildPurchaseOrderPdfLabels(ui) {
  // Key map in printableSources.js, which the build also publishes for the server-side
  // render (ETP-6013) — one definition, so the two cannot drift.
  return buildDocumentPdfLabels(ui, resolveLabelKeys(ui, PURCHASE_ORDER_PDF_LABEL_KEYS));
}

export function usePurchaseOrderPdf(orderId, apiBaseUrl, token, currencyData = null, cacheConfig = null) {
  const ui = useUI();
  const labels = buildPurchaseOrderPdfLabels(ui);
  const buildPurchaseOrderData = useCallback(
    (recordId, base, tk) => buildOrderData('purchase-order', recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, token, buildPurchaseOrderData, labels, cacheConfig);
}
