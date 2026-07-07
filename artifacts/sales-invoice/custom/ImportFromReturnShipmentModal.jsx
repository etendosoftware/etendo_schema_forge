import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

/**
 * Import invoice lines from a completed Customer Return (Albarán de Devolución de Venta).
 * Available only for Factura de Devolución (DEV subtype) — enforced at the call site.
 *
 * Return lines already carry price and UOM, so no callout cascade is needed.
 * Already-imported detection uses the mInoutlineId field on invoice lines, which
 * stores the source M_InOut line ID regardless of whether it came from a standard
 * shipment or a customer return.
 */

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  // Fetch in parallel: completed returns, current invoice lines, and all invoice lines
  // that came from a return shipment (mInoutlineId set) to detect already-invoiced returns.
  const invoicedLinesFilter = encodeURIComponent(
    JSON.stringify([{ fieldName: 'mInoutlineId', operator: 'notNull' }]),
  );
  const [returnRes, invLinesRes, invoicedLinesRes, headerRes] = await Promise.all([
    fetch(
      `${base}/return-from-customer/customerReturn?_startRow=0&_endRow=500&_sortBy=orderDate desc`,
      { headers },
    ),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
    fetch(
      `${base}/sales-invoice/lines?criteria=${invoicedLinesFilter}&_startRow=0&_endRow=2000`,
      { headers },
    ),
    fetch(`${base}/sales-invoice/header/${invoiceId}`, { headers }),
  ]);

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  // Lines already used in the current invoice
  const alreadyImportedReturnLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => {
      if (il.mInoutlineId) alreadyImportedReturnLines.add(il.mInoutlineId);
    });
  }

  // All return shipment line IDs invoiced in OTHER invoices (exclude the current one so the
  // same return can be re-opened to import remaining lines into this invoice).
  const invoicedElsewhere = new Set();
  if (invoicedLinesRes.ok) {
    const all = (await invoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.mInoutlineId && !alreadyImportedReturnLines.has(il.mInoutlineId)) {
        invoicedElsewhere.add(il.mInoutlineId);
      }
    });
  }

  let candidateReturns = [];
  if (returnRes.ok) {
    const all = (await returnRes.json())?.response?.data || [];
    candidateReturns = all.filter(r => r.documentStatus === 'CO' && r.businessPartner === bpId);
  }

  if (candidateReturns.length === 0) {
    return { documents: [], sharedContext: { alreadyImportedReturnLines } };
  }

  // Returns have no currency of their own (M_InOut has no C_Currency_ID column) —
  // resolve it via the linked sales order. Returns with no linked order can't be
  // compared, so they're never excluded by this filter.
  let excludedByCurrency = false;
  if (invoiceCurrency) {
    const orderIds = [...new Set(candidateReturns.filter(r => r.salesOrder).map(r => r.salesOrder))];
    const orderCurrencyMap = {};
    await Promise.all(orderIds.map(async (id) => {
      try {
        const r = await fetch(`${base}/sales-order/header/${id}`, { headers });
        if (r.ok) {
          const o = (await r.json())?.response?.data?.[0];
          if (o) orderCurrencyMap[id] = o.currency;
        }
      } catch { /* ignore — treat as unresolved, don't exclude */ }
    }));
    const beforeCurrencyCount = candidateReturns.length;
    candidateReturns = candidateReturns.filter(r => !r.salesOrder || orderCurrencyMap[r.salesOrder] === invoiceCurrency);
    excludedByCurrency = candidateReturns.length === 0 && beforeCurrencyCount > 0;
  }

  if (candidateReturns.length === 0) {
    return { documents: [], sharedContext: { alreadyImportedReturnLines }, excludedByCurrency };
  }

  // Fetch lines for each return in parallel to check if any line is still available
  const returnLinesResults = await Promise.all(
    candidateReturns.map(ret =>
      fetch(
        `${base}/return-from-customer/customerReturnLine?parentId=${ret.id}&_startRow=0&_endRow=200`,
        { headers },
      )
        .then(r => (r.ok ? r.json() : null))
        .then(json => json?.response?.data || []),
    ),
  );

  // Show returns that have at least one line not yet invoiced in another invoice.
  // Lines already in the current invoice are shown as _alreadyImported (handled in fetchLines).
  const documents = candidateReturns.filter((_, idx) => {
    const lines = returnLinesResults[idx];
    if (lines.length === 0) return false;
    return lines.some(l => !invoicedElsewhere.has(l.id));
  });

  return { documents, sharedContext: { alreadyImportedReturnLines }, excludedByCurrency };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(
    `${base}/return-from-customer/customerReturnLine?parentId=${docId}&_startRow=0&_endRow=200`,
    { headers },
  );
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  const { alreadyImportedReturnLines } = sharedContext;
  return lines.map(l => ({
    ...l,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: Number(l.orderedQuantity) || 0,
    _unitPrice: Number(l.unitPrice) || 0,
    _lineNetAmount: Number(l.lineNetAmount) || 0,
    _alreadyImported: alreadyImportedReturnLines?.has(l.goodsShipmentLine) || false,
  }));
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.orderDate,
});

const buildLineBody = ({ line, qty, invoiceId, lineNo }) => {
  const unitPrice = Number(line.unitPrice) || 0;
  // ARI_RM (return invoice) lines must have negative quantities — Etendo rejects positive ones at completion
  const negQty = -Math.abs(qty);
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: negQty,
    unitPrice,
    listPrice: unitPrice,
    lineNetAmount: negQty * unitPrice,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    mInoutlineId: line.goodsShipmentLine || null,
  };
};

export default function ImportFromReturnShipmentModal(props) {
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
