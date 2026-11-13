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
  invoiceOrdersFetch,
  invoiceFlowDefinitions,
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
      listInvoicesSource('invoices', 'sales-invoice', 'sales-quotation', 'quotation', { excludeRectificatives: true }),
      // ETP-6002 CP-14 (QA criterion): a quotation's direct relations are its orders and invoices
      // only. A shipment made from an invoice that came straight from the quotation relates to that
      // invoice, never to the quotation, so there is no shipment / return source here.
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
      // ETP-6002: a Pedido never lists a factura rectificativa (QA criterion).
      listInvoicesSource('invoices', 'sales-invoice', 'sales-order', 'header', { excludeRectificatives: true }),
    ],
  },

  // The invoice, the goods shipment and the customer return (the flow shared with purchases):
  // - the invoice's origin is every order its lines come from (`linkedOrders`, ETP-5828), plus the
  //   header origin (order or quotation) when it is not one of them; its shipments are resolved
  //   server-side (SalesInvoiceHeaderHandler#enrichLinkedShipments) from each invoice line's own
  //   M_InOutLine_ID, deliveries and customer returns alike. ETP-5576: the follow-up flow
  //   (useFollowUpDocuments) dispatches the refresh event after it creates the shipment.
  // - the shipment's lists are injected by GoodsShipmentHeaderHandler on the detail GET; ETP-6002
  //   CP-14: `linkedOrders` never holds a quotation (DocSubTypeSO = 'OB' is left out), so every
  //   entry is an order chip.
  // - the customer return's lists are injected by ReturnMaterialReceiptHeaderHandler.
  ...invoiceFlowDefinitions({
    invoiceSpec: 'sales-invoice',
    refreshEvent: 'sales-invoice:document-created',
    orderSource: {
      key: 'origin',
      type: doc => (doc._isQuotation || doc.isQuotation === true ? 'sales-quotation' : 'sales-order'),
      fetch: invoiceOrdersFetch(fetchInvoiceOrigin),
    },
    movementsKey: 'shipments',
    movementsField: 'linkedShipments',
    movementChip: 'shipment',
    returnChip: 'return-material-receipt',
    movementSpec: 'goods-shipment',
    movementEntity: 'goodsShipment',
    orderType: 'sales-order',
    returnsField: 'returnReceipts',
    returnSpec: 'return-material-receipt',
    returnEntity: 'returnMaterialReceipt',
    returnSourceField: 'sourceShipments',
  }),
};

/** The related-documents definition of a sales spec, or null for any other spec. */
export function getSalesRelatedDocs(specName) {
  return SALES_RELATED_DOCS[specName] ?? null;
}
