import { translateImportRefusal } from '../../../lib/backendErrors.js';

/**
 * «Importar desde pedido» on an invoice — the data side of the ONE order-import popup shared by
 * sales and purchase invoices (ETP-6002, unified in ETP-5828). Pure functions over an injected
 * `apiFetch`, so the component hands in its `useApiFetch('')` and a plain `node --test` hands in a
 * stub. Nothing here is direction-specific beyond the `INVOICE_ORDER_IMPORT` entry it is given.
 *
 * The import is ONE call to the invoice's declared `importOrderLines` action — the same one the
 * MCP uses — never one line POST per order line, so the window and the agents share one rule:
 * - each order line's quantity goes first to its completed shipment/receipt lines not yet
 *   invoiced, oldest first, one INVOICE LINE PER SHIPMENT LINE; what was ordered and not delivered
 *   becomes one line linked to the order line only;
 * - prices, discount, tax and UoM are copied from the order line server-side, line numbers follow
 *   the invoice's last line, and the order's global discount is carried by the server
 *   (`carryGlobalDiscount`, decided by the same rule the notice shows) in the same transaction, so
 *   the totals are right the moment the popup closes (QA UI-1 on purchases: lines created from the
 *   browser and the header % PATCHed afterwards showed mixed totals for a few seconds);
 * - all or nothing: a refusal (e.g. more than pending, a discount conflict) imports no line.
 * The selectable quantity is the action's own pending (`availableOrderLines`: ordered − invoiced −
 * what any draft invoice already holds), so the popup never offers more than the server accepts.
 */

/** Per-direction configuration: the specs it reads and the i18n keys it shows. */
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

const actionUrl = (base, config, invoiceId, action) =>
  `${base}/${config.invoiceSpec}/header/${invoiceId}/action/${action}`;

const rowsOf = async (res) => (await res.json())?.response?.data || [];

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
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    apiFetch(`${base}/${config.orderSpec}/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
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
  const orderDiscountMap = {};
  if (ordersRes.ok) {
    const candidates = (await rowsOf(ordersRes)).filter(o =>
      o.documentStatus === 'CO'
      && o.businessPartner === bpId
      && Number(o.invoiceStatus ?? 0) < 100
    );
    documents = invoiceCurrency ? candidates.filter(o => o.currency === invoiceCurrency) : candidates;
    excludedByCurrency = !!invoiceCurrency && documents.length === 0 && candidates.length > 0;
    documents.forEach(o => {
      if (o.etgoTotalDiscount) orderDiscountMap[o.id] = Number(o.etgoTotalDiscount);
    });
  }
  return {
    documents,
    sharedContext: {
      alreadyImportedOrderLines, orderDiscountMap, invoiceGlobalDiscount, invoiceHasLines, invoiceStateKnown,
      invoiceId,
    },
    excludedByCurrency,
  };
}

/** Pending per order line as the import action counts it (drafts included), or null if unread. */
async function fetchActionPending({ apiFetch, config, base, invoiceId, orderId }) {
  if (!invoiceId) return null;
  try {
    const res = await apiFetch(actionUrl(base, config, invoiceId, 'availableOrderLines'), {
      method: 'POST', body: JSON.stringify({ orderId }),
    });
    if (!res.ok) return null;
    const rows = await rowsOf(res);
    return new Map(rows.map(r => [r.id, Number(r.pendingQuantity) || 0]));
  } catch {
    return null;
  }
}

/** The order's lines, each capped at what the import action still accepts. */
export async function fetchOrderLines({ apiFetch, config, base, docId, sharedContext }) {
  const [res, actionPending] = await Promise.all([
    apiFetch(`${base}/${config.orderSpec}/lines?parentId=${docId}&_startRow=0&_endRow=200`),
    fetchActionPending({ apiFetch, config, base, invoiceId: sharedContext?.invoiceId, orderId: docId }),
  ]);
  if (!res.ok) return [];
  const lines = await rowsOf(res);
  return lines.map(l => {
    const ordered = Number(l.orderedQuantity) || 0;
    const invoiced = Number(l.invoicedQuantity) || 0;
    // The action's pending wins (it counts draft invoices, this one included); a line it does not
    // list has nothing left. Without it, the order line's own ordered − invoiced.
    const pending = actionPending
      ? (actionPending.get(l.id) ?? 0)
      : Math.max(0, ordered - invoiced);
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
  });
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
  return { ok: true, count: data?.importedCount, afterImportResult: carry.afterImportResult };
}
