import { useRef } from 'react';
import { buildLocationAddressLines } from '@/lib/locationAddress.js';
import { computeDocumentTotals } from '@/lib/documentTotals';
import { ORDER_LINE_CONFIG } from '@/hooks/useLineGrossAmount';
import { getCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import {
  DOCUMENT_CSS,
  DOCUMENT_TEMPLATE,
  COMMERCIAL_LABEL_KEYS,
  buildCommercialHelpers,
  resolveLabelKeys,
} from './printableSources.js';
import {
  fetchJson,
  fetchAll,
  fetchOptionalJson,
  fetchLocationAddress,
  fetchImageDataUrl,
  renderPdf,
  renderHtml,
  usePdfGenerator,
} from './pdfUtils.js';

export { fetchJson, fetchAll, fetchOptionalJson, fetchLocationAddress, blobToDataUrl, fetchImageDataUrl } from './pdfUtils.js';

// ---------------------------------------------------------------------------
// CSS + Handlebars template — defined once in printableSources.js (ETP-6013), which the
// build also publishes for the server-side render. Re-exported here so no caller changes.
// ---------------------------------------------------------------------------
export { DOCUMENT_CSS, DOCUMENT_TEMPLATE } from './printableSources.js';

// ---------------------------------------------------------------------------
// Shared document data helpers — used by all document PDF data builders
// ---------------------------------------------------------------------------

/** Fetches the company logo (as data URL) and the customer's location address in parallel. */
export async function fetchDocumentAssets(session, header, base, token) {
  const [companyLogoDataUrl, partnerLocation] = await Promise.all([
    fetchImageDataUrl(session?.yourCompanyDocumentImageId, base, token),
    fetchLocationAddress(header.partnerAddress, base, token),
  ]);
  return { companyLogoDataUrl, partnerLocation };
}

/** Returns a shallow copy of linesRaw sorted ascending by lineNo. */
export function sortDocumentLines(linesRaw) {
  return [...linesRaw].sort((a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0));
}

/**
 * Resolves the printed product code (SKU) for a document line, for the
 * "CÓD." column in DOCUMENT_TEMPLATE.
 * ETP-4941: when neither a persisted productCode nor the foreignKey's raw
 * value (product$_value) is available (e.g. a product with no SKU), this
 * MUST fall back to '—' — never the line number/index, which reproduces the
 * original bug (the code column showing the line position instead of a SKU).
 */
export function resolveProductCode(line) {
  return line.productCode || line['product$_value'] || '—';
}

/**
 * ETP-5125 — ISO 4217 code of the DOCUMENT's currency (e.g. "EUR"/"USD"/"GBP"),
 * for the printable's header meta block.
 *
 * Read from the header every builder already fetches — deliberately NOT from the
 * `currencyData` argument, which is `null` on the hook-free print path (see
 * `documentPdfRegistry.js`, `commercial()`): sourcing it there would make the
 * printed PDF disagree with the previewed/emailed one for the same record.
 *
 * Returns null when the field is absent so DOCUMENT_TEMPLATE's `{{#if}}` guard
 * prints nothing. There is intentionally NO fallback to the organization's
 * currency (`session.currencyCode`): stating the wrong currency on a
 * customer-facing document is worse than stating none.
 *
 * @param {object} header  the document header as returned by NEO
 * @returns {?string} the ISO 4217 code, or null
 */
export function resolveDocumentCurrencyCode(header) {
  return header?.['currency$_identifier'] || null;
}

/**
 * Builds the company identity block for PDF templates.
 * Falls back to header org fields when the session organization is unavailable.
 * bpAddressFallback is used when header.partnerAddress$_identifier is absent (e.g. purchase-order).
 */
export function buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation, bpAddressFallback = null) {
  const org = session?.organization ?? {};
  const customerAddressLines = buildLocationAddressLines(
    partnerLocation,
    header.partnerAddress$_identifier || bpAddressFallback || null,
  );
  return {
    companyName:     org.name        || header.organization$_identifier || header.organization || 'Empresa',
    companyAddress1: org.address1    || null,
    companyAddress2: org.address2    || null,
    companyCityLine: org.cityLine    || null,
    companyTaxId:    org.taxId       || null,
    companyLogoDataUrl,
    hasCustomerAddress: customerAddressLines.length > 0,
    customerAddressLines,
  };
}

