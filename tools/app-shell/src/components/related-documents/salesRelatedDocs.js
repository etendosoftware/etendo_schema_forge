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
 * (`linkedShipments`, `sourceInvoice`, `originInvoices`, goods-shipment `linked*`) are
 * injected by the backend handlers on the detail GET only. `apiBaseUrl` is the
 * spec-scoped base (`.../sws/neo/<spec>`); cross-spec calls go through neoBase().
 *
 * Purchase documents are deliberately NOT here (separate ticket ETP-5539).
 */
import { getArSubtype } from '@generated/sales-invoice/custom/invoiceSubtype.js';
import {
  fetchByCriteria,
  fetchById,
  fetchListInvoices,
  fetchSalesOrderPayments,
} from './helpers.js';

const asArray = (value) => (Array.isArray(value) ? value : []);

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

/**
 * For a rectificative invoice (ETP-4737 unified subtype), the invoices it rectifies:
 * the other invoices of the same order.
 */
async function fetchRectifiedInvoices({ id, record, token, apiBaseUrl }) {
  const orderId = record?.salesOrder;
  if (!orderId || getArSubtype(record) !== 'RECTIFICATIVA') return [];
  const invoices = await fetchByCriteria('sales-invoice', 'header', 'salesOrder', orderId, token, apiBaseUrl);
  return invoices.filter(inv => inv.id !== id);
}

/**
 * Invoices manually linked through "Import from Source Invoice" (ETP-4737/ETP-4919):
 * `originInvoices` is an array of {id, documentNo}; the legacy singular `originInvoice`
 * (bare id) is kept as a fallback for an older response shape.
 */
async function fetchOriginInvoices({ record, token, apiBaseUrl }) {
  const ids = Array.isArray(record?.originInvoices)
    ? record.originInvoices.map(o => o?.id).filter(Boolean)
    : [record?.originInvoice].filter(Boolean);
  if (ids.length === 0) return [];
  const invoices = await Promise.all(
    ids.map(invId => fetchById('sales-invoice', 'header', invId, token, apiBaseUrl))
  );
  return invoices.filter(Boolean);
}

function idsOf(list) {
  return asArray(list).map(item => (item && typeof item === 'object' ? item.id : item)).join(',');
}

export const SALES_RELATED_DOCS = {
  'sales-quotation': {
    spec: 'sales-quotation',
    entity: 'quotation',
    // ETP-4779 — QuotationConfirmModal dispatches it after converting the quotation.
    refreshEvent: 'sales-quotation:document-created',
    sources: [
      {
        key: 'orders',
        type: 'sales-order',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchByCriteria('sales-order', 'header', 'quotation', id, token, apiBaseUrl),
      },
      {
        key: 'invoices',
        type: 'sales-invoice',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchListInvoices('sales-quotation', 'quotation', id, token, apiBaseUrl),
      },
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
      {
        key: 'shipments',
        type: 'shipment',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchByCriteria('goods-shipment', 'goodsShipment', 'salesOrder', id, token, apiBaseUrl),
      },
      {
        key: 'invoices',
        type: 'sales-invoice',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchListInvoices('sales-order', 'header', id, token, apiBaseUrl),
      },
      {
        key: 'payments',
        type: 'payment-in',
        fetch: ({ id, token, apiBaseUrl }) => fetchSalesOrderPayments(id, token, apiBaseUrl),
      },
    ],
  },

  'sales-invoice': {
    spec: 'sales-invoice',
    entity: 'header',
    depsKey: record => [
      record?.salesOrder ?? '',
      getArSubtype(record),
      idsOf(record?.originInvoices),
      record?.originInvoice ?? '',
    ].join('|'),
    sources: [
      {
        key: 'origin',
        type: doc => (doc._isQuotation ? 'sales-quotation' : 'sales-order'),
        fetch: fetchInvoiceOrigin,
      },
      {
        // Resolved server-side (SalesInvoiceHeaderHandler#enrichLinkedShipments) from each
        // invoice line's own M_InOutLine_ID: normal deliveries AND customer returns, told
        // apart by `isReturn` (ETP-4534). Never derived from `salesOrder`.
        key: 'shipments',
        type: doc => (doc.isReturn === true ? 'return-material-receipt' : 'shipment'),
        select: record => asArray(record?.linkedShipments),
      },
      { key: 'rectified', type: 'sales-invoice', fetch: fetchRectifiedInvoices },
      {
        // Injected only when this invoice traces back through a return to the original
        // invoice being reversed (SalesInvoiceHeaderHandler#enrichSourceInvoice).
        key: 'sourceInvoice',
        type: 'sales-invoice',
        select: record => (record?.sourceInvoice ? [record.sourceInvoice] : []),
      },
      { key: 'originInvoices', type: 'sales-invoice', fetch: fetchOriginInvoices },
    ],
  },

  'goods-shipment': {
    spec: 'goods-shipment',
    entity: 'goodsShipment',
    // Injected by GoodsShipmentHeaderHandler on the detail GET.
    sources: [
      { key: 'orders', type: 'sales-order', select: record => asArray(record?.linkedOrders) },
      { key: 'invoices', type: 'sales-invoice', select: record => asArray(record?.linkedInvoices) },
      { key: 'returns', type: 'return-material-receipt', select: record => asArray(record?.returnReceipts) },
    ],
  },

  'return-material-receipt': {
    spec: 'return-material-receipt',
    entity: 'returnMaterialReceipt',
    // Injected by ReturnMaterialReceiptHeaderHandler (list and detail GET).
    sources: [
      { key: 'sourceShipments', type: 'shipment', select: record => asArray(record?.sourceShipments) },
      { key: 'returnInvoices', type: 'sales-invoice', select: record => asArray(record?.returnInvoices) },
    ],
  },
};

/** The related-documents definition of a sales spec, or null for any other spec. */
export function getSalesRelatedDocs(specName) {
  return SALES_RELATED_DOCS[specName] ?? null;
}
