import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import { listAll, listLines, newestCreatedFirst } from '@/windows/custom/shared/importActionClient.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { pricingContextOf } from '@/windows/custom/shared/invoiceImportPricing.js';

/**
 * Shipment lines don't carry pricing — we resolve unit price, tax, and uOM
 * through the same callout cascade used by manual line entry
 * (SL_Invoice_Product → PriceActual → SL_Invoice_Amt). The shipment line's
 * underlying salesOrderLine ID is preserved so duplicate imports — either
 * directly via the shipment or via the same order — are detected.
 *
 * Pricing correctness: SL_Invoice_Product reads inpmProductId_PSTD and
 * inpmProductId_PLIST from auxiliaryValues to resolve prices — it does NOT
 * query M_ProductPrice on its own. The selector must be fetched with the
 * invoice's priceList context so ProductPriceSelectorPolicy enriches each
 * product item with the correct _PSTD / _PLIST from that price list. The
 * regex allows suffixes up to 5 chars so _PLIST (5) passes alongside the
 * already-covered _PSTD / _CURR / _UOM.
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
 * Whether the empty list is empty because of the currency: a completed shipment of the customer in
 * another currency, not invoiced in full, exists. Only asked when `availableShipments` lists
 * nothing, so the popup still tells «no shipments in this currency» apart from «no shipments».
 */
const shipmentsInOtherCurrency = async (base, invoiceId, bpId) => {
  try {
    const headerRes = await moduleApiFetch(`${base}/sales-invoice/header/${invoiceId}`);
    if (!headerRes.ok) return false;
    const currency = (await headerRes.json())?.response?.data?.[0]?.currency;
    if (!currency || !bpId) return false;
    const criteria = encodeURIComponent(JSON.stringify([
      { fieldName: 'businessPartner', operator: 'equals', value: bpId },
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
      { fieldName: 'etgoCurrency', operator: 'notEqual', value: currency },
    ]));
    const res = await moduleApiFetch(`${base}/goods-shipment/goodsShipment?criteria=${criteria}&_startRow=0&_endRow=50`);
    if (!res.ok) return false;
    const others = (await res.json())?.response?.data || [];
    return others.some(s => s.invoiced !== true && Number(s.invoiceStatus ?? 0) < 100);
  } catch {
    return false;
  }
};

/**
 * ETP-6099 — ONE `availableShipments` read of the invoice lists the customer's completed shipments
 * in the invoice's currency (server filtered), the covered ones too at `pendingLines: 0`
 * (`includeCovered`), which the popup hides (`isShipmentCovered`); `detail` adds `orderDocumentNo`.
 * Rejects with `ImportLoadError` on a refusal; the component shows
 * `describeLoadFailure`.
 */
const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const rows = await listAll({
    apiFetch: moduleApiFetch, base, spec: 'sales-invoice', targetId: invoiceId,
    action: 'availableShipments', params: { includeCovered: true, detail: true },
  });
  // Newest created first, as the old `_sortBy=creationDate desc` read listed them.
  const documents = newestCreatedFirst(rows).map(r => ({ ...r, movementDate: r.date }));
  const excludedByCurrency = documents.length === 0 && await shipmentsInOtherCurrency(base, invoiceId, bpId);
  return { documents, sharedContext: { invoiceId }, excludedByCurrency };
};

/**
 * One `availableShipmentLines` row in the shape the popup reads. A line already on this invoice or
 * on another one is greyed (and shows its shipped quantity, as before); otherwise it offers what
 * the server says is left (draft invoices deducted). The order line's discount travels to the import;
 * the price (callout, `priceData`) feeds the row total.
 */
const shipmentLineRow = (r, priceData = {}) => {
  const pending = Number(r.pendingQuantity) || 0;
  const imported = !!(r.importedHere || r.invoicedElsewhere) || pending === 0;
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

/** ONE `availableShipmentLines` read per shipment, lines with nothing left included. */
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await listLines({
    apiFetch: moduleApiFetch, base, spec: 'sales-invoice', targetId: sharedContext?.invoiceId,
    action: 'availableShipmentLines', params: { shipmentId: docId, includeCovered: true, detail: true },
  });
  // The row total the popup shows once a document is expanded is the sum of its priced lines,
  // as before: the callout prices each line here, on expand (never on open).
  const { invoiceHeader, productAuxMap } = await pricingContextOf({ apiFetch: moduleApiFetch, base, spec: 'sales-invoice', sharedContext });
  return Promise.all(rows.map(async (r) => {
    const qty = Number(r.movementQuantity) || 1;
    const priceData = r.product
      ? await resolveLinePrice(base, r.product, qty, invoiceHeader, productAuxMap[r.product] || {})
      : {};
    return shipmentLineRow(r, priceData);
  }));
};

/** A shipment with nothing left to import is not listed (it used to be hidden once its lines loaded). */
const isShipmentCovered = (doc) => Number(doc.pendingLines) === 0;

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
  const lineNetAmount = qty * unitPrice;

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
    // ETP-5381: the key MUST be the spec's java_qualifier for C_OrderLine_ID. NeoFieldFilter
    // drops any key absent from the spec silently (200, line created, FK NULL), and without
    // C_OrderLine_ID the invoice never reaches C_INVOICE_POST's MatchSO block (no M_MATCHSO row)
    // nor its `UPDATE C_ORDERLINE SET QtyInvoiced` — so the order stays invoiceable forever.
    salesOrderLine: line.salesOrderLine || null,
  };
};

export default function ImportFromShipmentModal(props) {
  // ETP-6099 — a failed read is not «nothing to import»: tell the user, show an empty list.
  const handlers = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromShipment"
      searchPlaceholderKey="searchShipment"
      emptyMessageKey="noPendingShipmentsForCustomer"
      noSearchResultsKey="noShipmentsMatchYourSearch"
      noCurrencyMatchMessageKey="noShipmentsMatchCurrency"
      successMessageKey="linesImportedFromShipment"
      showPriceColumns={false}
      eagerLoadLines={false}
      isDocumentCovered={isShipmentCovered}
      fetchDocuments={handlers.fetchDocuments}
      fetchLines={handlers.fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
