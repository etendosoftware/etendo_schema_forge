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
  resolveProductCode,
  resolveDocumentCurrencyCode,
  useDocumentPdf,
} from './documentPdf.js';
import { QUOTATION_PDF_LABEL_KEYS, resolveLabelKeys } from './printableSources.js';

// ---------------------------------------------------------------------------
// The reject reason of a rejected quotation (ETP-6209 Part C)
// ---------------------------------------------------------------------------
/**
 * The first words of the line the customer portal appends to a rejected quotation's notes
 * (`portal-quotation-decision.note*` in com.etendoerp.go's `emails_{es_ES,en_US}.properties`,
 * written in the decision's language). Keep in sync with those catalogs and with
 * `QuotationPrintableData.PORTAL_NOTE_PREFIXES` (the server-side port).
 */
export const PORTAL_REJECT_NOTE_PREFIXES = Object.freeze([
  'Rechazado por el cliente desde el portal.',
  'Rejected by the customer from the portal.',
]);
/** The word before the reason inside that line, per catalog language. */
const PORTAL_REJECT_REASON_MARKERS = Object.freeze(['Motivo:', 'Reason:']);
const STATUS_REJECTED = 'CJ';

/** The reason inside a portal note line: what follows its marker, without the closing period. */
function reasonOfPortalNote(line) {
  for (const marker of PORTAL_REJECT_REASON_MARKERS) {
    const at = line.indexOf(marker);
    if (at >= 0) {
      const reason = line.slice(at + marker.length).trim().replace(/\.$/, '').trim();
      return reason || null;
    }
  }
  return null;
}

/**
 * The quotation's notes and its printed reject reason (ETP-6209 Part C, Jira comment 149518 point 5).
 *
 * A rejected quotation (`CJ`) prints one observation line "Motivo: <reason>" with the customer's
 * own portal reason only (the "Otros" text included), read from the portal's line in the notes.
 * That portal line is taken out of the notes so the observations never say "Motivo" twice. A
 * quotation rejected without a portal reason (e.g. in the app) prints no reason.
 *
 * **The tenant's reject reason (`C_Reject_Reason`, `rejectReason$_identifier`) is never printed**:
 * it can be internal, and this PDF is the one the customer downloads from the portal and receives
 * by email (ETP-6209 QA).
 *
 * Other statuses keep their notes untouched and print no reason. Mirrored by
 * `QuotationPrintableData.notesAndRejectReason` (server-side render) — change both together.
 *
 * @param {object} header the quotation's header record
 * @returns {{ notes: string|null, rejectReason: string|null }}
 */
export function quotationNotesAndRejectReason(header) {
  const description = header?.description || null;
  if (header?.documentStatus !== STATUS_REJECTED) {
    return { notes: description, rejectReason: null };
  }
  const kept = [];
  let portalReason = null;
  for (const line of String(description ?? '').split('\n')) {
    const trimmed = line.trim();
    if (PORTAL_REJECT_NOTE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      portalReason = reasonOfPortalNote(trimmed) ?? portalReason;
    } else {
      kept.push(line);
    }
  }
  const notes = kept.join('\n').trim() || null;
  return { notes, rejectReason: portalReason };
}

// ---------------------------------------------------------------------------
// Build quotation data for the template
// ---------------------------------------------------------------------------
export async function buildQuotationData(quotationId, base, token, currencyData = null) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/sales-quotation/quotation/${quotationId}`, token),
    fetchAll(`${base}/sales-quotation/quotationLine?parentId=${quotationId}`, token),
    fetchOptionalJson(`${base}/session`, token),
  ]);
  const { companyLogoDataUrl, partnerLocation } = await fetchDocumentAssets(session, header, base, token);

  const linesSorted = sortDocumentLines(linesRaw);
  const lines = linesSorted.map((l, idx) => ({
    lineNo: l.lineNo || (idx + 1),
    productCode: resolveProductCode(l),
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
  const { notes, rejectReason } = quotationNotesAndRejectReason(header);

  return {
    ...buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation),
    documentNo: header.documentNo || '',
    currencyCode: resolveDocumentCurrencyCode(header),
    invoiceDate: header.orderDate || '',
    validUntil: header.validUntil || null,
    customerName: header.businessPartner$_identifier || header.businessPartner || '—',
    paymentMethod: header.paymentMethod$_identifier || null,
    paymentTerms: header.paymentTerms$_identifier || null,
    notes,
    // ETP-6209: "Motivo: …" on a rejected quotation, see quotationNotesAndRejectReason.
    rejectReason,
    lines,
    netAmount,
    taxAmount,
    grandTotal,
    // ETP-5132 — same signed convention as useInvoicePdf.js / buildOrderData /
    // DocumentTotalsPanel.jsx: "!== 0" gates on any real discount (either
    // sign), and the printed value is the sign-flipped magnitude.
    grossAmount:        discountPerProduct !== 0 ? grossAmount : null,
    discountPerProduct: discountPerProduct !== 0 ? -discountPerProduct : null,
    etgoTotalDiscount:  etgoTotalDiscount > 0 ? etgoTotalDiscount : null,
    totalDiscountAmt:   totalDiscountAmt !== 0 ? -totalDiscountAmt : null,
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
/**
 * Label overrides as a plain function of `ui`, so the print flow
 * (`documentPdfRegistry.js`, hook-free) builds the same labels. See
 * `docs/document-printables.md`.
 *
 * @param {(key: string) => string} ui
 */
export function buildQuotationPdfLabels(ui) {
  // Key map in printableSources.js, which the build also publishes for the server-side
  // render (ETP-6013) — one definition, so the two cannot drift.
  return buildDocumentPdfLabels(ui, resolveLabelKeys(ui, QUOTATION_PDF_LABEL_KEYS));
}

export function useQuotationPdf(quotationId, apiBaseUrl, token, currencyData = null, cacheConfig = null) {
  const ui = useUI();
  const labels = buildQuotationPdfLabels(ui);
  const buildData = useCallback(
    (recordId, base, tk) => buildQuotationData(recordId, base, tk, currencyData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currencyData?.exchangeRate, currencyData?.orgCurrencyCode],
  );
  return useDocumentPdf(quotationId, apiBaseUrl, token, buildData, labels, cacheConfig, 'sales-quotation');
}
