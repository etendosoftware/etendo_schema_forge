/**
 * Source factories and small helpers shared by the sales and purchase related-documents
 * definitions (salesRelatedDocs.js, purchaseRelatedDocs.js). Each factory returns a
 * plain source object ({ key, type, select | fetch }) — see salesRelatedDocs.js for the
 * contract. Network access stays in ./helpers.js.
 */
import { fetchByCriteria, fetchListInvoices, fetchOriginInvoicesOf } from './helpers.js';

export const asArray = (value) => (Array.isArray(value) ? value : []);

export function idsOf(list) {
  return asArray(list).map(item => (item && typeof item === 'object' ? item.id : item)).join(',');
}

/** Documents of `spec`/`entity` whose `column` equals the id of this document. */
export function criteriaSource(key, type, spec, entity, column) {
  return {
    key,
    type,
    fetch: ({ id, token, apiBaseUrl }) =>
      fetchByCriteria(spec, entity, column, id, token, apiBaseUrl),
  };
}

/** Invoices of this order-like document through the `listInvoices` header action. */
export function listInvoicesSource(key, type, spec, entity) {
  return {
    key,
    type,
    fetch: ({ id, token, apiBaseUrl }) =>
      fetchListInvoices(spec, entity, id, token, apiBaseUrl),
  };
}

/** Documents read synchronously from an array field of the detail record. */
export function selectSource(key, type, field) {
  return { key, type, select: record => asArray(record?.[field]) };
}

/** Invoices linked through "Import from Source Invoice", read from `originInvoices`. */
export function originInvoicesSource(spec) {
  return { key: 'originInvoices', type: spec, fetch: fetchOriginInvoicesOf(spec) };
}

/** The part of an invoice definition's `depsKey` that tracks its origin invoices. */
export function originInvoicesDepsKey(record) {
  return `${idsOf(record?.originInvoices)}|${record?.originInvoice ?? ''}`;
}

/**
 * Fetch of an invoice's ORDER source (ETP-5828): every order its lines come from
 * (`linkedOrders`, injected on the detail GET by AbstractInvoiceHeaderHandler#enrichLinkedOrders
 * from C_InvoiceLine.C_OrderLine_ID), plus the header order (`salesOrder`, C_Order_ID) resolved
 * by `fetchHeaderOrigin` when it is not already among them. The header order alone is not
 * enough: it is blanked when the lines come from more than one order (ETP-5381). It stays the
 * fallback when `linkedOrders` is absent or empty (e.g. an invoice generated from a quotation
 * before its lines exist, or an older backend).
 *
 * @param {(ctx: object) => Promise<object[]>} fetchHeaderOrigin — resolves the header order
 * @returns {(ctx: { record: object }) => Promise<object[]>}
 */
export function invoiceOrdersFetch(fetchHeaderOrigin) {
  return async function fetchInvoiceOrders(ctx) {
    const linked = asArray(ctx.record?.linkedOrders).filter(order => order?.id);
    const headerOrderId = ctx.record?.salesOrder;
    if (!headerOrderId || linked.some(order => order.id === headerOrderId)) return linked;
    const headerOrigin = await fetchHeaderOrigin(ctx);
    return [...linked, ...asArray(headerOrigin)];
  };
}

/** The part of an invoice definition's `depsKey` that tracks its orders (ETP-5828). */
export function invoiceOrdersDepsKey(record) {
  return `${record?.salesOrder ?? ''}|${idsOf(record?.linkedOrders)}`;
}

/**
 * Definition of a goods movement (goods shipment / goods receipt): its linked orders,
 * invoices and returns, all injected by the backend on the detail GET.
 */
// `orderType` is a chip type or a (doc) => type function (the sales shipment tells a quotation
// from an order by `isQuotation`, ETP-6002); the purchase side passes a plain type.
export function movementDefinition({ spec, entity, orderType, invoiceType, returnType, returnsField }) {
  return {
    spec,
    entity,
    sources: [
      selectSource('orders', orderType, 'linkedOrders'),
      selectSource('invoices', invoiceType, 'linkedInvoices'),
      selectSource('returns', returnType, returnsField),
    ],
  };
}

/**
 * Definition of a return movement (return material receipt / return to vendor
 * shipment): the movements it returns and its credit invoices.
 */
export function returnDefinition({ spec, entity, sourceField, sourceType, invoiceType }) {
  return {
    spec,
    entity,
    sources: [
      selectSource(sourceField, sourceType, sourceField),
      selectSource('returnInvoices', invoiceType, 'returnInvoices'),
    ],
  };
}
