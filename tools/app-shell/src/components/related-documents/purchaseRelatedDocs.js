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
import {
  fetchByCriteria,
  fetchById,
  fetchListInvoices,
  fetchOriginInvoicesOf,
} from './helpers.js';

const asArray = (value) => (Array.isArray(value) ? value : []);

function idsOf(list) {
  return asArray(list).map(item => (item && typeof item === 'object' ? item.id : item)).join(',');
}

export const PURCHASE_RELATED_DOCS = {
  'purchase-order': {
    spec: 'purchase-order',
    entity: 'header',
    refreshEvent: 'purchase-order:document-created',
    sources: [
      {
        key: 'receipts',
        type: 'goods-receipt',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchByCriteria('goods-receipt', 'goodsReceipt', 'salesOrder', id, token, apiBaseUrl),
      },
      {
        key: 'invoices',
        type: 'purchase-invoice',
        fetch: ({ id, token, apiBaseUrl }) =>
          fetchListInvoices('purchase-order', 'header', id, token, apiBaseUrl),
      },
    ],
  },

  'purchase-invoice': {
    spec: 'purchase-invoice',
    entity: 'header',
    refreshEvent: 'purchase-invoice:document-created',
    depsKey: record => [
      record?.salesOrder ?? '',
      idsOf(record?.originInvoices),
      record?.originInvoice ?? '',
    ].join('|'),
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
      {
        key: 'receipts',
        type: doc => (doc.isReturn === true ? 'return-to-vendor' : 'goods-receipt'),
        select: record => asArray(record?.linkedReceipts),
      },
      { key: 'originInvoices', type: 'purchase-invoice', fetch: fetchOriginInvoicesOf('purchase-invoice') },
    ],
  },

  'goods-receipt': {
    spec: 'goods-receipt',
    entity: 'goodsReceipt',
    sources: [
      { key: 'orders', type: 'order', select: record => asArray(record?.linkedOrders) },
      { key: 'invoices', type: 'purchase-invoice', select: record => asArray(record?.linkedInvoices) },
      { key: 'returns', type: 'return-to-vendor', select: record => asArray(record?.linkedReturns) },
    ],
  },

  'return-to-vendor-shipment': {
    spec: 'return-to-vendor-shipment',
    entity: 'returnToVendorShipment',
    sources: [
      { key: 'sourceReceipts', type: 'goods-receipt', select: record => asArray(record?.sourceReceipts) },
      { key: 'returnInvoices', type: 'purchase-invoice', select: record => asArray(record?.returnInvoices) },
    ],
  },
};

/** The related-documents definition of a purchase spec, or null for any other spec. */
export function getPurchaseRelatedDocs(specName) {
  return PURCHASE_RELATED_DOCS[specName] ?? null;
}
