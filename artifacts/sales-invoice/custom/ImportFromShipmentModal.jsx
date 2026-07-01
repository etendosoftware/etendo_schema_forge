import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

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
    const res = await fetch(`${base}/sales-invoice/lines/callout`, {
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
    // SL_Invoice_Product returns the catalog price as standardPrice (PriceStd) and
    // zeros out listPrice — apply the same fallback that DetailView uses.
    if (Number(result.standardPrice) && !Number(result.listPrice)) {
      result.listPrice = result.standardPrice;
    }
    let unitPrice = Number(result.unitPrice) || Number(result.grossUnitPrice) || 0;
    if (unitPrice) result.unitPrice = unitPrice;

    if (unitPrice) {
      const cascadeState = { ...formState, ...result, invoicedQuantity: qty || 1 };
      const cascadeRes = await fetch(`${base}/sales-invoice/lines/callout`, {
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
  // Fetch header first so we can pass its priceList to the product selector.
  // ProductPriceSelectorPolicy only enriches _PSTD / _PLIST when priceList is
  // provided as a context param; without it the callout receives PSTD=0 and
  // returns the wrong price.
  const invoicedLinesFilter = encodeURIComponent(
    JSON.stringify([{ fieldName: 'goodsShipmentLine', operator: 'notNull' }]),
  );
  const [shipRes, invLinesRes, allInvoicedLinesRes, headerRes] = await Promise.all([
    fetch(`${base}/goods-shipment/goodsShipment?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(`${base}/sales-invoice/lines?criteria=${invoicedLinesFilter}&_startRow=0&_endRow=2000`, { headers }),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  const alreadyImportedShipmentLines = new Set();
  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.goodsShipmentLine) alreadyImportedShipmentLines.add(il.goodsShipmentLine);
      if (il.cOrderlineId) alreadyImportedOrderLines.add(il.cOrderlineId);
    });
  }

  // Shipment lines already used in other invoices — prevents double-invoicing the same line.
  const invoicedElsewhere = new Set();
  if (allInvoicedLinesRes.ok) {
    const all = (await allInvoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.goodsShipmentLine && !alreadyImportedShipmentLines.has(il.goodsShipmentLine)) {
        invoicedElsewhere.add(il.goodsShipmentLine);
      }
    });
  }

  let invoiceHeader = {};
  if (headerRes.ok) {
    invoiceHeader = (await headerRes.json())?.response?.data?.[0] || {};
  }

  const priceListId = invoiceHeader.priceList;
  const selectorUrl = `${base}/sales-invoice/lines/selectors/M_Product_ID?limit=500&offset=0${priceListId ? `&priceList=${encodeURIComponent(priceListId)}` : ''}`;
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

  let documents = [];
  if (shipRes.ok) {
    const all = (await shipRes.json())?.response?.data || [];
    documents = all.filter(s =>
      s.documentStatus === 'CO'
      && s.businessPartner === bpId
      && s.invoiced !== true
    );
  }

  return {
    documents,
    sharedContext: { invoiceHeader, productAuxMap, alreadyImportedShipmentLines, alreadyImportedOrderLines, invoicedElsewhere },
  };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { invoiceHeader, productAuxMap, alreadyImportedShipmentLines, alreadyImportedOrderLines, invoicedElsewhere } = sharedContext;

  // Batch-fetch the referenced sales order lines to carry their discount into the
  // invoice. M_InOutLine has no Discount column — the value lives on C_OrderLine.
  const orderLineIds = [...new Set(lines.filter(l => l.salesOrderLine).map(l => l.salesOrderLine))];
  const orderDiscounts = {};
  await Promise.all(orderLineIds.map(async (id) => {
    try {
      const r = await fetch(`${base}/sales-order/lines/${id}`, { headers });
      if (r.ok) {
        const d = await r.json();
        const ol = d?.response?.data?.[0];
        if (ol && Number(ol.discount) > 0) orderDiscounts[id] = Number(ol.discount);
      }
    } catch { /* ignore — missing order line means 0 discount */ }
  }));

  return Promise.all(lines.map(async (l) => {
    const imported = alreadyImportedShipmentLines?.has(l.id) || alreadyImportedOrderLines?.has(l.salesOrderLine) || invoicedElsewhere?.has(l.id);
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
  // Re-resolve price for the actual import qty so lineNetAmount is correct.
  const priceData = await resolveLinePrice(base, headers, line.product, qty, invoiceHeader, productAuxMap[line.product] || {});
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
    cOrderlineId: line.salesOrderLine || null,
  };
};

export default function ImportFromShipmentModal(props) {
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromShipment"
      searchPlaceholderKey="searchShipment"
      emptyMessageKey="noPendingShipmentsForCustomer"
      noSearchResultsKey="noShipmentsMatchYourSearch"
      successMessageKey="linesImportedFromShipment"
      showPriceColumns={false}
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
