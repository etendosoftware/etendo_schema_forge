import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from './documentPdf.js';

export function usePurchaseOrderPdf(orderId, apiBaseUrl, currencyData = null, cacheConfig = null) {
  const ui = useUI();
  const labels = buildDocumentPdfLabels(ui, {
    title:           ui('purchaseOrderPdfTitle'),
    documentNo:      ui('purchaseOrderPdfDocumentNo'),
    documentSection: ui('purchaseOrderPdfSection'),
    date:            ui('orderPdfDate'),
    colQty:          ui('orderPdfColQty'),
  });
  const buildPurchaseOrderData = useCallback(
    (recordId, base) => buildOrderData('purchase-order', recordId, base, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, buildPurchaseOrderData, labels, cacheConfig);
}
