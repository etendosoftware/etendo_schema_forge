import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

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
 * SL_Invoice_Amt). Unlike a normal shipment import, ARI_RM (return invoice)
 * lines must carry a NEGATIVE invoiced quantity — Etendo rejects positive
 * ones at completion.
 *
 * Already-imported detection uses the sales-invoice line's goodsShipmentLine
 * field (M_InOutLine_ID) — the same column ImportFromShipmentModal uses for
 * normal shipments, since a return receipt line and a regular shipment line
 * both live in M_InOutLine; their IDs never collide, so a single column
 * safely tracks both origins.
 *
 * ETP-4459 (partial import): detection is quantity-aware, not presence-only.
 * A return-receipt line can be split across multiple invoices (e.g. 10
 * returned, 5 invoiced so far), so fetchDocuments sums abs(invoicedQuantity)
 * per goodsShipmentLine — combining the current invoice's own lines with any
 * invoiced from other invoices — into invoicedQtyByGoodsShipmentLine.
 * fetchLines then derives remainingQty = movementQuantity - alreadyInvoiced
 * and only marks a line as _alreadyImported once remainingQty hits 0. The
 * separate salesOrderLine-based duplicate check (a different join, catching
 * a DIFFERENT return-receipt line already invoiced against the same order
 * line — e.g. an order whose return was split across two separate return
 * receipts) is built the same cross-invoice way — current invoice's lines
 * plus every other invoice's — but stays boolean/conservative for blocking
 * purposes: its "already invoiced" quantity lives in a different unit
 * universe (original sale qty vs. returned qty) and can't be safely netted
 * against movementQuantity, so any recorded match there still fully blocks
 * the line rather than attempting a fragile reconciliation.
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
    const res = await apiFetch(`${base}/sales-invoice/lines/callout`, {
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
      const cascadeRes = await apiFetch(`${base}/sales-invoice/lines/callout`, {
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
  // Fetch header first so we can pass its priceList to the product selector.
  // ProductPriceSelectorPolicy only enriches _PSTD / _PLIST when priceList is
  // provided as a context param; without it the callout receives PSTD=0 and
  // returns the wrong price.
  const invoicedLinesFilter = encodeURIComponent(
    JSON.stringify([{ fieldName: 'goodsShipmentLine', operator: 'notNull' }]),
  );
  const [returnRes, invLinesRes, allInvoicedLinesRes, headerRes] = await Promise.all([
    apiFetch(`${base}/return-material-receipt/returnMaterialReceipt?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    apiFetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    apiFetch(`${base}/sales-invoice/lines?criteria=${invoicedLinesFilter}&_startRow=0&_endRow=2000`),
    apiFetch(`${base}/sales-invoice/header/${invoiceId}`),
  ]);

  // Quantity-aware tracking (ETP-4459): a return-receipt line can be partially
  // imported (e.g. 10 returned, 5 invoiced so far → 5 still importable), so we
  // sum how much has already been invoiced per goodsShipmentLine instead of just
  // flagging presence. Invoice lines store a NEGATIVE invoicedQuantity for ARI_RM
  // (see buildLineBody below) — always compare/accumulate absolute values.
  const invoicedQtyByGoodsShipmentLine = new Map();
  // Secondary, coarser join (see fetchLines): total invoiced qty against the
  // underlying sales-order-line, regardless of return-receipt path.
  const invoicedQtyByOrderLine = new Map();
  const addQty = (map, key, qty) => {
    if (!key || !qty) return;
    map.set(key, (map.get(key) || 0) + qty);
  };

  // Lines already on THIS invoice (relevant when re-editing a draft invoice).
  const currentInvoiceLineIds = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.id) currentInvoiceLineIds.add(il.id);
      const qty = Math.abs(Number(il.invoicedQuantity) || 0);
      if (il.goodsShipmentLine) addQty(invoicedQtyByGoodsShipmentLine, il.goodsShipmentLine, qty);
      if (il.salesOrderLine) addQty(invoicedQtyByOrderLine, il.salesOrderLine, qty);
    });
  }

  // Return receipt lines already invoiced from OTHER invoices — prevents
  // double-invoicing the same line. This query is unscoped by invoice, so it
  // re-returns the current invoice's own lines too; skip records whose id was
  // already summed above so the same underlying invoice line isn't counted twice.
  if (allInvoicedLinesRes.ok) {
    const all = (await allInvoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.id && currentInvoiceLineIds.has(il.id)) return;
      const qty = Math.abs(Number(il.invoicedQuantity) || 0);
      if (il.goodsShipmentLine) addQty(invoicedQtyByGoodsShipmentLine, il.goodsShipmentLine, qty);
      if (il.salesOrderLine) addQty(invoicedQtyByOrderLine, il.salesOrderLine, qty);
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  const priceListId = invoiceHeader.priceList;
  const selectorUrl = `${base}/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0${priceListId ? `&priceList=${encodeURIComponent(priceListId)}` : ''}`;
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

  let candidates = [];
  if (returnRes.ok) {
    const all = (await returnRes.json())?.response?.data || [];
    candidates = all.filter(r =>
      r.documentStatus === 'CO'
      && r.businessPartner === bpId
      && Number(r.invoiceStatus || 0) < 100
    );
  }

  // Return receipts have no currency of their own (M_InOut has no C_Currency_ID
  // column) — resolve it via the linked sales order, same as goods-shipment.
  // Receipts with no linked order can't be compared, so they're never excluded.
  const invoiceCurrency = invoiceHeader.currency || null;
  let documents = candidates;
  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidates.filter(r => r.salesOrder).map(r => r.salesOrder))];
    const orderCurrencyMap = {};
    await Promise.all(orderIds.map(async (id) => {
      try {
        const r = await apiFetch(`${base}/sales-order/header/${id}`);
        if (r.ok) {
          const o = (await r.json())?.response?.data?.[0];
          if (o) orderCurrencyMap[id] = o.currency;
        }
      } catch { /* ignore — treat as unresolved, don't exclude */ }
    }));
    documents = candidates.filter(r => !r.salesOrder || orderCurrencyMap[r.salesOrder] === invoiceCurrency);
    excludedByCurrency = documents.length === 0 && candidates.length > 0;
  }

  return {
    documents,
    sharedContext: { invoiceHeader, productAuxMap, invoicedQtyByGoodsShipmentLine, invoicedQtyByOrderLine },
    excludedByCurrency,
  };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const res = await apiFetch(`${base}/return-material-receipt/returnMaterialReceiptLine?parentId=${docId}&_startRow=0&_endRow=200`);
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { invoiceHeader, productAuxMap, invoicedQtyByGoodsShipmentLine, invoicedQtyByOrderLine } = sharedContext;

  // Batch-fetch the referenced sales order lines to carry their discount into the
  // invoice. M_InOutLine has no Discount column — the value lives on C_OrderLine.
  const orderLineIds = [...new Set(lines.filter(l => l.salesOrderLine).map(l => l.salesOrderLine))];
  const orderDiscounts = {};
  await Promise.all(orderLineIds.map(async (id) => {
    try {
      const r = await apiFetch(`${base}/sales-order/lines/${id}`);
      if (r.ok) {
        const d = await r.json();
        const ol = d?.response?.data?.[0];
        if (ol && Number(ol.discount) > 0) orderDiscounts[id] = Number(ol.discount);
      }
    } catch { /* ignore — missing order line means 0 discount */ }
  }));

  return Promise.all(lines.map(async (l) => {
    const movementQty = Number(l.movementQuantity) || 0;
    const alreadyInvoicedQty = invoicedQtyByGoodsShipmentLine?.get(l.id) || 0;
    const remainingQty = Math.max(0, movementQty - alreadyInvoicedQty);

    // Secondary duplicate-detection path: catches the same underlying sales-order-line
    // already invoiced through a DIFFERENT return-receipt line (not via this one) —
    // cross-invoice, same current-plus-elsewhere merge as invoicedQtyByGoodsShipmentLine
    // above. That invoiced quantity lives in a different unit universe (original sale
    // qty, not returned qty) than movementQty/remainingQty above, so it can't be netted
    // against them without risking an incorrect (over-permissive) remaining amount.
    // Kept conservative: any recorded quantity against the same salesOrderLine fully
    // blocks the line, same as the original boolean behavior.
    const orderLineBlocked = !!(l.salesOrderLine && invoicedQtyByOrderLine?.get(l.salesOrderLine));

    const qty = movementQty || 1;
    const priceData = l.product ? await resolveLinePrice(base, l.product, qty, invoiceHeader, productAuxMap[l.product] || {}) : {};
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: orderLineBlocked ? 0 : remainingQty,
      _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
      _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
      _tax: priceData.tax || null,
      _uOM: priceData.uOM || l.uOM || null,
      _alreadyImported: orderLineBlocked || remainingQty <= 0,
      _orderDiscount: orderDiscounts[l.salesOrderLine] || 0,
    };
  }));
};

const getDocDisplay = (doc) => {
  const sourceRef = doc.sourceShipmentDocNo || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: sourceRef ? `#${sourceRef}` : '',
  };
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base }) => {
  const { invoiceHeader, productAuxMap } = sharedContext;
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
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
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
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
