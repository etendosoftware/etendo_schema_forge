import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from '../shared/documentPdf.js';

/**
 * Client-rendered PDF for the return-to-vendor (C_Order purchase return) window.
 *
 * Mirrors usePurchaseOrderPdf but targets the `return-to-vendor` spec so the
 * shared documentPdf builder hits `${base}/return-to-vendor/header/${id}` and
 * `${base}/return-to-vendor/lines?parentId=${id}`.
 */
export function useReturnToVendorOrderPdf(orderId, apiBaseUrl, token, currencyData = null) {
  const ui = useUI();
  const labels = buildDocumentPdfLabels(ui, {
    title:           ui('returnToVendorPdfTitle'),
    documentNo:      ui('purchaseOrderPdfDocumentNo'),
    documentSection: ui('purchaseOrderPdfSection'),
    date:            ui('orderPdfDate'),
    colQty:          ui('orderPdfColQty'),
  });
  const buildReturnToVendorData = useCallback(
    (recordId, base, tk) => buildOrderData('return-to-vendor', recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, token, buildReturnToVendorData, labels);
}
