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

/**
 * Invoices of this order-like document through the `listInvoices` header action.
 * `excludeRectificatives` (ETP-6002, sales order and quotation) leaves out the rows the backend
 * flags `isRectificative: true`: a rectificative is the original invoice's relation, not the
 * order's. Without it (purchase) every row is kept, as before.
 */
export function listInvoicesSource(key, type, spec, entity, { excludeRectificatives = false } = {}) {
  return {
    key,
    type,
    fetch: async ({ id, token, apiBaseUrl }) => {
      const rows = await fetchListInvoices(spec, entity, id, token, apiBaseUrl);
      return excludeRectificatives ? asArray(rows).filter(row => row?.isRectificative !== true) : rows;
    },
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

/**
 * The three definitions of one document flow, shared by sales and purchases (ETP-6002, so the two
 * modules no longer repeat them): the INVOICE (its orders, its goods movements and returns, the
 * invoices it rectifies and the ones that rectify it), the GOODS MOVEMENT ({@link
 * movementDefinition}) and the RETURN movement ({@link returnDefinition}). Each side passes only
 * what differs; the result is keyed by spec, in that order, to be spread into the side's map.
 *
 * @param {object} flow
 * @param {string} flow.invoiceSpec — the invoice spec, also its chip type and the movements' invoice chip
 * @param {string} flow.refreshEvent — the invoice's document-created window event
 * @param {object} flow.orderSource — the invoice's order source (its key, chip type and fetch)
 * @param {string} flow.movementsKey — source key of the invoice's movements
 * @param {string} flow.movementsField — detail field the invoice's movements are read from
 * @param {string} flow.movementChip — chip type of a movement (and of a return's source)
 * @param {string} flow.returnChip — chip type of a return movement
 * @param {string} flow.movementSpec — the goods-movement spec
 * @param {string} flow.movementEntity — its header entity
 * @param {string | Function} flow.orderType — chip type of the movement's orders
 * @param {string} flow.returnsField — detail field the movement's returns are read from
 * @param {string} flow.returnSpec — the return-movement spec
 * @param {string} flow.returnEntity — its header entity
 * @param {string} flow.returnSourceField — detail field of the movements a return returns
 */
export function invoiceFlowDefinitions(flow) {
  return {
    [flow.invoiceSpec]: {
      spec: flow.invoiceSpec,
      entity: 'header',
      refreshEvent: flow.refreshEvent,
      depsKey: record => [
        invoiceOrdersDepsKey(record),
        originInvoicesDepsKey(record),
        idsOf(record?.rectifyingInvoices),
      ].join('|'),
      sources: [
        flow.orderSource,
        // Read from each invoice line's own movement link; deliveries and returns are told apart
        // by `isReturn` (ETP-4534), never derived from the invoice's order.
        selectSource(flow.movementsKey,
          doc => (doc.isReturn === true ? flow.returnChip : flow.movementChip), flow.movementsField),
        // What this rectificative rectifies: its C_Invoice_Reverse links (`originInvoices`).
        originInvoicesSource(flow.invoiceSpec),
        // The mirror: the rectificativa(s) that rectify THIS invoice (ETP-5745 CP-12).
        selectSource('rectifyingInvoices', flow.invoiceSpec, 'rectifyingInvoices'),
      ],
    },
    [flow.movementSpec]: movementDefinition({
      spec: flow.movementSpec,
      entity: flow.movementEntity,
      orderType: flow.orderType,
      invoiceType: flow.invoiceSpec,
      returnType: flow.returnChip,
      returnsField: flow.returnsField,
    }),
    [flow.returnSpec]: returnDefinition({
      spec: flow.returnSpec,
      entity: flow.returnEntity,
      sourceField: flow.returnSourceField,
      sourceType: flow.movementChip,
      invoiceType: flow.invoiceSpec,
    }),
  };
}
