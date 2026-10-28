import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useOrderGlobalDiscountImport from '@/windows/custom/shared/useOrderGlobalDiscountImport.jsx';

const fetchDocuments = async ({ base, bpId, invoiceId }) => {
  const [ordersRes, invLinesRes, headerRes] = await Promise.all([
    moduleApiFetch(`${base}/sales-order/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    moduleApiFetch(`${base}/sales-invoice/lines?parentId=${invoiceId}&_startRow=0&_endRow=200`),
    moduleApiFetch(`${base}/sales-invoice/header/${invoiceId}`),
  ]);

  const alreadyImportedOrderLines = new Set();
  // ETP-5828: the GET already hides the ETGO_DTO global-discount line (InvoiceLineHandler).
  let invoiceHasLines = false;
  if (invLinesRes.ok) {
    const invLines = (await invLinesRes.json())?.response?.data || [];
    invoiceHasLines = invLines.length > 0;
    invLines.forEach(il => { if (il.salesOrderLine) alreadyImportedOrderLines.add(il.salesOrderLine); });
  }

  let invoiceCurrency = null;
  let invoiceGlobalDiscount = null;
  let invoiceHeaderRead = false;
  if (headerRes.ok) {
    const invoiceHeader = (await headerRes.json())?.response?.data?.[0];
    invoiceHeaderRead = !!invoiceHeader;
    invoiceCurrency = invoiceHeader?.currency || null;
    invoiceGlobalDiscount = Number(invoiceHeader?.etgoTotalDiscount) || null;
  }
  // ETP-5828: a failed header or lines GET leaves the invoice % / lines unknown; the shared
  // global-discount rule then offers no carry and never PATCHes the header.
  const invoiceStateKnown = invoiceHeaderRead && invLinesRes.ok;

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
  return {
    documents,
    sharedContext: {
      alreadyImportedOrderLines, orderDiscountMap, invoiceGlobalDiscount, invoiceHasLines, invoiceStateKnown,
    },
    excludedByCurrency,
  };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const res = await moduleApiFetch(`${base}/sales-order/lines?parentId=${docId}&_startRow=0&_endRow=200`);
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

const buildLineBody = async ({ line, qty, invoiceId, lineNo }) => {
  const unitPrice = Number(line.unitPrice) || 0;
  const grossUnitPrice = Number(line.grossUnitPrice) || 0;
  const discount = Number(line.discount) || 0;
  // ETP-5710: unitPrice is the order line's already-discounted price. Without a list price the
  // old fallback posted U == L next to etgoDiscount, which the server reads as "not yet
  // discounted" and discounts again. Rebuild the list price so U != L (6 decimals, as the SPA).
  const storedListPrice = Number(line.listPrice) || 0;
  const listPrice = storedListPrice
    || (discount > 0 && discount < 100
      ? Math.round((unitPrice / (1 - discount / 100)) * 1e6) / 1e6
      : unitPrice);
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
    // ETP-5381: the key MUST be the spec's java_qualifier for C_OrderLine_ID. NeoFieldFilter
    // drops any key absent from the spec silently (200, line created, FK NULL), and without
    // C_OrderLine_ID the invoice never reaches C_INVOICE_POST's MatchSO block (no M_MATCHSO row)
    // nor its `UPDATE C_ORDERLINE SET QtyInvoiced` — so the order stays invoiceable forever.
    salesOrderLine: line.id,
  };
};

export default function ImportFromOrderModal(props) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  // ETP-5828: global-discount carry-over (tag, warning/toggle panel, header PATCH, toast).
  const globalDiscountProps = useOrderGlobalDiscountImport({ headerEndpoint: 'sales-invoice/header' });
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="sales-invoice/lines"
      titleKey="importFromSalesOrder"
      searchPlaceholderKey="searchSalesOrder"
      emptyMessageKey="noCompletedSalesOrdersForThisCustomer"
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey="noSalesOrdersMatchCurrency"
      successMessageKey="linesImportedFromSalesOrder"
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
      {...globalDiscountProps}
    />
  );
}
