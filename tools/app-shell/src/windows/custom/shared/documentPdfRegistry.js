/**
 * documentPdfRegistry.js — how each window renders its own document outside React.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Print button lives in the generic `DetailView` / `ListView`, which know only a
 * window name — so it could only ever render the `print-*` artifact, and pressing Print
 * showed a different layout than the preview the user had just looked at and than the
 * PDF the customer receives by email. See `docs/document-printables.md`.
 *
 * The `useXxxPdf` hooks cannot serve that flow: they are hooks, and the list view prints
 * several records at once. But every hook is a thin wrapper over plain async functions,
 * so this registry exposes, per window, the same rendering its preview performs.
 *
 * NOT ALL DOCUMENTS SHARE ONE LAYOUT — and that is correct:
 *
 *   - commercial documents (invoice, orders, quotation) use the shared
 *     `DOCUMENT_TEMPLATE`: prices, discounts, tax, total;
 *   - movement documents (shipment, both returns) use their own MOVEMENT_* template:
 *     quantities and a receiver signature, deliberately without prices.
 *
 * So an entry does not describe "how to build data"; it describes **how that document
 * renders itself**. Adding a window means giving it a `pdf` and an `html` function —
 * never bending it into another document's template.
 *
 * `html` exists because the multi-document print concatenates markup and makes a single
 * PDF at the end; asking jsreport for HTML (`recipe: 'html'`) keeps Handlebars on the
 * server side and avoids needing a PDF-merging library in the browser.
 *
 * IMPORTANT: this changes only WHICH template a print produces, never WHETHER the Print
 * button is offered. Visibility stays in each window's `decisions.json` (`hidePrint` /
 * `hidePrintWhen`), evaluated by DetailView/ListView as always. A window absent from
 * this map keeps rendering its `print-*` artifact, exactly as before.
 */
import { renderDocumentPdf, renderDocumentHtml, buildOrderData } from './documentPdf.js';
import { buildInvoiceData, buildInvoicePdfLabels } from './useInvoicePdf.js';
import { buildSalesOrderPdfLabels } from './useOrderPdf.js';
import { buildPurchaseOrderPdfLabels } from './usePurchaseOrderPdf.js';
import { buildQuotationData, buildQuotationPdfLabels } from './useQuotationPdf.js';
import {
  generateShipmentPdf, generateShipmentHtml, getShipmentPdfLabels,
} from '@/windows/custom/goods-shipment/useShipmentPdf.js';
import {
  generateReturnToVendorPdf, generateReturnToVendorHtml, getReturnToVendorPdfLabels,
} from '@/windows/custom/return-to-vendor-shipment/useReturnToVendorPdf.js';
import {
  generateReturnReceiptPdf, generateReturnReceiptHtml, getReturnReceiptPdfLabels,
} from '@/windows/custom/return-material-receipt/useReturnReceiptPdf.js';

/**
 * Entry for a commercial document: shared DOCUMENT_TEMPLATE, built by `build` and
 * labelled by `labels`.
 *
 * `currencyData` is not threaded through: the preview passes it so a foreign-currency
 * document can also show the org-currency equivalent, and the print flow has no access
 * to it. Everything else — layout, totals, labels — is identical.
 *
 * The builders expect the base URL with its last segment stripped, exactly as
 * `useDocumentPdf` hands it to them.
 */
function commercial(build, labels) {
  const strip = (apiBaseUrl) => (apiBaseUrl || '').replace(/\/[^/]+$/, '');
  return {
    pdf: (id, apiBaseUrl, token, ui) =>
      build(id, strip(apiBaseUrl), token).then((d) => renderDocumentPdf({ ...d, labels: labels(ui) })),
    html: (id, apiBaseUrl, token, ui) =>
      build(id, strip(apiBaseUrl), token).then((d) => renderDocumentHtml({ ...d, labels: labels(ui) })),
  };
}

/**
 * Entry for a movement document: its own template and its own generators, which take the
 * FULL base url and strip it themselves.
 */
function movement(pdfFn, htmlFn, labels) {
  return {
    pdf: (id, apiBaseUrl, token, ui) => pdfFn(id, apiBaseUrl, token, labels(ui)),
    html: (id, apiBaseUrl, token, ui) => htmlFn(id, apiBaseUrl, token, labels(ui)),
  };
}

/** @type {Record<string, { pdf: Function, html: Function }>} */
export const DOCUMENT_PDF_REGISTRY = {
  // Commercial — shared DOCUMENT_TEMPLATE
  'sales-invoice':   commercial(buildInvoiceData, buildInvoicePdfLabels),
  'sales-order':     commercial((id, b, t) => buildOrderData('sales-order', id, b, t, null), buildSalesOrderPdfLabels),
  'purchase-order':  commercial((id, b, t) => buildOrderData('purchase-order', id, b, t, null), buildPurchaseOrderPdfLabels),
  'sales-quotation': commercial((id, b, t) => buildQuotationData(id, b, t, null), buildQuotationPdfLabels),

  // Movement — quantities and a receiver signature, no prices
  'goods-shipment':            movement(generateShipmentPdf, generateShipmentHtml, getShipmentPdfLabels),
  'return-to-vendor-shipment': movement(generateReturnToVendorPdf, generateReturnToVendorHtml, getReturnToVendorPdfLabels),
  'return-material-receipt':   movement(generateReturnReceiptPdf, generateReturnReceiptHtml, getReturnReceiptPdfLabels),
};

/**
 * True when this window renders its own document, i.e. Print must not fall back to the
 * `print-*` artifact.
 * @param {string} windowName
 */
export function hasClientPdf(windowName) {
  return !!DOCUMENT_PDF_REGISTRY[windowName];
}

/**
 * One document's PDF — the same bytes its preview panel shows.
 *
 * @param {object} params
 * @param {string} params.windowName  spec name, e.g. `sales-invoice`
 * @param {string} params.documentId  record id
 * @param {string} params.apiBaseUrl  NEO base url, exactly as the windows pass it
 * @param {string} params.token       auth token
 * @param {(key: string) => string} params.ui  translator (`useUI()`'s result, injected —
 *        this module is hook-free, so callers own the i18n context)
 * @returns {Promise<Blob>}
 */
export async function buildClientPdfBlob({ windowName, documentId, apiBaseUrl, token, ui }) {
  const entry = DOCUMENT_PDF_REGISTRY[windowName];
  if (!entry) throw new Error(`No client-side renderer for window "${windowName}"`);
  return entry.pdf(documentId, apiBaseUrl, token, ui);
}

/**
 * The same document as HTML — for the list view's multi-document print, which
 * concatenates one document's markup after another and makes a single PDF at the end.
 *
 * @param {object} params  same shape as `buildClientPdfBlob`
 * @returns {Promise<string>}
 */
export async function buildClientHtml({ windowName, documentId, apiBaseUrl, token, ui }) {
  const entry = DOCUMENT_PDF_REGISTRY[windowName];
  if (!entry) throw new Error(`No client-side renderer for window "${windowName}"`);
  return entry.html(documentId, apiBaseUrl, token, ui);
}
