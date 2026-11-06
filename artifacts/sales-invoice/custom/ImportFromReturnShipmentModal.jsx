import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines, newestCreatedFirst } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { pricingContextOf } from '@/windows/custom/shared/invoiceImportPricing.js';

/**
 * Import invoice lines from a completed sales Return Material Receipt
 * (Recibo de Devolución de Venta). Available only for Factura de Devolución
 * (DEV subtype) — enforced at the call site.
 *
 * ETP-4459: the "Return from Customer" (Order-based RMA authorization) window
 * was removed from the menu as part of ETP-4362 and replaced by a simpler
 * flow: a Return Material Receipt is created directly from a completed Goods
 * Shipment (see GoodsShipmentHeaderHandler#createReturn /
 * CreateReturnReceiptHandler in com.etendoerp.go). Return receipts are
 * M_InOut records — same table as goods-shipment — differentiated only by
 * documentType.return=true (goods-shipment's own tab filters
 * documentType.return=false, so it structurally excludes them; the
 * "return-material-receipt" spec's tab is the exact structural complement:
 * `e.movementType IN ('C-','C+') and e.documentType.return=true`). This
 * modal now sources from that already-alive return-material-receipt spec.
 *
 * Return receipt lines carry no pricing (same as goods-shipment lines), so
 * pricing is resolved through the same callout cascade used by
 * ImportFromShipmentModal (SL_Invoice_Product → PriceActual →
 * SL_Invoice_Amt) on expand (the row total) and again per
 * selected line at import. Unlike a normal shipment import,
 * ARI_RM (return invoice) lines must carry a NEGATIVE invoiced quantity —
 * Etendo rejects positive ones at completion.
 *
 * ETP-6099: the candidates and their lines come from the invoice's own
 * `availableReturns` / `availableReturnLines` actions (com.etendoerp.go,
 * ImportInOutLinesIntoInvoiceHandler), which apply what this modal used to
 * compute client-side (ETP-4459): the quantity left per return line after
 * every invoice line linked to it (partial import), the conservative
 * order-line block (`blockedReason: orderLineInvoiced`), the
 * not-invoiced-in-full and same-currency document rules. Opening the popup
 * is one list read; each expanded return one lines read.
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
    const res = await moduleApiFetch(`${base}/sales-invoice/lines/callout`, {
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
    // SL_Invoice_Product returns the catalog price as standardPrice (PriceStd) and
    // zeros out listPrice — apply the same fallback that DetailView uses.
    if (Number(result.standardPrice) && !Number(result.listPrice)) {
      result.listPrice = result.standardPrice;
    }
    let unitPrice = Number(result.unitPrice) || Number(result.grossUnitPrice) || 0;
    if (unitPrice) result.unitPrice = unitPrice;

    if (unitPrice) {
      const cascadeState = { ...formState, ...result, invoicedQuantity: qty || 1 };
      const cascadeRes = await moduleApiFetch(`${base}/sales-invoice/lines/callout`, {
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
 * ETP-6099 — ONE `availableReturns` read of the invoice lists the customer's completed returns not
 * invoiced in full and in the invoice's currency when the return has a sales order (server filtered), the covered ones too at `pendingLines: 0`
 * (`includeCovered`), which the popup hides (`isReturnCovered`); `detail` adds `sourceDocumentNo`.
 * Rejects with `ImportLoadError` on a refusal; the component shows `describeLoadFailure`.
 */
const fetchDocuments = async ({ base, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: 'sales-invoice', targetId: invoiceId,
    action: 'availableReturns', params: { includeCovered: true, detail: true },
  });
  // Newest created first, as the old `_sortBy=creationDate desc` read listed them.
  const documents = newestCreatedFirst(rows).map(r => ({ ...r, movementDate: r.date, sourceShipmentDocNo: r.sourceDocumentNo || '' }));
  return { documents, sharedContext: { invoiceId }, excludedByCurrency: false };
};

/**
 * One `availableReturnLines` row in the shape the popup reads: a line whose order line is already invoiced
 * (`orderLineInvoiced`) or that is credited in full (`creditedInFull`) is greyed at 0.
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
    _maxQty: blocked ? 0 : pending,
    _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
    _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
    _tax: priceData.tax || null,
    _uOM: priceData.uOM || r.uOM || null,
    _alreadyImported: blocked,
    _orderDiscount: Number(r.orderLineDiscount) || 0,
  };
};

/** ONE `availableReturnLines` read per return, lines with nothing left included. */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await listLines({
    apiFetch: moduleApiFetch, base, spec: 'sales-invoice', targetId: sharedContext?.invoiceId,
    action: 'availableReturnLines', params: { returnId: docId, includeCovered: true, detail: true },
  });
  // The row total shown once a return without a source number is expanded is the sum of its
  // priced lines, as before: the callout prices each line here, on expand (never on open).
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'sales-invoice', sharedContext });
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
  const sourceRef = doc.sourceShipmentDocNo || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: sourceRef ? `#${sourceRef}` : '',
  };
};

// The price callout runs here, per selected line at IMPORT time (never on open).
const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base }) => {
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'sales-invoice', sharedContext });
  // Re-resolve price for the actual import qty so lineNetAmount is correct.
  const priceData = await resolveLinePrice(base, line.product, qty, invoiceHeader, productAuxMap[line.product] || {});
  const calloutGrossUnitPrice = Number(priceData.grossUnitPrice) || 0;
  const calloutUnitPrice = Number(priceData.unitPrice) || calloutGrossUnitPrice || Number(line._unitPrice) || 0;
  // listPrice is the catalog price before any discount.
  const listPrice = Number(priceData.listPrice) || calloutUnitPrice;

  // Carry the discount from the original sales order line (etgoDiscount on invoice).
  const orderDiscount = Number(line._orderDiscount) || 0;
  // Apply the discount to derive the actual unit price.
  const unitPrice = orderDiscount > 0 ? listPrice * (1 - orderDiscount / 100) : calloutUnitPrice;

  // ARI_RM (return invoice) lines must have negative quantities — Etendo rejects positive ones at completion.
  const negQty = -Math.abs(qty);
  const lineNetAmount = negQty * unitPrice;

  // Scale grossUnitPrice by the same discount factor so the tax-inclusive price
  // stays consistent. If the callout didn't return one, omit it.
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
    etgoDiscount: orderDiscount,
    tax,
    uOM,
    lineNo,
    goodsShipmentLine: line.id,
    salesOrderLine: line.salesOrderLine || null,
  };
};

export default function ImportFromReturnShipmentModal(props) {
  // ETP-6099 — a failed read is not «nothing to import»: tell the user, show an empty list.
  const handlers = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromReturnShipment"
      searchPlaceholderKey="searchReturnShipment"
      emptyMessageKey="noReturnShipmentsForCustomer"
      noSearchResultsKey="noReturnShipmentsMatchSearch"
      noCurrencyMatchMessageKey="noReturnShipmentsMatchCurrency"
      successMessageKey="linesImportedFromReturnShipment"
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
