import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines, newestCreatedFirst } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { pricingContextOf } from '@/windows/custom/shared/invoiceImportPricing.js';

/**
 * Goods receipt lines don't carry pricing — unit price, tax, and uOM are
 * resolved through the purchase-invoice lines callout cascade (same pattern as
 * ImportFromShipmentModal on the sales side), at IMPORT time only (ETP-6099:
 * opening the popup reads the invoice's availableReceipts action, nothing else).
 */

const resolveLinePrice = async (base, productId, qty, invoiceHeader, auxData = {}) => {
  const formState = {
    ...invoiceHeader,
    ...auxData,
    product: productId,
    invoicedQuantity: qty || 1,
  };
  try {
    const auxiliaryValues = {};
    for (const [k, v] of Object.entries(formState)) {
      if (/^[a-zA-Z]+_[A-Z]{2,5}$/.test(k) && v != null && v !== '') {
        auxiliaryValues[k] = String(v);
      }
    }
    const res = await moduleApiFetch(`${base}/purchase-invoice/lines/callout`, {
      method: 'POST',
      
      body: JSON.stringify({
        field: 'product', value: productId, formState,
        ...(Object.keys(auxiliaryValues).length > 0 ? { auxiliaryValues } : {}),
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const result = {};
    if (data.updates) {
      for (const [k, entry] of Object.entries(data.updates)) result[k] = entry.value;
    }
    if (data.combos) {
      for (const [k, combo] of Object.entries(data.combos)) {
        if (combo.selected != null) result[k] = combo.selected;
      }
    }
    if (Number(result.standardPrice) && !Number(result.listPrice)) {
      result.listPrice = result.standardPrice;
    }
    const unitPrice = Number(result.unitPrice) || Number(result.grossUnitPrice) || 0;
    if (unitPrice) result.unitPrice = unitPrice;

    if (unitPrice) {
      const cascadeState = { ...formState, ...result, invoicedQuantity: qty || 1 };
      const cascadeRes = await moduleApiFetch(`${base}/purchase-invoice/lines/callout`, {
        method: 'POST',
        
        body: JSON.stringify({ field: 'PriceActual', value: String(unitPrice), formState: cascadeState }),
      });
      if (cascadeRes.ok) {
        const cascadeData = await cascadeRes.json();
        if (cascadeData.updates) {
          for (const [k, entry] of Object.entries(cascadeData.updates)) result[k] = entry.value;
        }
        if (cascadeData.combos) {
          for (const [k, combo] of Object.entries(cascadeData.combos)) {
            if (combo.selected != null && !(k in result)) result[k] = combo.selected;
          }
        }
      }
    }
    return result;
  } catch {
    return {};
  }
};

/** The pending rule of both reads: the one before ETP-6099 (see `fetchDocuments`). */
const CLASSIC_PENDING = Object.freeze({ pendingBasis: 'classic' });

/**
 * Whether the empty list is empty because of the currency — the old popup's rule, which the
 * classic `availableReceipts` also applies: a receipt has no currency of its own that counts, its
 * backing purchase ORDER's does. Among the supplier's completed, not invoiced receipts, the list is
 * «emptied by currency» when there is at least one and none survives the filter: a receipt without
 * an order is never excluded (so it never counts as other-currency), one whose order is in another
 * currency (or could not be read, as before) is. Only asked when `availableReceipts` lists nothing,
 * so the popup still tells «no receipts in this currency» apart from «no receipts».
 */
const receiptsInOtherCurrency = async (base, invoiceId, bpId) => {
  try {
    const headerRes = await moduleApiFetch(`${base}/purchase-invoice/header/${invoiceId}`);
    if (!headerRes.ok) return false;
    const currency = (await headerRes.json())?.response?.data?.[0]?.currency;
    if (!currency || !bpId) return false;
    const criteria = encodeURIComponent(JSON.stringify([
      { fieldName: 'businessPartner', operator: 'equals', value: bpId },
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
    ]));
    const res = await moduleApiFetch(`${base}/goods-receipt/goodsReceipt?criteria=${criteria}&_startRow=0&_endRow=500&_sortBy=creationDate desc`);
    if (!res.ok) return false;
    const candidates = ((await res.json())?.response?.data || []).filter(r =>
      r.documentStatus === 'CO' && r.businessPartner === bpId && r.invoiced !== true);
    if (candidates.length === 0 || candidates.some(r => !r.salesOrder)) return false;
    const orderIds = [...new Set(candidates.map(r => r.salesOrder))];
    const orderCurrencies = await Promise.all(orderIds.map(async (id) => {
      try {
        const r = await moduleApiFetch(`${base}/purchase-order/header/${id}`);
        return r.ok ? (await r.json())?.response?.data?.[0]?.currency ?? null : null;
      } catch {
        return null;
      }
    }));
    return orderCurrencies.every(c => c !== currency);
  } catch {
    return false;
  }
};

/**
 * ETP-6099 — ONE `availableReceipts` read of the invoice lists the supplier's completed goods receipts
 * in the invoice's currency (server filtered), the covered ones too at `pendingLines: 0`
 * (`includeCovered`), which the popup hides (`isReceiptCovered`); `detail` adds `orderDocumentNo`.
 * `pendingBasis: 'classic'` (product decision) keeps the pending rule the popup had before it read
 * the action: a receipt line is pending at its full movement quantity unless THIS invoice already
 * holds it — no draft deduction, and a receipt invoiced elsewhere is listed again.
 * Rejects with `ImportLoadError` on a refusal; the component shows
 * `describeLoadFailure`.
 */
const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', targetId: invoiceId,
    action: 'availableReceipts', params: { ...CLASSIC_PENDING, includeCovered: true, detail: true },
  });
  // Newest created first, as the old `_sortBy=creationDate desc` read listed them.
  const documents = newestCreatedFirst(rows).map(r => ({ ...r, movementDate: r.date }));
  const excludedByCurrency = documents.length === 0 && await receiptsInOtherCurrency(base, invoiceId, bpId);
  return { documents, sharedContext: { invoiceId }, excludedByCurrency };
};

/**
 * One `availableReceiptLines` row in the shape the popup reads. A line already on this invoice is
 * greyed (and shows its received quantity, as before); otherwise it offers what the server says is
 * left — under `pendingBasis: 'classic'` its full movement quantity, as before. The order line's
 * discount travels to the import;
 * the price (callout, `priceData`) feeds the row total.
 */
const receiptLineRow = (r, priceData = {}) => {
  const pending = Number(r.pendingQuantity) || 0;
  const imported = !!r.importedHere || pending === 0;
  return {
    ...r,
    salesOrderLine: r.orderLine ?? null,
    _productName: r['product$_identifier'] || r.id,
    _maxQty: imported ? (Number(r.movementQuantity) || 0) : pending,
    _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
    _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
    _tax: priceData.tax || null,
    _uOM: priceData.uOM || r.uOM || null,
    _alreadyImported: imported,
    _orderDiscount: Number(r.orderLineDiscount) || 0,
  };
};

/** ONE `availableReceiptLines` read per goods receipt, lines with nothing left included. */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await listLines({
    apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', targetId: sharedContext?.invoiceId,
    action: 'availableReceiptLines', params: { ...CLASSIC_PENDING, receiptId: docId, includeCovered: true, detail: true },
  });
  // The row total the popup shows once a document is expanded is the sum of its priced lines,
  // as before: the callout prices each line here, on expand (never on open).
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', sharedContext });
  return Promise.all(rows.map(async (r) => {
    const qty = Number(r.movementQuantity) || 1;
    const priceData = r.product
      ? await resolveLinePrice(base, r.product, qty, invoiceHeader, productAuxMap[r.product] || {})
      : {};
    return receiptLineRow(r, priceData);
  }));
};

