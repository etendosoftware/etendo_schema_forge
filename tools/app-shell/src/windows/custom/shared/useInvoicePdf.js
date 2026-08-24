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
import { computeDocumentQrDataUrl } from '../../../../../../templates/reports/helpers/report-html-helpers.js';

// ---------------------------------------------------------------------------
// Build invoice data for the template
// ---------------------------------------------------------------------------
export async function buildInvoiceData(invoiceId, base, token) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/sales-invoice/header/${invoiceId}`, token),
    fetchAll(`${base}/sales-invoice/lines?parentId=${invoiceId}`, token),
    fetchOptionalJson(`${base}/session`, token),
  ]);
  const { companyLogoDataUrl, partnerLocation } = await fetchDocumentAssets(session, header, base, token);

  const linesSorted = sortDocumentLines(linesRaw);
  const lines = linesSorted.map((l, idx) => ({
    lineNo: l.lineNo || (idx + 1),
    productName: l.product$_identifier || l.description || '—',
    quantity: l.invoicedQuantity ?? l.qtyInvoiced ?? 0,
    unitPrice: l.unitPrice ?? l.priceActual ?? 0,
    discount: l.etgoDiscount ? Number(l.etgoDiscount) : null,
    taxName: l.tax$_identifier || l.taxRate || '',
    lineTotal: l.lineNetAmount ?? l.lineAmount ?? 0,
  }));

  const grandTotal = Number(header.grandTotalAmount ?? 0);
  const netAmount  = Number(header.summedLineAmount ?? header.totalLines ?? 0);
  const taxAmount  = grandTotal - netAmount;

  const getGrossLine = (l) => {
    const qty = Number(l.invoicedQuantity ?? l.qtyInvoiced ?? 0);
    if (qty === 0) return 0;
    if (l.listPrice != null) return qty * Number(l.listPrice);
    const lineNet = Number(l.lineNetAmount ?? l.lineAmount ?? 0);
    const disc = Number(l.etgoDiscount ?? 0);
    return disc > 0 ? lineNet / (1 - disc / 100) : lineNet;
  };
  const etgoTotalDiscount = Number(header.etgoTotalDiscount ?? 0);
  const { grossAmount, discountPerProduct, totalDiscountAmt } =
    computeDiscountBreakdown(linesRaw, etgoTotalDiscount, getGrossLine);

  const hasLineDiscount = linesRaw.some(l => Number(l.etgoDiscount ?? 0) > 0);
  const hasAnyDiscount = hasLineDiscount || etgoTotalDiscount > 0;
  const hasTotalDiscount = etgoTotalDiscount > 0;

  // ETP-4912 — Verifactu tax QR. The AEAT validation URL is computed and stored by
  // the classic Verifactu module when the Registro de Facturacion is generated
  // (C_Invoice.EM_Etvfac_Qr_Url); we only encode it. Reuses the SAME helper the
  // print-* pipeline uses, so the QR is byte-identical on every render path.
  // Empty until the RF exists -> no QR block at all, never a non-AEAT QR on a
  // Verifactu invoice. A QR failure must not break the whole PDF.
  let verifactuQrDataUrl = null;
  if (header.etvfacQRURL) {
    try {
      verifactuQrDataUrl = await computeDocumentQrDataUrl({
        qr_mode: 'verifactu',
        verifactu_qr_url: header.etvfacQRURL,
      }) || null;
    } catch (err) {
      console.warn('[useInvoicePdf] Verifactu QR generation failed:', err?.message);
    }
  }

  return {
    ...buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation, header.bpAddress),
    documentNo: header.documentNo || '',
    invoiceDate: header.invoiceDate || header.dateInvoiced || '',
    customerName: header.businessPartner$_identifier || header.businessPartner || '—',
    paymentMethod: header.paymentMethod$_identifier || null,
    paymentTerms: header.paymentTerms$_identifier || null,
    notes: header.description || null,
    lines,
    netAmount,
    taxAmount,
    grandTotal,
    grossAmount:        discountPerProduct > 0 ? grossAmount : null,
    grossSubtotal:      discountPerProduct > 0 ? grossAmount : null,
    discountPerProduct: discountPerProduct > 0 ? discountPerProduct : null,
    etgoTotalDiscount:  etgoTotalDiscount > 0 ? etgoTotalDiscount : null,
    totalDiscountPct:   etgoTotalDiscount > 0 ? etgoTotalDiscount : null,
    totalDiscountAmt:   totalDiscountAmt > 0 ? totalDiscountAmt : null,
    hasAnyDiscount,
    hasTotalDiscount,
    verifactuQrDataUrl,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
/**
 * The invoice's label overrides, as a plain function of `ui` rather than inlined in the
 * hook — so a non-React caller (the print drawer, via `documentPdfRegistry.js`) builds
 * the very same labels instead of a near-copy that drifts.
 *
 * @param {(key: string) => string} ui
 */
export function buildInvoicePdfLabels(ui) {
  return buildDocumentPdfLabels(ui, {
    title:           ui('invoicePdfTitle'),
    documentNo:      ui('invoicePdfDocumentNo'),
    documentSection: ui('invoicePdfInvoiceSection'),
    date:            ui('invoicePdfDate'),
    colQty:          ui('invoicePdfColQty'),
  });
}

export function useInvoicePdf(invoiceId, apiBaseUrl, token, cacheConfig = null) {
  const ui = useUI();
  const labels = buildInvoicePdfLabels(ui);
  return useDocumentPdf(invoiceId, apiBaseUrl, token, buildInvoiceData, labels, cacheConfig);
}
