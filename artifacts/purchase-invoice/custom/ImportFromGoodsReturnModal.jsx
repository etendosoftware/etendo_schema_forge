import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines, newestCreatedFirst } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { pricingContextOf } from '@/windows/custom/shared/invoiceImportPricing.js';

/**
 * Import invoice lines from a completed Return to Vendor Shipment (Albarán de
 * Devolución de Compra). Available only for RECTIFICATIVA-subtype purchase
 * invoices — enforced at the call site (see PurchaseInvoiceBottomPanel.jsx).
 *
 * Return-to-vendor shipments are ShipmentInOut records (M_InOut) — the same
 * table used by goods-receipt, differentiated only by the linked document
 * type's return flag (see ReturnToVendorShipmentHeaderHandler,
 * com.etendoerp.go). Return lines therefore live in M_InOutLine, the same
 * table as goods-receipt lines, so the already-imported check reuses the
 * purchase-invoice line's `goodsShipmentLine` (M_InOutLine_ID) field — same
 * column ImportFromGoodsReceiptModal uses for regular receipts; IDs from the
 * two sources never collide.
 *
 * Return-to-vendor-shipment lines carry no pricing and no linked purchase-
 * order-line (unlike a regular goods receipt), so pricing is resolved purely
 * through the purchase-invoice lines callout cascade (same pattern as
 * ImportFromGoodsReceiptModal) on expand (the row total) and again at import, with no order-level
 * discount to carry over.
 *
 * Per ETP-4737 acceptance criteria ("Importe total según origen"): a
 * rectificative invoice generated from a return must always carry a NEGATIVE
 * invoiced quantity/total (mirrors sales-invoice's ImportFromReturnShipmentModal
 * for its ARI_RM case) — this is enforced client-side here for the preview/
 * totals to read correctly, matching the negative-total guarantee the backend
 * already enforces for this flow.
 *
 * ETP-6099: the candidates and their lines come from the invoice's own
 * `availableReturns` / `availableReturnLines` actions (com.etendoerp.go),
 * which apply the partner, status and not-invoiced-in-full rules and flag the
 * lines this invoice already holds (`blockedReason: importedHere`). No
 * currency is compared on this side, so `excludedByCurrency` is always false.
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

/**
 * ETP-6099 — ONE `availableReturns` read of the invoice lists the supplier's completed returns not
 * invoiced in full (server filtered), the covered ones too at `pendingLines: 0`
 * (`includeCovered`), which the popup hides (`isReturnCovered`); `detail` adds `sourceDocumentNo`.
 * Rejects with `ImportLoadError` on a refusal; the component shows `describeLoadFailure`.
 */
const fetchDocuments = async ({ base, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', targetId: invoiceId,
    action: 'availableReturns', params: { includeCovered: true, detail: true },
  });
  // Newest created first, as the old `_sortBy=creationDate desc` read listed them.
  const documents = newestCreatedFirst(rows).map(r => ({ ...r, movementDate: r.date, sourceReceiptDocNo: r.sourceDocumentNo || '' }));
  return { documents, sharedContext: { invoiceId }, excludedByCurrency: false };
};

/**
 * One `availableReturnLines` row in the shape the popup reads: a line this invoice already holds
 * (`importedHere`) is greyed and shows its returned quantity, as before.
 * Otherwise it offers what the server says is left to credit (positive; the import negates it).
 * The price (callout, `priceData`) feeds the row total.
 */
const returnLineRow = (r, priceData = {}) => {
  const pending = Number(r.pendingQuantity) || 0;
  const blocked = !!r.blockedReason || pending <= 0;
  return {
    ...r,
    salesOrderLine: r.orderLine ?? null,
    _productName: r['product$_identifier'] || r.id,
    _maxQty: blocked ? Math.abs(Number(r.movementQuantity) || 0) : pending,
    _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
    _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
    _tax: priceData.tax || null,
    _uOM: priceData.uOM || r.uOM || null,
    _alreadyImported: blocked,
    _orderDiscount: 0,
  };
};

/** ONE `availableReturnLines` read per return, lines with nothing left included. */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await listLines({
    apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', targetId: sharedContext?.invoiceId,
    action: 'availableReturnLines', params: { returnId: docId, includeCovered: true, detail: true },
  });
  // The row total shown once a return without a source number is expanded is the sum of its
  // priced lines, as before: the callout prices each line here, on expand (never on open).
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', sharedContext });
  return Promise.all(rows.map(async (r) => {
    const qty = Math.abs(Number(r.movementQuantity)) || 1;
    const priceData = r.product
      ? await resolveLinePrice(base, r.product, qty, invoiceHeader, productAuxMap[r.product] || {})
      : {};
    return returnLineRow(r, priceData);
  }));
};

/** A return with nothing left to credit is not listed (it used to be hidden once its lines loaded). */
const isReturnCovered = (doc) => Number(doc.pendingLines) === 0;

const getDocDisplay = (doc) => {
  const sourceRef = doc.sourceReceiptDocNo || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: sourceRef ? `#${sourceRef}` : '',
  };
};

// The price callout runs here, per selected line at IMPORT time (never on open).
const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base }) => {
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'purchase-invoice', sharedContext });
  const priceData = await resolveLinePrice(base, line.product, qty, invoiceHeader, productAuxMap[line.product] || {});
  const calloutGrossUnitPrice = Number(priceData.grossUnitPrice) || 0;
  const calloutUnitPrice = Number(priceData.unitPrice) || calloutGrossUnitPrice || Number(line._unitPrice) || 0;
  const listPrice = Number(priceData.listPrice) || calloutUnitPrice;
  const unitPrice = calloutUnitPrice;

  // A rectificative invoice generated from a return must carry a NEGATIVE
  // invoiced quantity — Etendo rejects positive ones at completion (mirrors
  // sales-invoice's ARI_RM handling in ImportFromReturnShipmentModal).
  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;

  const grossUnitPrice = (calloutGrossUnitPrice && calloutUnitPrice)
    ? calloutGrossUnitPrice * (unitPrice / calloutUnitPrice)
    : calloutGrossUnitPrice;

  const tax = priceData.tax || line._tax || null;
  const uOM = priceData.uOM || line._uOM || line.uOM || null;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    lineNetAmount,
    etgoDiscount: 0,
    tax,
    uOM,
    lineNo,
    goodsShipmentLine: line.id,
  };
};

export default function ImportFromGoodsReturnModal(props) {
  // ETP-6099 — a failed read is not «nothing to import»: tell the user, show an empty list.
  const handlers = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="purchase-invoice/lines"
      titleKey="importFromGoodsReturn"
      searchPlaceholderKey="searchGoodsReturn"
      emptyMessageKey="noPendingGoodsReturnsForSupplier"
      noSearchResultsKey="noGoodsReturnsMatchYourSearch"
      successMessageKey="linesImportedFromGoodsReturn"
      showPriceColumns={false}
      eagerLoadLines={false}
      isDocumentCovered={isReturnCovered}
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
