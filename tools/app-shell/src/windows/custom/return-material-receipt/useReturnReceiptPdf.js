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
      <div class="cell-label">{{labels.sourceShipment}}</div>
      <div class="cell-value">{{#if sourceShipmentRef}}{{sourceShipmentRef}}{{else}}—{{/if}}</div>
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
      </tr>
    </thead>
    <tbody>
      {{#each lines}}
      <tr>
        <td class="code">{{this.productCode}}</td>
        <td class="desc">{{this.productName}}</td>
        <td class="num">{{fmt this.returnedQty}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>`
+ MOVEMENT_TEMPLATE_SIGNATURE
+ MOVEMENT_TEMPLATE_NOTES
+ MOVEMENT_TEMPLATE_FOOTER;

async function buildReceiptData(receiptId, base, token) {
  const [header, linesRaw, session] = await Promise.all([
    fetchJson(`${base}/return-material-receipt/returnMaterialReceipt/${receiptId}`, token),
    fetchAll(`${base}/return-material-receipt/returnMaterialReceiptLine?parentId=${receiptId}&_startRow=0&_endRow=200`, token),
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
    sourceShipmentRef: header.sourceShipmentDocNo || null,
    notes: header.description || null,
    lines,
  };
}

export function useReturnReceiptPdf(receiptId, apiBaseUrl, token) {
  const ui = useUI();
  return usePdfGenerator(receiptId, apiBaseUrl, token, (id, base, tok) => {
    const labels = getReturnReceiptPdfLabels(ui);
    return buildReceiptData(id, base, tok).then((data) => renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels }));
  });
}

export async function generateReturnReceiptPdf(receiptId, apiBaseUrl, token, labels) {
  const base = apiBaseUrl.replace(/\/[^/]+$/, '');
  const data = await buildReceiptData(receiptId, base, token);
  return renderPdf(TEMPLATE, COMMON_PDF_CSS, RETURN_DOC_HELPERS, { ...data, labels });
}

export function getReturnReceiptPdfLabels(ui) {
  return {
    title:             ui('returnReceiptPdfTitle'),
    taxId:             ui('invoicePdfTaxId'),
    page:              ui('invoicePdfPage'),
    issuerSection:     ui('shipmentPdfIssuerSection'),
    deliverySection:   ui('shipmentPdfDeliverySection'),
    sourceShipment:    ui('returnReceiptPdfSourceShipment'),
    date:              ui('shipmentPdfDate'),
    warehouse:         ui('shipmentPdfWarehouse'),
    colCode:           ui('invoicePdfColCode'),
    colDescription:    ui('invoicePdfColDescription'),
    colReturned:       ui('returnReceiptPdfColReturned'),
    notes:             ui('invoicePdfNotes'),
    signatureReceiver: ui('shipmentPdfSignatureReceiver'),
    signatureDate:     ui('shipmentPdfSignatureDate'),
  };
}
