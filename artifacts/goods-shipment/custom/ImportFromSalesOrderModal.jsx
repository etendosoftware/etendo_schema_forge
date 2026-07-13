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
  const [ordersRes, draftInfo] = await Promise.all([
    fetch(`${base}/sales-order/header?_startRow=0&_endRow=500&_sortBy=orderDate desc`, { headers }),
    fetchDraftInfoByOrderLine({ base, headers, bpId, currentShipmentId: shipmentId }),
  ]);

  let documents = [];
  if (ordersRes.ok) {
    const all = (await ordersRes.json())?.response?.data || [];
    documents = all.filter(o =>
      o.documentStatus === 'CO'
      && o.businessPartner === bpId
      && Number(o.deliveryStatus ?? 100) < 100,
    );
  }
  return { documents, sharedContext: { draftInfo } };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/sales-order/lines?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const lines = (await res.json())?.response?.data || [];
  return lines.map(l => {
    const ordered = Number(l.orderedQuantity) || 0;
    const delivered = Number(l.deliveredQuantity) || 0;
    const draftEntry = sharedContext.draftInfo?.[l.id];
    const inOtherDrafts = draftEntry?.qty || 0;
    const pending = Math.max(0, ordered - delivered - inOtherDrafts);
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: pending,
      _unitPrice: 0,
      _lineNetAmount: 0,
      _alreadyImported: pending === 0,
      _inDraftShipments: draftEntry?.docNos?.size ? [...draftEntry.docNos] : undefined,
    };
  });
};

const getDocDisplay = (doc) => ({ docNo: doc.documentNo || doc.id, date: doc.orderDate });

const buildLineBody = async ({ line, qty, invoiceId: shipmentId, lineNo }) => ({
  parentId: shipmentId,
  product: line.product,
  movementQuantity: qty,
  uOM: line.uOM || null,
  salesOrderLine: line.id,
  lineNo,
});

export default function ImportFromSalesOrderModal(props) {
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="goods-shipment/goodsShipmentLine"
      titleKey="importFromSalesOrder"
      searchPlaceholderKey="searchSalesOrder"
      emptyMessageKey="noCompletedSalesOrdersForThisCustomer"
      noSearchResultsKey="noOrdersMatchYourSearch"
      successMessageKey="linesImportedFromSalesOrder"
      showPriceColumns={false}
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
