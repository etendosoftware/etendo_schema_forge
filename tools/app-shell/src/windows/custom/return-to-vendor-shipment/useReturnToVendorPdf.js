import { useUI } from '@/i18n';
import {
  RETURN_DOC_HELPERS,
  COMMON_PDF_CSS,
  MOVEMENT_TEMPLATE_OPEN,
  MOVEMENT_TEMPLATE_HEADER,
  MOVEMENT_TEMPLATE_PARTIES,
  MOVEMENT_TEMPLATE_SIGNATURE,
  MOVEMENT_TEMPLATE_NOTES,
  MOVEMENT_TEMPLATE_FOOTER,
  fetchJson,
  fetchAll,
  fetchOptionalJson,
  fetchLocationAddress,
  fetchImageDataUrl,
  buildLocationAddressLines,
  renderPdf,
  renderHtml,
  usePdfGenerator,
  buildReturnDocCommonFields,
  sortLinesByLineNo,
} from '../shared/pdfUtils.js';
import { RETURN_TO_VENDOR_TEMPLATE_BODY, RETURN_TO_VENDOR_PDF_LABEL_KEYS, resolveLabelKeys } from '../shared/printableSources.js';

const TEMPLATE = MOVEMENT_TEMPLATE_OPEN
+ MOVEMENT_TEMPLATE_HEADER
+ MOVEMENT_TEMPLATE_PARTIES
+ RETURN_TO_VENDOR_TEMPLATE_BODY
+ MOVEMENT_TEMPLATE_SIGNATURE
+ MOVEMENT_TEMPLATE_NOTES
+ MOVEMENT_TEMPLATE_FOOTER;

export async function buildReturnToVendorData(shipmentId, base, token) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/return-to-vendor-shipment/returnToVendorShipment/${shipmentId}`, token),
    fetchAll(`${base}/return-to-vendor-shipment/returnToVendorShipmentLine?parentId=${shipmentId}&_startRow=0&_endRow=200`, token),
    fetchOptionalJson(`${base}/session`, token),
  ]);
  const [companyLogoDataUrl, partnerLocation] = await Promise.all([
    fetchImageDataUrl(session?.yourCompanyDocumentImageId, base, token),
    fetchLocationAddress(header.partnerAddress, base, token),
  ]);

  const lines = sortLinesByLineNo(linesRaw).map((l, idx) => ({
    lineNo: idx + 1,
    productCode: l.productCode || l['product$_value'] || String(idx + 1),
    productName: l['product$_identifier'] || l.description || '—',
    returnedQty: l.movementQuantity ?? 0,
    originalQty: l.orderQuantity ?? 0,
  }));

  const customerAddressLines = buildLocationAddressLines(
    partnerLocation,
    header['partnerAddress$_identifier'] || null,
  );

  return {
    ...buildReturnDocCommonFields(header, companyLogoDataUrl),
    customerName: header['businessPartner$_identifier'] || '—',
    customerAddressLines,
    warehouse: header['warehouse$_identifier'] || null,
    sourceReceiptRef: header.sourceReceiptDocNo || null,
    notes: header.description || null,
    lines,
  };
}

export function useReturnToVendorPdf(shipmentId, apiBaseUrl, token, cacheConfig = null) {
  const ui = useUI();
  return usePdfGenerator(shipmentId, apiBaseUrl, token, (id, base, tok) => {
    const labels = getReturnToVendorPdfLabels(ui);
    return buildReturnToVendorData(id, base, tok).then((data) => renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels }));
  }, cacheConfig);
}

export function getReturnToVendorPdfLabels(ui) {
  // Key map in printableSources.js, which the build also publishes for the server-side
  // render (ETP-6013) — one definition, so the two cannot drift.
  return resolveLabelKeys(ui, RETURN_TO_VENDOR_PDF_LABEL_KEYS);
}

/**
 * The movement document as a PDF, outside React — used by the print flow via
 * `documentPdfRegistry.js`. These documents deliberately do NOT use the commercial
 * DOCUMENT_TEMPLATE: they carry quantities and a receiver signature, not prices and
 * totals. See `docs/document-printables.md`.
 *
 * @param {string} recordId
 * @param {string} apiBaseUrl  full base, as the hook receives it
 * @param {string} token
 * @param {object} labels      from getReturnToVendorPdfLabels(ui)
 */
export async function generateReturnToVendorPdf(recordId, apiBaseUrl, token, labels) {
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const data = await buildReturnToVendorData(recordId, base, token);
  return renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels });
}

/** HTML twin of generateReturnToVendorPdf, for the list view's multi-document print. */
export async function generateReturnToVendorHtml(recordId, apiBaseUrl, token, labels) {
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const data = await buildReturnToVendorData(recordId, base, token);
  return renderHtml(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels });
}
