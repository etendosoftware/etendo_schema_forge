/**
 * Single definition of the related documents of every PURCHASE document (ETP-5539).
 * Same shape and contract as salesRelatedDocs.js (see its header): the form section
 * and the list-preview card both render from this module.
 *
 * Payments are deliberately NOT related documents (functional decision, as in
 * ETP-5527). The backend `linkedReceipts` of a purchase invoice already includes the
 * return shipments of a rectificative (isReturn === true), so no extra fetch chain
 * is needed for them.
 */
import { fetchById } from './helpers.js';
import {
  criteriaSource,
  listInvoicesSource,
  invoiceOrdersFetch,
  invoiceFlowDefinitions,
} from './relatedSources.js';

/** The header order of a purchase invoice (`salesOrder`, C_Order_ID), read from the order itself. */
async function fetchHeaderOrder({ record, token, apiBaseUrl }) {
  if (!record?.salesOrder) return [];
  const order = await fetchById('purchase-order', 'header', record.salesOrder, token, apiBaseUrl);
  return order ? [order] : [];
}

export const PURCHASE_RELATED_DOCS = {
  'purchase-order': {
    spec: 'purchase-order',
    entity: 'header',
    refreshEvent: 'purchase-order:document-created',
    sources: [
      criteriaSource('receipts', 'goods-receipt', 'goods-receipt', 'goodsReceipt', 'salesOrder'),
      listInvoicesSource('invoices', 'purchase-invoice', 'purchase-order', 'header'),
    ],
  },

  // The invoice, the goods receipt and the return to vendor (the flow shared with sales). The
  // invoice's order source is every order its lines come from (`linkedOrders`, ETP-5828), plus the
  // header order when it is not one of them; its rectifying invoices come from
  // PurchaseInvoiceHeaderHandler#enrichRectifyingInvoices (ETP-5745 CP-12).
  ...invoiceFlowDefinitions({
    invoiceSpec: 'purchase-invoice',
    refreshEvent: 'purchase-invoice:document-created',
    orderSource: { key: 'order', type: 'order', fetch: invoiceOrdersFetch(fetchHeaderOrder) },
    movementsKey: 'receipts',
    movementsField: 'linkedReceipts',
    movementChip: 'goods-receipt',
    returnChip: 'return-to-vendor',
    movementSpec: 'goods-receipt',
    movementEntity: 'goodsReceipt',
    orderType: 'order',
    returnsField: 'linkedReturns',
    returnSpec: 'return-to-vendor-shipment',
    returnEntity: 'returnToVendorShipment',
    returnSourceField: 'sourceReceipts',
  }),
};

/** The related-documents definition of a purchase spec, or null for any other spec. */
export function getPurchaseRelatedDocs(specName) {
  return PURCHASE_RELATED_DOCS[specName] ?? null;
}
