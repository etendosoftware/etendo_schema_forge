/**
 * Single definition of the related documents of every SALES document (ETP-5527).
 *
 * The form's "Related documents" section (artifacts/<spec>/custom/RelatedDocuments.jsx)
 * and the list preview's "Related documents" card (RelatedDocumentsCard) both render
 * from this module, so the two views can no longer drift apart: same criteria, same
 * chip types (DOCUMENT_CHIP_TYPES), same status labels (STATUS_KEYS), same navigation.
 *
 * Shape of each entry:
 *   {
 *     spec:          string          — NEO spec name of the document itself
 *     entity:        string          — header entity name, used to load the detail record
 *     refreshEvent?: string          — window event that triggers a refetch
 *     depsKey?:      (record) => string — the record fields the sources depend on; the
 *                                      async sources refetch only when this key changes
 *     sources: Array<{
 *       key:     string
 *       type:    string | (doc) => string   — a DOCUMENT_CHIP_TYPES key
 *       select?: (record) => doc[]          — synchronous, read from the record itself
 *       fetch?:  ({ id, record, token, apiBaseUrl }) => Promise<doc[]>
 *     }>
 *   }
 *
 * `record` is always the DETAIL record (GET /<entity>/<id>): several fields read here
 * (`linkedShipments`, `linkedOrders`, `originInvoices`, `rectifyingInvoices`, goods-shipment `linked*`) are
 * injected by the backend handlers on the detail GET only. `apiBaseUrl` is the
 * spec-scoped base (`.../sws/neo/<spec>`); cross-spec calls go through neoBase().
 *
 * Purchase documents live in purchaseRelatedDocs.js (ETP-5539), same shape.
 * Payments (cobros) are deliberately NOT related documents either: a sales order or
 * invoice never lists its payments as chips (functional decision, ETP-5527).
 *
 * A sales invoice relates to other invoices only through the official C_Invoice_Reverse
 * link (ETP-6002): `originInvoices` (what a rectificative rectifies) and `rectifyingInvoices`
 * (what rectifies an original). Nothing is deduced — not "the other invoices of the same
 * order" (it listed invoices the rectificative does not rectify), not the invoice reached
 * through return → shipment → invoice (a bare {id, documentNo} that won the dedupe over the
 * full origin record, so the chip lost its amount and status).
 */
import { fetchByCriteria, fetchById } from './helpers.js';
import {
  criteriaSource,
  listInvoicesSource,
  selectSource,
  originInvoicesSource,
  originInvoicesDepsKey,
  invoiceOrdersFetch,
  invoiceOrdersDepsKey,
  movementDefinition,
  returnDefinition,
  idsOf,
} from './relatedSources.js';

/**
 * The source quotation of a sales order, read from the real quotation record so the
 * chip shows its actual status and amount. When the record cannot be read (e.g. no
 * access), falls back to the backend identifier ("<documentNo> - <date> - <total>")
 * so the link is never lost.
 */
async function fetchSourceQuotation({ record, token, apiBaseUrl }) {
  const quotationId = record?.quotation;
  if (!quotationId) return [];
  const quotation = await fetchById('sales-quotation', 'quotation', quotationId, token, apiBaseUrl);
  if (quotation) return [quotation];
  const label = record['quotation$_identifier'];
  const documentNo = label ? label.split(' - ')[0].trim() : quotationId;
  return [{ id: quotationId, documentNo }];
}

/**
 * The document a sales invoice was generated from. `salesOrder` (C_Order_ID) points at
 * either a sales order or, for a direct invoice, a sales quotation — both live in
 * C_Order. A GET-by-id bypasses the spec's DocSubTypeSO filter, so the quotation spec
 * is probed with a criteria query first (which applies it).
 */
async function fetchInvoiceOrigin({ record, token, apiBaseUrl }) {
  const orderId = record?.salesOrder;
  if (!orderId) return [];
  const quotations = await fetchByCriteria('sales-quotation', 'quotation', 'id', orderId, token, apiBaseUrl);
  if (quotations.length > 0) return [{ ...quotations[0], _isQuotation: true }];
  const order = await fetchById('sales-order', 'header', orderId, token, apiBaseUrl);
  return order ? [order] : [];
}

