import {
  ImportLoadError, MAX_ACTION_PAGE, actionErrorMessage, actionUrl, listAll, listLines, newestCreatedFirst,
} from './importActionClient.js';

// ETP-6099: the read-action client, the load-error class and its sentence moved to the shared
// `importActionClient.js` every «Importar desde…» popup uses; re-exported so this module's callers
// (InvoiceOrderImportModal, its tests) keep importing them from here.
export { describeLoadFailure } from './importActionClient.js';
/** The load error of an order-import read — the shared `ImportLoadError` (same class). */
export const OrderImportLoadError = ImportLoadError;

/**
 * «Importar desde pedido» on an invoice — the data side of the ONE order-import popup shared by
 * sales and purchase invoices (ETP-6002, unified in ETP-5828). Pure functions over an injected
 * `apiFetch`, so the component hands in its `useApiFetch('')` and a plain `node --test` hands in a
 * stub. Nothing here is direction-specific beyond the `INVOICE_ORDER_IMPORT` entry it is given.
 *
 * With `importVia: 'server'` (sales; purchases go `'client'` for now, see INVOICE_ORDER_IMPORT) the
 * import is ONE call to the invoice's declared `importOrderLines` action — the same one the MCP
 * uses — never one line POST per order line, so the window and the agents share one rule:
 * - each order line's quantity goes first to its completed shipment/receipt lines not yet
 *   invoiced, oldest first, one INVOICE LINE PER SHIPMENT LINE; what was ordered and not delivered
 *   becomes one line linked to the order line only;
 * - prices, discount, tax and UoM are copied from the order line server-side, line numbers follow
 *   the invoice's last line, and the order's global discount is carried by the server
 *   (`carryGlobalDiscount`, decided by the same rule the notice shows) in the same transaction, so
 *   the totals are right the moment the popup closes (the client path still shows mixed totals
 *   for a few seconds, QA UI-1, because its header % is PATCHed after the line POSTs);
 * - all or nothing: a refusal (e.g. more than pending, a discount conflict) imports no line.
 * The selectable quantity is the action's own pending (`availableOrderLines`: ordered − invoiced −
 * what any draft invoice already holds), so the popup never offers more than the server accepts.
 * ETP-5828 (speed): the server path also LISTS through the invoice's actions — `availableOrders`
 * for the orders and one `availableOrderLines` per order for the lines, price and pending — instead
 * of the company-wide order list and two requests per order, and neither read re-reads the invoice.
 * ETP-6099: BOTH directions list that way now (purchases with `pendingBasis: 'classic'`, so their
 * pending rule is unchanged); `importVia` only decides how the selection is imported. The
 * `availableOrderLines` row carries every field `buildOrderInvoiceLineBody` reads (listPrice,
 * grossUnitPrice, tax, description, …), so the client import needs no order-lines GET.
 */

/**
 * Per-direction configuration: the specs it reads, the i18n keys it shows, and HOW it imports.
 *
 * Both directions LIST through the invoice's `availableOrders` / `availableOrderLines` actions.
 * `pendingBasis` picks the pending rule the actions apply: absent (sales) = ordered − invoiced −
 * what draft invoices hold; `'classic'` (purchases, ETP-6099 product decision) = the rule the
 * purchase popup had before it listed through the actions, ordered − invoiced with no draft
 * deduction — so purchases list exactly as before. `importVia` is the one switch of the IMPORT
 * (the popup looks the same either way):
 *  - `'server'`: ONE `importOrderLines` call that also carries the global discount (see the
 *    header comment);
 *  - `'client'`: one `POST {invoiceSpec}/lines` per selected line built by
 *    `buildOrderInvoiceLineBody` from the `availableOrderLines` row, then a header
 *    `etgoTotalDiscount` PATCH from the browser when the carry applies. Purchases stay here until
 *    QA decides the import side (MCP-2); known consequence: the totals show a mix for a few seconds
 *    after the import (QA UI-1). Flipping purchases to `'server'` is this one line.
 */
