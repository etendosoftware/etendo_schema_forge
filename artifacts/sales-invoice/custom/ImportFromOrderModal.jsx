import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useOrderGlobalDiscountImport from '@/windows/custom/shared/useOrderGlobalDiscountImport.jsx';
import { useUI } from '@/i18n';
import { translateImportRefusal } from '@/lib/backendErrors.js';

/**
 * "Añadir desde pedido" on a sales invoice (ETP-6002). The import is ONE call to the invoice's
 * declared `importOrderLines` action — the same one the MCP uses — instead of one line POST per
 * order line, so the window and the agents share one rule:
 * - each order line's quantity goes first to its completed shipment lines not yet invoiced, oldest
 *   first, one INVOICE LINE PER SHIPMENT LINE (an order line shipped in N shipments becomes N
 *   invoice lines, each linked to its shipment); what was ordered and not shipped becomes one line
 *   linked to the order line only;
 * - prices, discount, tax and UoM are copied from the order line server-side, line numbers follow
 *   the invoice's last line, and the order's global discount is carried by the server
 *   (`carryGlobalDiscount`, decided by the same rule the panel shows);
 * - all or nothing: a refusal (e.g. more than pending, a discount conflict) imports no line.
 * The selectable quantity is the action's own pending (`availableOrderLines`: ordered − invoiced −
 * what any draft invoice already holds), so the modal never offers more than the server accepts.
 */
const actionUrl = (base, invoiceId, action) =>
  `${base}/sales-invoice/header/${invoiceId}/action/${action}`;

/**
 * The refusal of the import action in the user's language: its code (`importQuantityExceedsPending`,
 * `globalDiscountConflict`, …) is rendered by `translateImportRefusal`, never the server's English
 * prose; anything it cannot render becomes the generic "Failed to import lines".
 */
const actionErrorMessage = async (res, ui) => {
  const fallback = ui('failedToImportLines');
  try {
    return translateImportRefusal(await res.json(), ui, fallback);
  } catch {
    return fallback;
  }
};

const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    moduleApiFetch(`${base}/sales-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    moduleApiFetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    moduleApiFetch(`${base}/sales-invoice/header/${invoiceId}`),
  ]);

  const alreadyImportedOrderLines = new Set();
  // ETP-5828: the GET already hides the ETGO_DTO global-discount line (InvoiceLineHandler).
  let invoiceHasLines = false;
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invoiceHasLines = invLines.length > 0;
    invLines.forEach(il => { if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine); });
  }

  let invoiceCurrency = null;
  let invoiceGlobalDiscount = null;
  let invoiceHeaderRead = false;
  if (headerRes.ok) {
    const invoiceHeader = (await headerRes.json())?.response?.data?.[0];
    invoiceHeaderRead = !!invoiceHeader;
    invoiceCurrency = invoiceHeader?.currency || null;
    invoiceGlobalDiscount = Number(invoiceHeader?.etgoTotalDiscount) || null;
  }
  // ETP-5828: a failed header or lines GET leaves the invoice % / lines unknown; the shared
  // global-discount rule then offers no carry and never PATCHes the header.
  const invoiceStateKnown = invoiceHeaderRead && invLinesRes.ok;

  let documents = [];
  let excludedByCurrency = false;
  const orderDiscountMap = {};
  if (ordersRes.ok) {
    const all = (await ordersRes.json())?.response?.data || [];
    const candidates = all.filter(o =>
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
};

/** Pending per order line as the import action counts it (drafts included), or null if unread. */
const fetchActionPending = async ({ base, invoiceId, orderId }) => {
  if (!invoiceId) return null;
  try {
    const res = await moduleApiFetch(actionUrl(base, invoiceId, 'availableOrderLines'), {
      method: 'POST', body: JSON.stringify({ orderId }),
    });
    if (!res.ok) return null;
    const rows = (await res.json())?.response?.data || [];
    return new Map(rows.map(r => [r.id, Number(r.pendingQuantity) || 0]));
  } catch {
    return null;
  }
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const [res, actionPending] = await Promise.all([
    moduleApiFetch(`${base}/sales-order/lines?parentId=${docId}&_startRow=0&_endRow=200`),
    fetchActionPending({ base, invoiceId: sharedContext?.invoiceId, orderId: docId }),
  ]);
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  return lines.map(l => {
    const ordered = Number(l.orderedQuantity) || 0;
    const invoiced = Number(l.invoicedQuantity) || 0;
    // The action's pending wins (it counts draft invoices, this one included); a line it does not
    // list has nothing left. Without it, the order line's own ordered − invoiced.
    const pending = actionPending
      ? (actionPending.get(l.id) ?? 0)
      : Math.max(0, ordered - invoiced);
    const unitPrice = Number(l.unitPrice) || 0;
    const alreadyInCurrent = sharedContext.alreadyImportedOrderLines?.has(l.id) || false;
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: pending,
      _unitPrice: unitPrice,
      _lineNetAmount: unitPrice * pending,
      _alreadyImported: alreadyInCurrent || pending <= 0,
    };
  });
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.orderDate,
});

/**
 * Imports the selected lines in ONE `importOrderLines` call, grouped by order in list order.
 * Returns `{ ok, count, afterImportResult }` or `{ ok: false, error }`.
 */
const submitOrderImport = async ({ lines, base, invoiceId, selection, serverCarry, ui }) => {
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
  const res = await moduleApiFetch(actionUrl(base, invoiceId, 'importOrderLines'), {
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
};

export default function ImportFromOrderModal(props) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  // ETP-5828: global-discount carry-over (tag, warning/toggle panel, header PATCH, toast).
  // The server applies the global discount; the browser-side PATCH (afterImport) is not used here.
  const { serverCarry, ...discountProps } =
    useOrderGlobalDiscountImport({ headerEndpoint: 'sales-invoice/header' });
  const globalDiscountProps = { ...discountProps, afterImport: undefined };
  const ui = useUI();
  const submitImport = (args) => submitOrderImport({ ...args, serverCarry, ui });
  return (
    <ImportLinesModal
      {...props}
      titleKey="importFromSalesOrder"
      searchPlaceholderKey="searchSalesOrder"
      emptyMessageKey="noCompletedSalesOrdersForThisCustomer"
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey="noSalesOrdersMatchCurrency"
      successMessageKey="linesImportedFromSalesOrder"
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      submitImport={submitImport}
      {...globalDiscountProps}
    />
  );
}
