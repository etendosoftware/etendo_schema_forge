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
 * The import is ONE call to the invoice's declared `importOrderLines` action — the same one the
 * MCP uses — never one line POST per order line, so the window and the agents share one rule (both
 * directions since ETP-5828 QA MCP-2: purchases imported line by line from the browser and listed
 * without the draft deduction, so their popup offered lines another draft invoice already held):
 * - each order line's quantity goes first to its completed shipment/receipt lines not yet
 *   invoiced, oldest first, one INVOICE LINE PER SHIPMENT LINE; what was ordered and not delivered
 *   becomes one line linked to the order line only;
 * - prices, discount, tax and UoM are copied from the order line server-side, line numbers follow
 *   the invoice's last line, and the order's global discount is carried by the server
 *   (`carryGlobalDiscount`, decided by the same rule the notice shows) in the same transaction, so
 *   the totals are right the moment the popup closes;
 * - all or nothing: a refusal (e.g. more than pending, a discount conflict) imports no line.
 * The selectable quantity is the action's own pending (`availableOrderLines`: ordered − invoiced −
 * what any draft invoice already holds), so the popup never offers more than the server accepts.
 * ETP-5828 (speed): it also LISTS through the invoice's actions — `availableOrders` for the orders
 * and one `availableOrderLines` per order for the lines, price and pending — instead of the
 * company-wide order list and two requests per order, and neither read re-reads the invoice.
 */

/**
 * Per-direction configuration: the specs it reads and the i18n keys it shows. Both directions list
 * through the invoice's `availableOrders` / `availableOrderLines` and import with ONE
 * `importOrderLines` call that also carries the global discount (see the header comment).
 */
export const INVOICE_ORDER_IMPORT = Object.freeze({
  sales: Object.freeze({
    invoiceSpec: 'sales-invoice',
    orderSpec: 'sales-order',
    titleKey: 'importFromSalesOrder',
    searchPlaceholderKey: 'searchSalesOrder',
    emptyMessageKey: 'noCompletedSalesOrdersForThisCustomer',
    noCurrencyMatchMessageKey: 'noSalesOrdersMatchCurrency',
    successMessageKey: 'linesImportedFromSalesOrder',
  }),
  purchase: Object.freeze({
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
    // and with the same rule since ETP-5828 QA MCP-2. `listAll` reads every page (follows
    // nextOffset while hasMore) and rejects with OrderImportLoadError on a refusal.
    // `includeCovered` also brings the orders with nothing left (also those entirely held by draft
    // invoices), at pendingLines 0, for the popup to hide (`isOrderCovered`) without reading their
    // lines.
    // Both directions ask `detail`: it brings the row's `creationDate` (purchases listed newest
    // CREATED first, their action answers newest by order date) and makes `pendingLines` / `amount`
    // count only the lines the popup leaves selectable — not those already on THIS invoice
    // (`_alreadyImported`). Pending is quantity-based, so without it a sales order whose remaining
    // lines are all on this invoice was listed and only emptied once expanded (the lines load
    // lazily, ETP-6099); with it, it comes at pendingLines 0 and `isOrderCovered` hides it at open.
    listAll({
      apiFetch, base, spec: config.invoiceSpec, targetId: invoiceId, action: 'availableOrders',
      params: { includeCovered: true, detail: true },
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
 * `availableOrderLines` call per order brings every line the popup shows with its pending (drafts
 * counted, this invoice included), price and product, the lines with nothing left included at 0
 * (`includeCovered`) so the popup still greys them out, and the OTHER drafts holding each line
 * (`inDraftInvoices`, QA UI-4). Lines in `lineNo` order.
 */
export async function fetchOrderLines({ apiFetch, config, base, docId, sharedContext }) {
  const invoiceId = sharedContext?.invoiceId;
  if (!invoiceId) return [];
  const rows = await listLines({
    apiFetch, base, spec: config.invoiceSpec, targetId: invoiceId, action: 'availableOrderLines',
    params: { orderId: docId, includeCovered: true },
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
    _alreadyInCurrent: alreadyInCurrent,
    _inDraftInvoices: (l.inDraftInvoices || []).map(d => d.documentNo || d.id),
    // What the OTHER drafts hold of the line, summed (magnitude): the note of a line they hold
    // only partly (QA OBS-2). Missing on an older backend, which sends no per-draft quantity.
    _heldByDrafts: (l.inDraftInvoices || []).reduce((sum, d) => sum + Math.abs(Number(d.quantity) || 0), 0),
  };
}

/**
 * ETP-5828 — what an order line says under its product. `ui` and the quantity formatter
 * `fmtQty` are injected (pure).
 * - Greyed out (QA UI-4): the draft invoice(s) holding it when nothing is left because OTHER
 *   drafts took it («en factura borrador FV1000002»); «ya importado» when it is on THIS invoice or
 *   fully invoiced.
 * - Still selectable but partly held by other drafts (QA OBS-2): how much they hold and where
 *   («1 en factura borrador FC1000020»); nothing when no other draft holds it, or when an older
 *   backend sends no per-draft quantity.
 */
export function orderLineNote(line, { imported }, ui, fmtQty = String) {
  const drafts = line?._inDraftInvoices || [];
  if (imported) {
    if (line?._alreadyInCurrent || drafts.length === 0) return ui('alreadyImported');
    return drafts.length === 1
      ? ui('inDraftInvoiceOne', { documentNo: drafts[0] })
      : ui('inDraftInvoiceMany', { documentNos: drafts.join(', ') });
  }
  const held = Number(line?._heldByDrafts) || 0;
  if (drafts.length === 0 || held <= 0) return null;
  const quantity = fmtQty(held);
  return drafts.length === 1
    ? ui('partlyInDraftInvoiceOne', { quantity, documentNo: drafts[0] })
    : ui('partlyInDraftInvoiceMany', { quantity, documentNos: drafts.join(', ') });
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
