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
  selectSource,
  originInvoicesSource,
  originInvoicesDepsKey,
  movementDefinition,
  returnDefinition,
} from './relatedSources.js';

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

  'purchase-invoice': {
    spec: 'purchase-invoice',
    entity: 'header',
    refreshEvent: 'purchase-invoice:document-created',
    depsKey: record => [record?.salesOrder ?? '', originInvoicesDepsKey(record)].join('|'),
    sources: [
      {
        key: 'order',
        type: 'order',
        fetch: async ({ record, token, apiBaseUrl }) => {
          if (!record?.salesOrder) return [];
          const order = await fetchById('purchase-order', 'header', record.salesOrder, token, apiBaseUrl);
          return order ? [order] : [];
        },
      },
      selectSource('receipts', doc => (doc.isReturn === true ? 'return-to-vendor' : 'goods-receipt'), 'linkedReceipts'),
      originInvoicesSource('purchase-invoice'),
    ],
  },

  'goods-receipt': movementDefinition({
    spec: 'goods-receipt',
    entity: 'goodsReceipt',
    orderType: 'order',
    invoiceType: 'purchase-invoice',
    returnType: 'return-to-vendor',
    returnsField: 'linkedReturns',
  }),

  'return-to-vendor-shipment': returnDefinition({
    spec: 'return-to-vendor-shipment',
    entity: 'returnToVendorShipment',
    sourceField: 'sourceReceipts',
    sourceType: 'goods-receipt',
    invoiceType: 'purchase-invoice',
  }),
};

/** The related-documents definition of a purchase spec, or null for any other spec. */
export function getPurchaseRelatedDocs(specName) {
  return PURCHASE_RELATED_DOCS[specName] ?? null;
}
