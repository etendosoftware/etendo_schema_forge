import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';

const fetchDocuments = async ({ base, headers, bpId, invoiceId }) => {
  const [ordersRes, invLinesRes] = await Promise.all([
    fetch(`${base}/sales-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`, { headers }),
    fetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`, { headers }),
  ]);

  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.cOrderlineId) alreadyImportedOrderLines.add(il.cOrderlineId); });
  }

  let documents = [];
  const orderDiscountMap = {};
  if (ordersRes.ok) {
    const all = (await ordersRes.json())?.response?.data || [];
    documents = all.filter(o =>
      o.documentStatus === 'CO'
      && o.businessPartner === bpId
      && Number(o.invoiceStatus ?? 0) < 100
    );
    documents.forEach(o => {
      if (o.etgoTotalDiscount) orderDiscountMap[o.id] = Number(o.etgoTotalDiscount);
    });
  }
  return { documents, sharedContext: { alreadyImportedOrderLines, orderDiscountMap } };
};

const fetchLines = async ({ base, headers, docId, sharedContext }) => {
  const res = await fetch(`${base}/sales-order/lines?parentId=${docId}&_startRow=0&_endRow=200`, { headers });
  if (!res.ok) return [];
  const json = await res.json();
  const lines = json?.response?.data || [];
  return lines.map(l => {
    const ordered = Number(l.orderedQuantity) || 0;
    const invoiced = Number(l.invoicedQuantity) || 0;
    const pending = Math.max(0, ordered - invoiced);
    const unitPrice = Number(l.unitPrice) || 0;
    const alreadyInCurrent = sharedContext.alreadyImportedOrderLines?.has(l.id) || false;
    return {
      ...l,
      _productName: l['product$_identifier'] || l.id,
      _maxQty: pending,
      _unitPrice: unitPrice,
      _lineNetAmount: unitPrice * pending,
      _alreadyImported: alreadyInCurrent || pending <= 0,
    };
  });
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.orderDate,
});

const afterImport = async ({ importedDocIds, sharedContext, base, headers, invoiceId }) => {
  const { orderDiscountMap } = sharedContext;
  const discounts = [...importedDocIds].map(id => orderDiscountMap[id]).filter(v => v > 0);
  if (discounts.length === 0) return;
  const uniqueDiscounts = [...new Set(discounts)];
  if (uniqueDiscounts.length !== 1) return;
  await fetch(`${base}/sales-invoice/header/${invoiceId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ etgoTotalDiscount: uniqueDiscounts[0] }),
  });
};

const buildLineBody = async ({ line, qty, invoiceId, lineNo }) => {
  const unitPrice = Number(line.unitPrice) || 0;
  const listPrice = Number(line.listPrice) || unitPrice;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.discount) || 0;
  return {
    parentId: invoiceId,
    product: line.product,
    invoicedQuantity: qty,
    unitPrice,
    listPrice,
    ...(grossUnitPrice ? { grossUnitPrice } : {}),
    ...(discount ? { etgoDiscount: discount } : {}),
    lineNetAmount: unitPrice * qty,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    cOrderlineId: line.id,
  };
};

export default function ImportFromOrderModal(props) {
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromSalesOrder"
      searchPlaceholderKey="searchSalesOrder"
      emptyMessageKey="noCompletedSalesOrdersForThisCustomer"
      noSearchResultsKey="noOrdersMatchYourSearch"
      successMessageKey="linesImportedFromSalesOrder"
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
      afterImport={afterImport}
    />
  );
}