export const INVOICE_ORDER_IMPORT = Object.freeze({
  sales: Object.freeze({
    importVia: 'server',
    invoiceSpec: 'sales-invoice',
    orderSpec: 'sales-order',
    titleKey: 'importFromSalesOrder',
    searchPlaceholderKey: 'searchSalesOrder',
    emptyMessageKey: 'noCompletedSalesOrdersForThisCustomer',
    noCurrencyMatchMessageKey: 'noSalesOrdersMatchCurrency',
    successMessageKey: 'linesImportedFromSalesOrder',
  }),
  purchase: Object.freeze({
    importVia: 'client',
    pendingBasis: 'classic',
    invoiceSpec: 'purchase-invoice',
    orderSpec: 'purchase-order',
    titleKey: 'importFromPurchaseOrder',
    searchPlaceholderKey: 'searchPurchaseOrder',
    emptyMessageKey: 'noCompletedPurchaseOrdersForThisSupplier',
    noCurrencyMatchMessageKey: 'noPurchaseOrdersMatchCurrency',
    successMessageKey: 'linesImportedFromPurchaseOrder',
  }),
});

/** The configuration of `direction` ('sales' | 'purchase'); throws on anything else. */
export function invoiceOrderImportConfig(direction) {
  const config = INVOICE_ORDER_IMPORT[direction];
  if (!config) throw new Error(`InvoiceOrderImport: unknown direction "${direction}"`);
  return config;
}

const rowsOf = async (res) => (await res.json())?.response?.data || [];

/** The read-action params the direction's pending rule adds (none on sales: its bodies stay as they were). */
const pendingBasisParams = (config) => (config.pendingBasis ? { pendingBasis: config.pendingBasis } : {});

// ETP-6099: the one creation-date sort lives in the shared client; re-exported under the same
// name for this module's importers (the source-invoice popups and their tests).
export { newestCreatedFirst } from './importActionClient.js';

/**
 * ETP-5828 — the longest `availableOrders` page the popup asks for (the server's maximum on a
 * sales invoice). The old read took at most 500 orders of the WHOLE company, so a customer's older
 * orders vanished once the company passed 500; the action lists the customer's own pending ones.
 */
export const MAX_LISTED_ORDERS = MAX_ACTION_PAGE;

/**
 * The partner's completed, not fully invoiced orders in the invoice's currency, plus what the
 * global-discount notice needs (`useOrderGlobalDiscountImport`).
 */