// ---------------------------------------------------------------------------
// Shared order data builder — used by both sales-order and purchase-order
// ---------------------------------------------------------------------------
export async function buildOrderData(spec, orderId, base, token, currencyData = null) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/${spec}/header/${orderId}`, token),
    fetchAll(`${base}/${spec}/lines?parentId=${orderId}`, token),
    fetchOptionalJson(`${base}/session`, token),
  ]);
  const { companyLogoDataUrl, partnerLocation } = await fetchDocumentAssets(session, header, base, token);

  const linesSorted = sortDocumentLines(linesRaw);
  const lines = linesSorted.map((l, idx) => ({
    lineNo: l.lineNo || (idx + 1),
    productCode: resolveProductCode(l),
    productName: l.product$_identifier || l.description || '—',
    quantity: l.orderedQuantity ?? l.qtyOrdered ?? 0,
    unitPrice: l.listPrice ?? l.unitPrice ?? l.priceActual ?? 0,
    discount: l.discount ? Number(l.discount) : null,
    taxName: l.tax$_identifier || l.taxRate || '',
    lineTotal: l.lineGrossAmount ?? l.grossAmount ?? l.lineNetAmount ?? l.lineAmount ?? 0,
  }));

  const etgoTotalDiscount = Number(header.etgoTotalDiscount ?? 0);
  // grossSubtotal/discountAmt/totalDiscountAmt are still needed for the
  // "descuento por producto"/"descuento total" breakdown rows, which have no
  // backend-persisted equivalent field. But the grand total and tax amount
  // MUST come from the persisted header (same as buildInvoiceData/
  // buildQuotationData already do below) — never recomputed client-side via
  // computeDocumentTotals, which can diverge from the trigger-computed
  // C_Order.GrandTotal by the rounding drift reported in ETP-4777.
  const {
    grossSubtotal,
    discountAmt,
    totalDiscountAmt,
  } = computeDocumentTotals(linesRaw, null, null, ORDER_LINE_CONFIG, etgoTotalDiscount);

  const grandTotal = Number(header.grandTotalAmount ?? 0);
  const netAmount = Number(header.summedLineAmount ?? header.totalLines ?? 0);
  const taxAmount = grandTotal - netAmount;

  return {
    ...buildCompanyFields(session, header, companyLogoDataUrl, partnerLocation, header.bpAddress),
    documentNo: header.documentNo || '',
    currencyCode: resolveDocumentCurrencyCode(header),
    invoiceDate: header.orderDate || '',
    customerName: header.businessPartner$_identifier || header.businessPartner || '—',
    paymentMethod: header.paymentMethod$_identifier || null,
    paymentTerms: header.paymentTerms$_identifier || null,
    notes: header.description || null,
    lines,
    netAmount,
    taxAmount,
    grandTotal,
    // ETP-5132 — a negative-quantity line (a return folded into the same
    // document) makes discountAmt/totalDiscountAmt come back NEGATIVE from
    // computeDocumentTotals (the discount shrinks a negative net further
    // toward zero). The gate is therefore "!== 0" (any real discount, either
    // sign), never "> 0" (which silently hid the whole breakdown on those
    // lines). The printed amount is the sign-flipped magnitude (-discountAmt),
    // same convention as DocumentTotalsPanel.jsx — see its ETP-5132 comment.
    grossAmount:        discountAmt !== 0 ? grossSubtotal : null,
    discountPerProduct: discountAmt !== 0 ? -discountAmt : null,
    etgoTotalDiscount:  etgoTotalDiscount > 0 ? etgoTotalDiscount : null,
    totalDiscountAmt:   totalDiscountAmt !== 0 ? -totalDiscountAmt : null,
    exchangeRate: currencyData?.exchangeRate ?? null,
    orgCurrencyCode: currencyData?.orgCurrencyCode ?? null,
    // exchangeRate = org→doc multiplyRate (e.g. 1.20 = "1 EUR = 1.20 USD").
    // Divide grandTotal (in doc currency) by it to get the org-currency equivalent.
    orgGrandTotal: (currencyData?.exchangeRate && currencyData?.exchangeRate !== 1)
      ? Number(grandTotal) / currencyData.exchangeRate
      : null,
    rateDecimals: session?.currencyStandardPrecision ?? 4,
  };
}

// ---------------------------------------------------------------------------
// Render via jsreport (delegates to shared renderPdf in pdfUtils.js)
// ---------------------------------------------------------------------------
export async function renderDocumentPdf(data) {
  // Currency/amount formatting in DOCUMENT_TEMPLATE MUST go through the
  // {{formatCurrency}} helper built by buildCommercialHelpers — never add a
  // template-local formatter (see CLAUDE.md § Currency & Amount Formatting).
  // rateDecimals is only meaningful when exchangeRate is present, but it's
  // harmless to bake it into formatNumber's precision unconditionally.
  // The server-side render (ETP-6013) fills the same helpers from the published
  // manifest — see printableSources.js#buildCommercialHelpersTemplate.
  const helpers = buildCommercialHelpers(data.rateDecimals, getCurrencyFormatConfig());
  return renderPdf(DOCUMENT_TEMPLATE, DOCUMENT_CSS, helpers, data);
}

export async function renderDocumentHtml(data) {
  // HTML twin of renderDocumentPdf, for the list view's multi-document print (which
  // concatenates markup before making one PDF). Keep the two in step: same helpers,
  // same data shape — only the recipe differs.
  const helpers = buildCommercialHelpers(data.rateDecimals, getCurrencyFormatConfig());
  return renderHtml(DOCUMENT_TEMPLATE, DOCUMENT_CSS, helpers, data);
}

// ---------------------------------------------------------------------------
// Shared label builder — 20 common keys shared by all document PDF hooks.
// Each hook passes only its 4-5 document-specific overrides.
// ---------------------------------------------------------------------------
export function buildDocumentPdfLabels(ui, overrides) {
  // The key map lives in printableSources.js so the build can publish the same labels
  // for the server-side render (ETP-6013).
  return {
    ...resolveLabelKeys(ui, COMMERCIAL_LABEL_KEYS),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared discount breakdown — identical reduce+math used by invoice and
// quotation data builders. getGrossLine is document-specific (different qty
// and discount field names) so it is passed as a parameter.
// ---------------------------------------------------------------------------
export function computeDiscountBreakdown(linesRaw, etgoTotalDiscount, getGrossLine) {
  const grossAmount = linesRaw.reduce((sum, l) => sum + getGrossLine(l), 0);
  const productNetAmount = linesRaw.reduce((sum, l) => sum + Number(l.lineNetAmount ?? 0), 0);
  // ETP-5132 — no Math.max(0, ...) clamp: a negative-quantity line (a return
  // folded into the same invoice/quotation) makes productNetAmount LESS
  // negative than grossAmount once the per-line discount is applied, so this
  // difference comes back negative. Clamping it to 0 silently dropped the
  // real discount for that case. Same signed convention as
  // documentTotals.js's discountAmt (grossSubtotal - netSubtotal) — callers
  // sign-flip it for display, matching DocumentTotalsPanel.jsx.
  const discountPerProduct = grossAmount - productNetAmount;
  const totalDiscountAmt = etgoTotalDiscount > 0 ? productNetAmount * etgoTotalDiscount / 100 : 0;
  return { grossAmount, productNetAmount, discountPerProduct, totalDiscountAmt };
}

// ---------------------------------------------------------------------------
// Generic PDF hook — shared by all document-type hooks
// labels are kept in a ref so they never re-trigger the effect on locale change
// ---------------------------------------------------------------------------
export function useDocumentPdf(recordId, apiBaseUrl, token, buildDataFn, labels, cacheConfig) {
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  return usePdfGenerator(recordId, apiBaseUrl, token, (id, base, tok) =>
    buildDataFn(id, base, tok).then((data) => renderDocumentPdf({ ...data, labels: labelsRef.current }))
  , cacheConfig);
}

