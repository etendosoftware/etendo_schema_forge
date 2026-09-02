import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * ImportFromGoodsReceiptModal) with no order-level discount to carry over.
 *
 * Per ETP-4737 acceptance criteria ("Importe total según origen"): a
 * rectificative invoice generated from a return must always carry a NEGATIVE
 * invoiced quantity/total (mirrors sales-invoice's ImportFromReturnShipmentModal
 * for its ARI_RM case) — this is enforced client-side here for the preview/
 * totals to read correctly, matching the negative-total guarantee the backend
 * already enforces for this flow.
 *
 * The return-to-vendor-shipment header/lines have no currency of their own and
 * no linked purchase order to resolve one through (no `salesOrder` field on
 * the header, unlike goods-receipt) — there is nothing to filter by currency
 * here, so `excludedByCurrency` is always false.
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
    const res = await apiFetch(`${base}/purchase-invoice/lines/callout`, {
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
      const cascadeRes = await apiFetch(`${base}/purchase-invoice/lines/callout`, {
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

const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const [returnRes, invLinesRes, headerRes] = await Promise.all([
    apiFetch(`${base}/return-to-vendor-shipment/returnToVendorShipment?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    apiFetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    apiFetch(`${base}/purchase-invoice/header/${invoiceId}`),
  ]);

  const alreadyImportedReceiptLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.goodsShipmentLine) alreadyImportedReceiptLines.add(il.goodsShipmentLine); });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  const priceListId = invoiceHeader.priceList;
  const selectorUrl = `${base}/purchase-invoice/lines/selectors/M_Product_ID?limit=500&offset=0${priceListId ? `&priceList=${encodeURIComponent(priceListId)}` : ''}`;
  const selectorRes = await apiFetch(selectorUrl);

  const productAuxMap = {};
  if (selectorRes.ok) {
    const selData = await selectorRes.json();
    for (const item of (selData?.items || [])) {
      if (item.id && item._aux) {
        const aux = {};
        for (const [suffix, val] of Object.entries(item._aux)) {
          aux[`product${suffix}`] = val;
        }
        productAuxMap[item.id] = aux;
      }
    }
  }

  let documents = [];
  if (returnRes.ok) {
    const all = (await returnRes.json())?.response?.data || [];
    documents = all.filter(r =>
      r.documentStatus === 'CO'
      && r.businessPartner === bpId
      && Number(r.invoiceStatus || 0) < 100
    );
  }

  return {
    documents,
    sharedContext: { invoiceHeader, productAuxMap, alreadyImportedReceiptLines },
    excludedByCurrency: false,
  };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const res = await apiFetch(`${base}/return-to-vendor-shipment/returnToVendorShipmentLine?parentId=${docId}&_startRow=0&_endRow=200`);
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { invoiceHeader, productAuxMap, alreadyImportedReceiptLines } = sharedContext;

  return Promise.all(lines.map(async (l) => {
    const imported = alreadyImportedReceiptLines?.has(l.id);
    const qty = Number(l.movementQuantity) || 1;
    const priceData = l.product ? await resolveLinePrice(base, l.product, qty, invoiceHeader, productAuxMap[l.product] || {}) : {};
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: Number(l.movementQuantity) || 0,
      _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
      _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
      _tax: priceData.tax || null,
      _uOM: priceData.uOM || l.uOM || null,
      _alreadyImported: !!imported,
      _orderDiscount: 0,
    };
  }));
};

const getDocDisplay = (doc) => {
  const sourceRef = doc.sourceReceiptDocNo || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: sourceRef ? `#${sourceRef}` : '',
  };
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base }) => {
  const { invoiceHeader, productAuxMap } = sharedContext;
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
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
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
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
