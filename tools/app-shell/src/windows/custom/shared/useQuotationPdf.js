import { useCallback } from 'react';
import { useUI } from '@/i18n';
import {
  fetchJson,
  fetchAll,
  fetchOptionalJson,
  fetchDocumentAssets,
  sortDocumentLines,
  buildCompanyFields,
  buildDocumentPdfLabels,
  computeDiscountBreakdown,
  useDocumentPdf,
} from './documentPdf.js';

// ---------------------------------------------------------------------------
// Build quotation data for the template
// ---------------------------------------------------------------------------
async function buildQuotationData(quotationId, base, token, currencyData = null) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/sales-quotation/quotation/${quotationId}`, token),
    fetchAll(`${base}/sales-quotation/quotationLine?parentId=${quotationId}`, token),
    fetchOptionalJson(`${base}/session`, token),
  ]);
  const { companyLogoDataUrl, partnerLocation } = await fetchDocumentAssets(session, header, base, token);

  const linesSorted = sortDocumentLines(linesRaw);
  const lines = linesSorted.map((l, idx) => ({
    lineNo: l.lineNo || (idx + 1),
    productName: l.product$_identifier || l.description || '—',
    quantity: l.orderedQuantity ?? 0,
    unitPrice: l.unitPrice ?? 0,
    discount: l.discount ? Number(l.discount) : null,
    taxName: l.tax$_identifier || '',
    lineTotal: l.lineNetAmount ?? 0,
  }));

  const grandTotal = Number(header.grandTotalAmount ?? 0);
  const netAmount  = Number(header.summedLineAmount ?? 0);
  const taxAmount  = grandTotal - netAmount;

  const getGrossLine = (l) => {
    const qty = Number(l.orderedQuantity ?? 0);
    if (qty === 0) return 0;
    if (l.listPrice != null) return qty * Number(l.listPrice);
    const lineNet = Number(l.lineNetAmount ?? 0);
    const disc = Number(l.discount ?? 0);
    return disc > 0 ? lineNet / (1 - disc / 100) : lineNet;
  };
  const etgoTotalDiscount = Number(header.etgoTotalDiscount ?? 0);
  const { grossAmount, discountPerProduct, totalDiscountAmt } =
    computeDiscountBreakdown(linesRaw, etgoTotalDiscount, getGrossLine);

  return {
    ...buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation),
    documentNo: header.documentNo || '',
    invoiceDate: header.orderDate || '',
    validUntil: header.validUntil || null,
    customerName: header.businessPartner$_identifier || header.businessPartner || '—',
    paymentMethod: header.paymentMethod$_identifier || null,
    paymentTerms: header.paymentTerms$_identifier || null,
    notes: header.description || null,
    lines,
    netAmount,
    taxAmount,
    grandTotal,
    grossAmount:        discountPerProduct > 0 ? grossAmount : null,
    discountPerProduct: discountPerProduct > 0 ? discountPerProduct : null,
    etgoTotalDiscount:  etgoTotalDiscount > 0 ? etgoTotalDiscount : null,
    totalDiscountAmt:   totalDiscountAmt > 0 ? totalDiscountAmt : null,
    exchangeRate: currencyData?.exchangeRate ?? null,
    orgCurrencyCode: currencyData?.orgCurrencyCode ?? null,
    orgGrandTotal: (currencyData?.exchangeRate && currencyData?.exchangeRate !== 1)
      ? Number(grandTotal) / currencyData.exchangeRate
      : null,
    rateDecimals: session?.currencyStandardPrecision ?? 4,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useQuotationPdf(quotationId, apiBaseUrl, token, currencyData = null) {
  const ui = useUI();
  const labels = buildDocumentPdfLabels(ui, {
    title:           ui('quotationPdfTitle'),
    documentNo:      ui('quotationPdfDocumentNo'),
    documentSection: ui('quotationPdfSection'),
    date:            ui('quotationPdfDate'),
    validUntil:      ui('quotationPdfValidUntil'),
    colQty:          ui('quotationPdfColQty'),
  });
  const buildData = useCallback(
    (recordId, base, tk) => buildQuotationData(recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(quotationId, apiBaseUrl, token, buildData, labels);
}
