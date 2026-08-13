import { useCallback } from 'react';
import { useUI } from '@/i18n';
import { buildOrderData, buildDocumentPdfLabels, useDocumentPdf } from './documentPdf.js';

export function useOrderPdf(orderId, apiBaseUrl, token, currencyData = null) {
  const ui = useUI();
  const labels = buildDocumentPdfLabels(ui, {
    title:           ui('orderPdfTitle'),
    documentNo:      ui('orderPdfDocumentNo'),
    documentSection: ui('orderPdfSection'),
    date:            ui('orderPdfDate'),
    colQty:          ui('orderPdfColQty'),
  });
  const buildSalesOrderData = useCallback(
    (recordId, base, tk) => buildOrderData('sales-order', recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(orderId, apiBaseUrl, token, buildSalesOrderData, labels);
}