export async function fetchOrderDocuments({ apiFetch, config, base, bpId, invoiceId }) {
  const [rows, invLinesRes, headerRes] = await Promise.all([
    // ETP-5828 — lists through the invoice's own `availableOrders` (the partner's completed orders
    // in the invoice's currency with something pending, drafts counted); ETP-6099: purchases too,
    // instead of the company-wide order list filtered here, with `pendingBasis: 'classic'` (no
    // draft deduction, the rule their popup had). `listAll` reads every page (follows
    // nextOffset while hasMore) and rejects with OrderImportLoadError on a refusal.
    // `includeCovered` also brings the orders with nothing left (on sales, also those entirely held
    // by draft invoices), at pendingLines 0, for the popup to hide (`isOrderCovered`) without
    // reading their lines.
    // Purchases also ask `detail` for the row's `creationDate`: their popup listed newest CREATED
    // first, the action answers newest by order date (sales already answers by creation date and
    // keeps its request as it was).
    listAll({
      apiFetch, base, spec: config.invoiceSpec, targetId: invoiceId, action: 'availableOrders',
      params: {
        includeCovered: true, ...(config.importVia === 'client' ? { detail: true } : {}), ...pendingBasisParams(config),
      },
    }).then(newestCreatedFirst),
    apiFetch(`${base}/${config.invoiceSpec}/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    apiFetch(`${base}/${config.invoiceSpec}/header/${invoiceId}`),
  ]);

  const alreadyImportedOrderLines = new Set();
  // ETP-5828: the GET already hides the ETGO_DTO global-discount line (InvoiceLineHandler).
  let invoiceHasLines = false;
  if (invLinesRes.ok) {
    const invLines = await rowsOf(invLinesRes);
    invoiceHasLines = invLines.length > 0;
    invLines.forEach(il => { if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine); });
  }

  let invoiceCurrency = null;
  let invoiceGlobalDiscount = null;
  let invoiceHeaderRead = false;
  if (headerRes.ok) {
    const invoiceHeader = (await rowsOf(headerRes))[0];
    invoiceHeaderRead = !!invoiceHeader;
    invoiceCurrency = invoiceHeader?.currency || null;
    invoiceGlobalDiscount = Number(invoiceHeader?.etgoTotalDiscount) || null;
  }
  // ETP-5828: a failed header or lines GET leaves the invoice % / lines unknown; the shared
  // global-discount rule then offers no carry.
  const invoiceStateKnown = invoiceHeaderRead && invLinesRes.ok;

  const { documents, excludedByCurrency } = await listedOrders({ apiFetch, config, base, bpId, invoiceCurrency, rows });
  const orderDiscountMap = {};
  documents.forEach(o => {
    if (o.etgoTotalDiscount) orderDiscountMap[o.id] = Number(o.etgoTotalDiscount);
  });
  return {
    documents,
    sharedContext: {
      alreadyImportedOrderLines, orderDiscountMap, invoiceGlobalDiscount, invoiceHasLines, invoiceStateKnown,
      invoiceId,
    },
    excludedByCurrency,
  };
}

/**
 * The fallback's candidates (see `listedOrders`): the partner's completed, not fully invoiced
 * orders, those in the invoice's currency kept (`excludedByCurrency` when that empties a non-empty
 * list).
 */
function filterCandidateOrders(orders, bpId, invoiceCurrency) {
  const candidates = orders.filter(o =>
    o.documentStatus === 'CO'
    && o.businessPartner === bpId
    && Number(o.invoiceStatus ?? 0) < 100
  );
  const documents = invoiceCurrency ? candidates.filter(o => o.currency === invoiceCurrency) : candidates;
  return { documents, excludedByCurrency: !!invoiceCurrency && documents.length === 0 && candidates.length > 0 };
}

/**
 * The documents: the `availableOrders` rows, in the shape the popup reads
 * (`orderDate`, `etgoTotalDiscount`). Only when that list is EMPTY is the partner's order list read
 * (server-filtered by partner and status), so the popup still tells "no orders in this currency"
 * apart from "no orders". An order that read lists in the invoice's currency was not offered by
 * the action (even with `includeCovered`), so it has nothing to import: it comes at
 * `pendingLines: 0` for the popup to hide, as it did when it read every order.
 */
async function listedOrders({ apiFetch, config, base, bpId, invoiceCurrency, rows }) {
  if (rows.length > 0) {
    return {
      documents: rows.map(r => ({
        ...r,
        orderDate: r.date,
        documentStatus: 'CO',
        etgoTotalDiscount: Number(r.globalDiscount) || 0,
      })),
      excludedByCurrency: false,
    };
  }
  const criteria = encodeURIComponent(JSON.stringify([
    { fieldName: 'businessPartner', operator: 'equals', value: bpId },
    { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
  ]));
  try {
    const res = await apiFetch(`${base}/${config.orderSpec}/header?criteria=${criteria}&_startRow=0&_endRow=500&_sortBy=creationDate desc`);
    if (!res.ok) return { documents: [], excludedByCurrency: false };
    const { documents, excludedByCurrency } = filterCandidateOrders(await rowsOf(res), bpId, invoiceCurrency);
    return { documents: documents.map(o => ({ ...o, pendingLines: 0 })), excludedByCurrency };
  } catch {
    return { documents: [], excludedByCurrency: false };
  }
}

/**
 * The order's lines, each capped at what the import still accepts. ETP-5828 — ONE
 * `availableOrderLines` call per order brings every line the popup shows with its pending (sales:
 * drafts counted, this invoice included; purchases: `pendingBasis: 'classic'`, ordered − invoiced),
 * price and product, the lines with nothing left included at 0
 * (`includeCovered`) so the popup still greys them out. It replaced the order lines GET + pending
 * POST pair (ETP-6099: on purchases too, which read the order lines GET and took ordered −
 * invoiced). Lines in `lineNo` order, as the GET listed.
 */
export async function fetchOrderLines({ apiFetch, config, base, docId, sharedContext }) {
  const invoiceId = sharedContext?.invoiceId;
  if (!invoiceId) return [];
  const rows = await listLines({
    apiFetch, base, spec: config.invoiceSpec, targetId: invoiceId, action: 'availableOrderLines',
    // `detail` adds the order-line columns the CLIENT import builds its line body from (listPrice,
    // grossUnitPrice, tax, description, …); the server import does not need them, so sales keeps
    // its request as it was.
    params: {
      orderId: docId, includeCovered: true, ...(config.importVia === 'client' ? { detail: true } : {}),
      ...pendingBasisParams(config),
    },
  });
  return rows.map(r => orderLineRow(r, Number(r.pendingQuantity) || 0, sharedContext));
}

function orderLineRow(l, pending, sharedContext) {
  const unitPrice = Number(l.unitPrice) || 0;
  const alreadyInCurrent = sharedContext?.alreadyImportedOrderLines?.has(l.id) || false;
  return {
    ...l,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: pending,
    _unitPrice: unitPrice,
    _lineNetAmount: unitPrice * pending,
    _alreadyImported: alreadyInCurrent || pending <= 0,
  };
}

/**
 * The invoice line the CLIENT import path POSTs for one selected order line (restored as it was
 * before ETP-5828 unified the popup). Price, list price, line discount, tax and UoM come from the
 * order line — since ETP-6099 the `availableOrderLines` row, which carries the same order-line
 * columns the order-lines GET did; the order line FK travels as `salesOrderLine` (the spec's java_qualifier, ETP-5381).
 * ETP-5710: unitPrice is the order line's already-discounted price. Without a list price the old
 * fallback posted U == L next to etgoDiscount, which the server reads as "not yet discounted" and
 * discounts again. Rebuild the list price so U != L (6 decimals, as the SPA).
 */
export function buildOrderInvoiceLineBody({ line, qty, invoiceId, lineNo }) {
  const unitPrice = Number(line.unitPrice) || 0;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.discount) || 0;
  const storedListPrice = Number(line.listPrice) || 0;
  const listPrice = storedListPrice
    || (discount > 0 && discount < 100
      ? Math.round((unitPrice / (1 - discount / 100)) * 1e6) / 1e6
      : unitPrice);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: qty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * qty,
    description: line.description || null,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    salesOrderLine: line.id,
  };
}

export const getOrderDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.orderDate,
});

/**
 * ETP-6099 — the popup reads an order's lines only when it is opened (`eagerLoadLines` off), so
 * the row decides from the `availableOrders` row itself: an order with nothing left to import
 * (`pendingLines: 0`) is hidden, ...
 */
export const isOrderCovered = (doc) => doc.pendingLines != null && Number(doc.pendingLines) === 0;

/**
 * ... and the row total is the action's `amount` (unit price × pending of its lines, the sum the
 * loaded lines used to give). Without one (an older backend) the modal sums the loaded lines.
 */
export const getOrderTotal = (doc) => (doc.amount == null ? null : Number(doc.amount));

/**
 * Imports the selected lines in ONE `importOrderLines` call, grouped by order in list order.
 * Returns `{ ok, count, afterImportResult }` or `{ ok: false, error }`.
 */
export async function submitOrderImport({ apiFetch, config, lines, base, invoiceId, selection, serverCarry, ui }) {
  const byOrder = new Map();
  for (const { line, qty, docId } of lines) {
    const quantity = Number(qty) || 0;
    if (quantity <= 0) continue;
    if (!byOrder.has(docId)) byOrder.set(docId, []);
    byOrder.get(docId).push({ sourceLineId: line.id, quantity });
  }
  // Every selected quantity is 0: nothing is sent. Same message the modal's own quantity check
  // shows for a zero quantity, so the user knows what to fix (the modal stays open).
  if (byOrder.size === 0) return { ok: false, error: ui('qtyMustBePositive') };
  const carry = serverCarry(selection);
  const res = await apiFetch(actionUrl(base, config.invoiceSpec, invoiceId, 'importOrderLines'), {
    method: 'POST',
    // A write: a cut-off request that still commits must not be re-sent by a timeout.
    timeout: 0,
    body: JSON.stringify({
      orders: [...byOrder].map(([orderId, orderLines]) => ({ orderId, lines: orderLines })),
      carryGlobalDiscount: carry.carryGlobalDiscount,
    }),
  });
  if (!res.ok) return { ok: false, error: await actionErrorMessage(res, ui) };
  const data = (await res.json())?.response?.data;
  return { ok: true, count: data?.importedCount, afterImportResult: discountOutcome(data, carry) };
}

/**
 * What the toast reports about the global discount: what the SERVER did (`globalDiscount:
 * {applied, percent, reason}` of `importOrderLines`, the same answer the MCP gets), not what the
 * popup predicted. The prediction (`serverCarry`) is only the fallback for an older backend that
 * does not send the field.
 */
export function discountOutcome(data, carry) {
  const reported = data?.globalDiscount;
  if (!reported || typeof reported.applied !== 'boolean') return carry.afterImportResult;
  const pct = Number(reported.percent);
  return reported.applied && Number.isFinite(pct) && pct > 0
    ? { carried: true, pct }
    : { carried: false };
}
