import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

/**
 * Import invoice lines from a completed Customer Return (Albarán de Devolución de Venta).
 * Available only for Factura de Devolución (DEV subtype) — enforced at the call site.
 *
 * Return lines already carry price and UOM, so no callout cascade is needed.
 * Already-imported detection uses the goodsShipmentLine field on invoice lines
 * (M_InOutLine_ID), which stores the source M_InOut line ID regardless of whether
 * it came from a standard shipment or a customer return — same field ImportFromShipmentModal
 * uses. This is also the field the backend enrichment (SalesInvoiceHeaderHandler) reads to
 * resolve linkedShipments / sourceReturnReceipt / sourceInvoice for the Related Documents panel,
 * so it must stay in sync with the current API contract.
 */

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  // Fetch in parallel: completed returns, current invoice lines, and all invoice lines
  // that came from a return shipment (goodsShipmentLine set) to detect already-invoiced returns.
  const invoicedLinesFilter = encodeURIComponent(
    JSON.stringify([{ fieldName: 'goodsShipmentLine', operator: 'notNull' }]),
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
      if (il.goodsShipmentLine) alreadyImportedReturnLines.add(il.goodsShipmentLine);
    });
  }

  // All return shipment line IDs invoiced in OTHER invoices (exclude the current one so the
  // same return can be re-opened to import remaining lines into this invoice).
  const invoicedElsewhere = new Set();
  if (invoicedLinesRes.ok) {
    const all = (await invoicedLinesRes.json())?.response?.data || [];
    all.forEach(il => {
      if (il.goodsShipmentLine && !alreadyImportedReturnLines.has(il.goodsShipmentLine)) {
        invoicedElsewhere.add(il.goodsShipmentLine);
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
    // l is a customerReturnLine (C_OrderLine) record — its own M_InOutLine_ID field is
    // named `mInoutlineId` there (distinct from the sales-invoice line's `goodsShipmentLine`
    // field used elsewhere in this file; the two entities were never renamed in sync).
    _alreadyImported: alreadyImportedReturnLines?.has(l.mInoutlineId) || false,
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
    // Write the new invoice line's own `goodsShipmentLine` (C_InvoiceLine.M_InOutLine_ID) from
    // the source return line's `mInoutlineId` (C_OrderLine.M_InOutLine_ID) — the physical
    // M_InOutLine created when this return order line was received. This is what the backend
    // enrichment (SalesInvoiceHeaderHandler#enrichLinkedShipments / #enrichSourceInvoice) reads
    // to resolve the Related Documents panel back to the originating Return Material Receipt.
    goodsShipmentLine: line.mInoutlineId || null,
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
