import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

async function fetchDraftInfoByOrderLine({ base, headers, bpId, currentShipmentId }) {
  // Fetch current shipment lines directly (by parentId) + other draft shipments list in parallel.
  // Avoids relying on the current shipment appearing in the paginated list.
  const [currentLinesRes, shipmentsRes] = await Promise.all([
    currentShipmentId
      ? fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${currentShipmentId}&_startRow=0&_endRow=200`, { headers })
      : Promise.resolve(null),
    fetch(`${base}/goods-shipment/goodsShipment?_startRow=0&_endRow=100&_sortBy=movementDate desc`, { headers }),
  ]);

  const draftInfo = {};

  if (currentLinesRes?.ok) {
    const currentLines = (await currentLinesRes.json())?.response?.data || [];
    currentLines.forEach(l => {
      if (!l.salesOrderLine) return;
      if (!draftInfo[l.salesOrderLine]) draftInfo[l.salesOrderLine] = { qty: 0, docNos: new Set() };
      draftInfo[l.salesOrderLine].qty += Number(l.movementQuantity) || 0;
    });
  }

  if (shipmentsRes.ok) {
    const all = (await shipmentsRes.json())?.response?.data || [];
    const otherDrafts = all.filter(s =>
      s.documentStatus === 'DR' && s.businessPartner === bpId && s.id !== currentShipmentId,
    );
    const lineResults = await Promise.all(
      otherDrafts.map(s =>
        fetch(`${base}/goods-shipment/goodsShipmentLine?parentId=${s.id}&_startRow=0&_endRow=200`, { headers })
          .then(r => r.ok ? r.json().then(d => ({ docNo: s.documentNo, lines: d?.response?.data || [] })) : null),
      ),
    );
    for (const result of lineResults) {
      if (!result) continue;
      result.lines.forEach(l => {
        if (!l.salesOrderLine) return;
        if (!draftInfo[l.salesOrderLine]) draftInfo[l.salesOrderLine] = { qty: 0, docNos: new Set() };
        draftInfo[l.salesOrderLine].qty += Number(l.movementQuantity) || 0;
        draftInfo[l.salesOrderLine].docNos.add(result.docNo);
      });
    }
  }

  return draftInfo;
}

const fetchDocuments = async ({ base, headers, bpId, invoiceId: shipmentId }) => {
  const [invoicesRes, draftInfo] = await Promise.all([
    fetch(`${base}/sales-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetchDraftInfoByOrderLine({ base, headers, bpId, currentShipmentId: shipmentId }),
  ]);

  let documents = [];
  const ordersByInvoiceId = {};
  if (invoicesRes.ok) {
    const all = (await invoicesRes.json())?.response?.data || [];
    documents = all.filter(o => o.documentStatus === 'CO' && o.businessPartner === bpId);
    documents.forEach(doc => {
      if (doc.salesOrder) ordersByInvoiceId[doc.id] = doc.salesOrder;
    });
  }
  return { documents, sharedContext: { ordersByInvoiceId, draftInfo } };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const orderId = sharedContext.ordersByInvoiceId?.[docId];

  const [invoiceLinesRes, orderLinesRes] = await Promise.all([
    fetch(`${base}/sales-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`, { headers }),
    orderId
      ? fetch(`${base}/sales-order/lines?parentId=${orderId}&_startRow=0&_endRow=200`, { headers })
      : Promise.resolve(null),
  ]);

  if (!invoiceLinesRes.ok) return [];
  const invoiceLines = (await invoiceLinesRes.json())?.response?.data || [];

  const deliveredByOrderLine = {};
  const orderLineByProduct = {};
  if (orderLinesRes?.ok) {
    const orderLines = (await orderLinesRes.json())?.response?.data || [];
    orderLines.forEach(ol => {
      deliveredByOrderLine[ol.id] = Number(ol.deliveredQuantity) || 0;
      if (ol.product) orderLineByProduct[ol.product] = ol.id;
    });
  }

  return invoiceLines.map(l => {
    const qty = Number(l.invoicedQuantity) || 0;
    const alreadyLinked = !!l.goodsShipmentLine;
    const orderLineId = l.salesOrderLine || orderLineByProduct[l.product];
    const delivered = orderLineId ? (deliveredByOrderLine[orderLineId] ?? 0) : 0;
    const draftEntry = orderLineId ? sharedContext.draftInfo?.[orderLineId] : undefined;
    const inOtherDrafts = draftEntry?.qty || 0;
    // For lines with an order: delivery tracking supports partial imports across multiple
    // shipments. For direct invoice lines (no order): m_inoutline_id is the only signal.
    const pending = orderLineId
      ? Math.max(0, qty - delivered - inOtherDrafts)
      : alreadyLinked ? 0 : Math.max(0, qty);
    return {
      ...l,
      _orderLineId: orderLineId,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: pending,
      _unitPrice: 0,
      _lineNetAmount: 0,
      _alreadyImported: pending === 0,
      _inDraftShipments: draftEntry?.docNos?.size ? [...draftEntry.docNos] : undefined,
    };
  });
};

const getDocDisplay = (doc) => ({ docNo: doc.documentNo || doc.id, date: doc.invoiceDate });

const buildLineBody = async ({ line, qty, invoiceId: shipmentId, lineNo }) => ({
  parentId: shipmentId,
  product: line.product,
  movementQuantity: qty,
  uOM: line.uOM || null,
  ...(line._orderLineId ? { salesOrderLine: line._orderLineId } : {}),
  invoiceLineId: line.id,
  lineNo,
});

export default function ImportFromSalesInvoiceModal(props) {
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="goods-shipment/goodsShipmentLine"
      titleKey="importFromSalesInvoice"
      searchPlaceholderKey="searchSalesInvoice"
      emptyMessageKey="noCompletedSalesInvoicesForThisCustomer"
      noSearchResultsKey="noInvoicesMatchYourSearch"
      allImportedMessageKey="allSalesInvoicesAlreadyImported"
      successMessageKey="linesImportedFromSalesInvoice"
      showPriceColumns={false}
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