export const SALES_RELATED_DOCS = {
  'sales-quotation': {
    spec: 'sales-quotation',
    entity: 'quotation',
    // ETP-4779 — QuotationConfirmModal dispatches it after converting the quotation.
    refreshEvent: 'sales-quotation:document-created',
    sources: [
      criteriaSource('orders', 'sales-order', 'sales-order', 'header', 'quotation'),
      listInvoicesSource('invoices', 'sales-invoice', 'sales-quotation', 'quotation'),
      // ETP-6002 (IMP-3): shipments whose own lines point at this quotation's lines — a shipment
      // made from an invoice that came straight from the quotation. Injected on the detail GET by
      // SalesQuotationHeaderHandler (QuotationShipmentLinks); a direct line link only, never
      // deduced through invoices. The mirror of the shipment's quotation chip below.
      selectSource('shipments', doc => (doc.isReturn === true ? 'return-material-receipt' : 'shipment'), 'linkedShipments'),
    ],
  },

  'sales-order': {
    spec: 'sales-order',
    entity: 'header',
    // Dispatched by OrderCreateInvoice and the other order document-creation flows.
    refreshEvent: 'sales-order:document-created',
    depsKey: record => String(record?.quotation ?? ''),
    sources: [
      { key: 'quotation', type: 'sales-quotation', fetch: fetchSourceQuotation },
      criteriaSource('shipments', 'shipment', 'goods-shipment', 'goodsShipment', 'salesOrder'),
      listInvoicesSource('invoices', 'sales-invoice', 'sales-order', 'header'),
    ],
  },

  'sales-invoice': {
    spec: 'sales-invoice',
    entity: 'header',
    // ETP-5576 — dispatched by the follow-up flow (useFollowUpDocuments) after it creates
    // the shipment; the record re-read that follows also refreshes `linkedShipments`.
    refreshEvent: 'sales-invoice:document-created',
    depsKey: record => [
      invoiceOrdersDepsKey(record),
      originInvoicesDepsKey(record),
      idsOf(record?.rectifyingInvoices),
    ].join('|'),
    sources: [
      {
        // ETP-5828: every order the invoice's lines come from (`linkedOrders`), plus the
        // header origin (order or quotation) when it is not one of them.
        key: 'origin',
        type: doc => (doc._isQuotation || doc.isQuotation === true ? 'sales-quotation' : 'sales-order'),
        fetch: invoiceOrdersFetch(fetchInvoiceOrigin),
      },
      // Resolved server-side (SalesInvoiceHeaderHandler#enrichLinkedShipments) from each
      // invoice line's own M_InOutLine_ID: normal deliveries AND customer returns, told
      // apart by `isReturn` (ETP-4534). Never derived from `salesOrder`.
      selectSource('shipments', doc => (doc.isReturn === true ? 'return-material-receipt' : 'shipment'), 'linkedShipments'),
      // What this rectificative rectifies: its C_Invoice_Reverse links (`originInvoices`).
      originInvoicesSource('sales-invoice'),
      // The mirror of originInvoicesSource: the rectificativa(s) that rectify THIS invoice
      // (SalesInvoiceHeaderHandler#enrichRectifyingInvoices, ETP-5745 CP-12). Without this, the
      // ORIGINAL invoice never showed its own rectifications here — only a rectificativa could
      // show what it rectifies, via originInvoicesSource above.
      selectSource('rectifyingInvoices', 'sales-invoice', 'rectifyingInvoices'),
    ],
  },

  // Injected by GoodsShipmentHeaderHandler on the detail GET.
  'goods-shipment': movementDefinition({
    spec: 'goods-shipment',
    entity: 'goodsShipment',
    // ETP-6002 (IMP-3): `linkedOrders` may hold a QUOTATION (a shipment made from an invoice that
    // came straight from it); GoodsShipmentHeaderHandler flags it with `isQuotation`
    // (DocSubTypeSO = 'OB'), so it renders as a quotation chip, not as "Pedido".
    orderType: doc => (doc.isQuotation === true ? 'sales-quotation' : 'sales-order'),
    invoiceType: 'sales-invoice',
    returnType: 'return-material-receipt',
    returnsField: 'returnReceipts',
  }),

  // Injected by ReturnMaterialReceiptHeaderHandler (list and detail GET).
  'return-material-receipt': returnDefinition({
    spec: 'return-material-receipt',
    entity: 'returnMaterialReceipt',
    sourceField: 'sourceShipments',
    sourceType: 'shipment',
    invoiceType: 'sales-invoice',
  }),
};

/** The related-documents definition of a sales spec, or null for any other spec. */
export function getSalesRelatedDocs(specName) {
  return SALES_RELATED_DOCS[specName] ?? null;
}
