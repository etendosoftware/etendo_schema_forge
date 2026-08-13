import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

/**
 * Goods receipt lines don't carry pricing — we resolve unit price, tax, and
 * uOM through the purchase-invoice lines callout cascade (same pattern as
 * ImportFromShipmentModal on the sales side).
 */

const resolveLinePrice = async (base, headers, productId, qty, invoiceHeader, auxData = {}) => {
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
    const res = await fetch(`${base}/purchase-invoice/lines/callout`, {
      method: 'POST',
      headers,
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
      const cascadeRes = await fetch(`${base}/purchase-invoice/lines/callout`, {
        method: 'POST',
        headers,
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

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  const [receiptRes, invLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/goods-receipt/goodsReceipt?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/purchase-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedReceiptLines = new Set();
  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.goodsShipmentLine) alreadyImportedReceiptLines.add(il.goodsShipmentLine);
      if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine);
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  const priceListId = invoiceHeader.priceList;
  const selectorUrl = `${base}/purchase-invoice/lines/selectors/M_Product_ID?limit=500&offset=0${priceListId ? `&priceList=${encodeURIComponent(priceListId)}` : ''}`;
  const selectorRes = await fetch(selectorUrl, { headers });

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
  if (receiptRes.ok) {
    const all = (await receiptRes.json())?.response?.data || [];
    candidates = all.filter(r =>
      r.documentStatus === 'CO'
      && r.businessPartner === bpId
      && r.invoiced !== true
    );
  }

  // Receipts have no currency of their own (M_InOut has no C_Currency_ID column) —
  // resolve it via the linked purchase order. Receipts with no linked order can't be
  // compared, so they're never excluded by this filter.
  const invoiceCurrency = invoiceHeader.currency || null;
  let documents = candidates;
  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidates.filter(r => r.salesOrder).map(r => r.salesOrder))];
    const orderCurrencyMap = {};
    await Promise.all(orderIds.map(async (id) => {
      try {
        const r = await fetch(`${base}/purchase-order/header/${id}`, { headers });
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
    sharedContext: { invoiceHeader, productAuxMap, alreadyImportedReceiptLines, alreadyImportedOrderLines },
    excludedByCurrency,
  };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/goods-receipt/goodsReceiptLine?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { invoiceHeader, productAuxMap, alreadyImportedReceiptLines, alreadyImportedOrderLines } = sharedContext;

  // Fetch purchase order line discounts (M_InOutLine has no Discount column)
  const orderLineIds = [...new Set(lines.filter(l => l.salesOrderLine).map(l => l.salesOrderLine))];
  const orderDiscounts = {};
  await Promise.all(orderLineIds.map(async (id) => {
    try {
      const r = await fetch(`${base}/purchase-order/lines/${id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        const ol = d?.response?.data?.[0];
        if (ol && Number(ol.discount) > 0) orderDiscounts[id] = Number(ol.discount);
      }
    } catch { /* ignore */ }
  }));

  return Promise.all(lines.map(async (l) => {
    const imported = alreadyImportedReceiptLines?.has(l.id) || alreadyImportedOrderLines?.has(l.salesOrderLine);
    const qty = Number(l.movementQuantity) || 1;
    const priceData = l.product ? await resolveLinePrice(base, headers, l.product, qty, invoiceHeader, productAuxMap[l.product] || {}) : {};
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: Number(l.movementQuantity) || 0,
      _unitPrice: Number(priceData.unitPrice) || Number(priceData.grossUnitPrice) || 0,
      _lineNetAmount: Number(priceData.lineNetAmount ?? 0),
      _tax: priceData.tax || null,
      _uOM: priceData.uOM || l.uOM || null,
      _alreadyImported: !!imported,
      _orderDiscount: orderDiscounts[l.salesOrderLine] || 0,
    };
  }));
};

const getDocDisplay = (doc) => {
  const orderRef = (doc['salesOrder$_identifier'] || '').split(' - ')[0] || '';
  return {
    docNo: doc.documentNo || doc.id,
    date: doc.movementDate,
    secondary: orderRef ? `#${orderRef}` : '',
  };
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo, sharedContext, base, headers }) => {
  const { invoiceHeader, productAuxMap } = sharedContext;
  const priceData = await resolveLinePrice(base, headers, line.product, qty, invoiceHeader, productAuxMap[line.product] || {});
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
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
