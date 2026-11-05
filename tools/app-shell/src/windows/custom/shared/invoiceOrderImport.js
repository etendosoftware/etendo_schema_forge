import { translateImportRefusal } from '../../../lib/backendErrors.js';

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
 */

/**
 * Per-direction configuration: the specs it reads, the i18n keys it shows, and HOW it imports.
 *
 * `importVia` is the one switch of the data path (the popup looks the same either way):
 *  - `'server'`: pending from the invoice's `availableOrderLines` action (drafts subtracted) and
 *    ONE `importOrderLines` call that also carries the global discount (see the header comment);
 *  - `'client'`: pending = ordered − invoiced read from the order lines (no draft subtraction),
 *    one `POST {invoiceSpec}/lines` per selected line built by `buildOrderInvoiceLineBody`, then a
 *    header `etgoTotalDiscount` PATCH from the browser when the carry applies. Purchases stay here
 *    until QA decides whether drafts count as pending (MCP-2); known consequence: the totals show
 *    a mix for a few seconds after the import (QA UI-1). Flipping purchases to `'server'` is this
 *    one line.
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

const actionUrl = (base, config, invoiceId, action) =>
  `${base}/${config.invoiceSpec}/header/${invoiceId}/action/${action}`;

const rowsOf = async (res) => (await res.json())?.response?.data || [];

/**
 * ETP-5828 — the longest `availableOrders` page the popup asks for (the server's maximum on a
 * sales invoice). The old read took at most 500 orders of the WHOLE company, so a customer's older
 * orders vanished once the company passed 500; the action lists the customer's own pending ones.
 */
export const MAX_LISTED_ORDERS = 1000;

/**
 * ETP-5828 — `availableOrders` / `availableOrderLines` are reads served as POSTs: they never touch
 * the invoice, so the post-action re-read of the record (`refreshVersion`, ETP-5434) is skipped.
 * Every pending query used to re-read the whole invoice once per order.
 */
const readAction = (body) => ({ method: 'POST', body: JSON.stringify(body), refreshVersion: false });

/**
 * ETP-5828 — a failed `availableOrders` / `availableOrderLines` read is NOT "nothing to import":
 * it rejects with this error, carrying the response body, and the popup tells the user
 * (`InvoiceOrderImportModal`, `describeLoadFailure`) while showing what it showed before.
 */
export class OrderImportLoadError extends Error {
  constructor(body) {
    super('orderImportLoadFailed');
    this.name = 'OrderImportLoadError';
    this.body = body;
  }
}

async function loadFailure(res) {
  return new OrderImportLoadError(await res.json().catch(() => null));
}

/**
 * The sentence for a failed order-import read: the server's refusal by its code when it has one,
 * a request that got no answer by its own (already translated) message, otherwise the generic
 * «No se pudieron cargar los documentos».
 */
export function describeLoadFailure(err, ui) {
  const fallback = ui('documentsLoadError');
  if (err instanceof OrderImportLoadError) return translateImportRefusal(err.body, ui, fallback);
  return err?.message || fallback;
}

/**
 * The refusal of the import action in the user's language: its code (`importQuantityExceedsPending`,
 * `globalDiscountConflict`, …) is rendered by `translateImportRefusal`, never the server's English
 * prose; anything it cannot render becomes the generic "Failed to import lines".
 */
async function actionErrorMessage(res, ui) {
  const fallback = ui('failedToImportLines');
  try {
    return translateImportRefusal(await res.json(), ui, fallback);
  } catch {
    return fallback;
  }
}

/**
 * The partner's completed, not fully invoiced orders in the invoice's currency, plus what the
 * global-discount notice needs (`useOrderGlobalDiscountImport`).
 */
export async function fetchOrderDocuments({ apiFetch, config, base, bpId, invoiceId }) {
  const viaServer = config.importVia === 'server';
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    // ETP-5828 — the server path lists through the invoice's own `availableOrders` (the customer's
    // completed orders in the invoice's currency with something pending, drafts counted); the
    // client path keeps reading the order list and filtering it here.
    viaServer
      ? apiFetch(actionUrl(base, config, invoiceId, 'availableOrders'), readAction({ limit: MAX_LISTED_ORDERS }))
      : apiFetch(`${base}/${config.orderSpec}/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
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

  let documents = [];
  let excludedByCurrency = false;
  if (viaServer && !ordersRes.ok) throw await loadFailure(ordersRes);
  if (ordersRes.ok) {
    ({ documents, excludedByCurrency } = viaServer
      ? await listedOrders({ apiFetch, config, base, bpId, invoiceCurrency, rows: await rowsOf(ordersRes) })
      : filterCandidateOrders(await rowsOf(ordersRes), bpId, invoiceCurrency));
  }
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
 * The client path's candidates: the partner's completed, not fully invoiced orders, those in the
 * invoice's currency kept (`excludedByCurrency` when that empties a non-empty list).
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
 * The server path's documents: the `availableOrders` rows, in the shape the popup reads
 * (`orderDate`, `etgoTotalDiscount`). Only when that list is EMPTY is the partner's order list read
 * (server-filtered by partner and status), so the popup still tells "no orders in this currency"
 * apart from "no orders" — and, when the only orders left are entirely held by draft invoices,
 * still lists them for the popup to hide, exactly as it did when it read every order.
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
    return filterCandidateOrders(await rowsOf(res), bpId, invoiceCurrency);
  } catch {
    return { documents: [], excludedByCurrency: false };
  }
}

/**
 * ETP-5828 — the server path's lines: ONE `availableOrderLines` call per order brings every line
 * the popup shows with its pending (drafts counted, this invoice included), price and product, the
 * lines with nothing left included at 0 (`includeCovered`) so the popup still greys them out.
 * It replaced the order lines GET + pending POST pair. Lines in `lineNo` order, as the GET listed.
 */
async function fetchServerOrderLines({ apiFetch, config, base, docId, sharedContext }) {
  const invoiceId = sharedContext?.invoiceId;
  if (!invoiceId) return [];
  const res = await apiFetch(actionUrl(base, config, invoiceId, 'availableOrderLines'),
    readAction({ orderId: docId, includeCovered: true }));
  if (!res.ok) throw await loadFailure(res);
  const rows = [...await rowsOf(res)].sort((a, b) => (Number(a.lineNo) || 0) - (Number(b.lineNo) || 0));
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

/** The order's lines, each capped at what the import still accepts. */
export async function fetchOrderLines({ apiFetch, config, base, docId, sharedContext }) {
  if (config.importVia === 'server') {
    return fetchServerOrderLines({ apiFetch, config, base, docId, sharedContext });
  }
  // The client path never asks the action: its pending is the order line's ordered − invoiced.
  const res = await apiFetch(`${base}/${config.orderSpec}/lines?parentId=${docId}&_startRow=0&_endRow=200`);
  if (!res.ok) return [];
  const lines = await rowsOf(res);
  return lines.map(l => {
    const ordered = Number(l.orderedQuantity) || 0;
    const invoiced = Number(l.invoicedQuantity) || 0;
    return orderLineRow(l, Math.max(0, ordered - invoiced), sharedContext);
  });
}

/**
 * The invoice line the CLIENT import path POSTs for one selected order line (restored as it was
 * before ETP-5828 unified the popup). Price, list price, line discount, tax and UoM come from the
 * order line; the order line FK travels as `salesOrderLine` (the spec's java_qualifier, ETP-5381).
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
  const res = await apiFetch(actionUrl(base, config, invoiceId, 'importOrderLines'), {
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