/** A goods receipt with nothing left to import is not listed (it used to be hidden once its lines loaded). */
const isReceiptCovered = (doc) => Number(doc.pendingLines) === 0;

const getDocDisplay = (doc) => {
  const orderRef = doc.orderDocumentNo || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: orderRef ? `#${orderRef}` : '',
  };
};

// The price callout runs here, per selected line at IMPORT time (never on open).
const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base }) => {
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', sharedContext });
  const priceData = await resolveLinePrice(base, line.product, qty, invoiceHeader, productAuxMap[line.product] || {});
  const calloutGrossUnitPrice = Number(priceData.grossUnitPrice) || 0;
  const calloutUnitPrice = Number(priceData.unitPrice) || calloutGrossUnitPrice || Number(line._unitPrice) || 0;
  const listPrice = Number(priceData.listPrice) || calloutUnitPrice;

  const orderDiscount = Number(line._orderDiscount) || 0;
  const unitPrice = orderDiscount > 0 ? listPrice * (1 - orderDiscount / 100) : calloutUnitPrice;
  const lineNetAmount = qty * unitPrice;

  const grossUnitPrice = (calloutGrossUnitPrice && calloutUnitPrice)
    ? calloutGrossUnitPrice * (unitPrice / calloutUnitPrice)
    : calloutGrossUnitPrice;

  const tax = priceData.tax || line._tax || null;
  const uOM = priceData.uOM || line._uOM || line.uOM || null;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: qty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    lineNetAmount,
    etgoDiscount: orderDiscount,
    tax,
    uOM,
    lineNo,
    goodsShipmentLine: line.id,
    salesOrderLine: line.salesOrderLine || null,
  };
};

export default function ImportFromGoodsReceiptModal(props) {
  // ETP-6099 — a failed read is not «nothing to import»: tell the user, show an empty list.
  const handlers = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="purchase-invoice/lines"
      titleKey="importFromGoodsReceipt"
      searchPlaceholderKey="searchGoodsReceipt"
      emptyMessageKey="noPendingGoodsReceiptsForSupplier"
      noSearchResultsKey="noGoodsReceiptsMatchYourSearch"
      noCurrencyMatchMessageKey="noGoodsReceiptsMatchCurrency"
      successMessageKey="linesImportedFromGoodsReceipt"
      showPriceColumns={false}
      eagerLoadLines={false}
      isDocumentCovered={isReceiptCovered}
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
