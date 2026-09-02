import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    apiFetch(`${base}/purchase-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    apiFetch(`${base}/purchase-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    apiFetch(`${base}/purchase-invoice/header/${invoiceId}`),
  ]);

  const alreadyImportedOrderLines = new Set();
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invLines.forEach(il => { if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine); });
  }

  let invoiceCurrency = null;
  if (headerRes.ok) {
    invoiceCurrency = (await headerRes.json())?.response?.data?.[0]?.currency || null;
  }

  let documents = [];
  let excludedByCurrency = false;
  const orderDiscountMap = {};
  if (ordersRes.ok) {
    const all = (await ordersRes.json())?.response?.data || [];
    const candidates = all.filter(o =>
      o.documentStatus === 'CO'
      && o.businessPartner === bpId
      && Number(o.invoiceStatus ?? 0) < 100
    );
    documents = invoiceCurrency ? candidates.filter(o => o.currency === invoiceCurrency) : candidates;
    excludedByCurrency = !!invoiceCurrency && documents.length === 0 && candidates.length > 0;
    documents.forEach(o => {
      if (o.etgoTotalDiscount) orderDiscountMap[o.id] = Number(o.etgoTotalDiscount);
    });
  }
  return { documents, sharedContext: { alreadyImportedOrderLines, orderDiscountMap }, excludedByCurrency };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const res = await apiFetch(`${base}/purchase-order/lines?parentId=${docId}&_startRow=0&_endRow=200`);
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

const afterImport = async ({ importedDocIds, sharedContext, base, invoiceId }) => {
  const { orderDiscountMap } = sharedContext;
  const discounts = [...importedDocIds].map(id => orderDiscountMap[id]).filter(v => v > 0);
  if (discounts.length === 0) return;
  const uniqueDiscounts = [...new Set(discounts)];
  if (uniqueDiscounts.length !== 1) return;
  await apiFetch(`${base}/purchase-invoice/header/${invoiceId}`, {
    method: 'PATCH',
    
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
    description: line.description || null,
    tax: line.tax || null,
    uOM: line.uOM || null,
    lineNo,
    salesOrderLine: line.id,
  };
};

export default function ImportFromPurchaseOrderModal(props) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="purchase-invoice/lines"
      titleKey="importFromPurchaseOrder"
      searchPlaceholderKey="searchPurchaseOrder"
      emptyMessageKey="noCompletedPurchaseOrdersForThisSupplier"
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey="noPurchaseOrdersMatchCurrency"
      successMessageKey="linesImportedFromPurchaseOrder"
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
      afterImport={afterImport}
    />
  );
}
