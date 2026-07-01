import { useUI } from '@/i18n';
import {
  RETURN_DOC_HELPERS,
  COMMON_PDF_CSS,
  MOVEMENT_TEMPLATE_OPEN,
  MOVEMENT_TEMPLATE_HEADER,
  MOVEMENT_TEMPLATE_PARTIES,
  MOVEMENT_TEMPLATE_NOTES,
  MOVEMENT_TEMPLATE_FOOTER,
  fetchJson,
  fetchAll,
  fetchOptionalJson,
  fetchLocationAddress,
  fetchImageDataUrl,
  buildLocationAddressLines,
  renderPdf,
  usePdfGenerator,
  buildReturnDocCommonFields,
  sortLinesByLineNo,
} from '../shared/pdfUtils.js';

const TEMPLATE = MOVEMENT_TEMPLATE_OPEN
+ MOVEMENT_TEMPLATE_HEADER
+ MOVEMENT_TEMPLATE_PARTIES
+ `
  <div class="doc-movement">
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.date}}</div>
      <div class="cell-value">{{fmtDate movementDate}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.sourceReceipt}}</div>
      <div class="cell-value">{{#if sourceReceiptRef}}{{sourceReceiptRef}}{{else}}—{{/if}}</div>
    </div>
    <div class="doc-movement-cell">
      <div class="cell-label">{{labels.warehouse}}</div>
      <div class="cell-value">{{#if warehouse}}{{warehouse}}{{else}}—{{/if}}</div>
    </div>
  </div>

  <table class="doc-table">
    <thead>
      <tr>
        <th style="width:64px">{{labels.colCode}}</th>
        <th>{{labels.colDescription}}</th>
        <th class="num" style="width:130px">{{labels.colReturned}}</th>
        <th class="num" style="width:130px">{{labels.colOriginalQty}}</th>
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{fmt this.returnedQty}}</td>
        <td class="num">{{fmt this.originalQty}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>`
+ MOVEMENT_TEMPLATE_NOTES
+ MOVEMENT_TEMPLATE_FOOTER;

async function buildReturnToVendorData(shipmentId, base, token) {
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

  const vendorAddressLines = buildLocationAddressLines(
    partnerLocation,
    header['partnerAddress$_identifier'] || null,
  );

  return {
    ...buildReturnDocCommonFields(header, companyLogoDataUrl),
    vendorName: header['businessPartner$_identifier'] || '—',
    vendorAddressLines,
    warehouse: header['warehouse$_identifier'] || null,
    sourceReceiptRef: header.sourceReceiptDocNo || null,
    notes: header.description || null,
    lines,
  };
}

export function useReturnToVendorPdf(shipmentId, apiBaseUrl, token) {
  const ui = useUI();
  return usePdfGenerator(shipmentId, apiBaseUrl, token, (id, base, tok) => {
    const labels = getReturnToVendorPdfLabels(ui);
    return buildReturnToVendorData(id, base, tok).then((data) => renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels }));
  });
}

export async function generateReturnToVendorPdf(shipmentId, apiBaseUrl, token, labels) {
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const data = await buildReturnToVendorData(shipmentId, base, token);
  return renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels });
}

export function getReturnToVendorPdfLabels(ui) {
  return {
    title:            ui('returnToVendorPdfTitle'),
    taxId:            ui('invoicePdfTaxId'),
    page:             ui('invoicePdfPage'),
    issuerSection:    ui('shipmentPdfIssuerSection'),
    vendorSection:    ui('returnToVendorPdfVendorSection'),
    sourceReceipt:    ui('returnToVendorPdfSourceReceipt'),
    date:             ui('shipmentPdfDate'),
    warehouse:        ui('shipmentPdfWarehouse'),
    colCode:          ui('invoicePdfColCode'),
    colDescription:   ui('invoicePdfColDescription'),
    colReturned:      ui('returnToVendorPdfColReturned'),
    colOriginalQty:   ui('returnToVendorPdfColOriginalQty'),
    notes:            ui('invoicePdfNotes'),
  };
}
