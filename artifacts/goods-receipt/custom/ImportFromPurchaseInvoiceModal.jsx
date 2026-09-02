import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';

function enrichLines(lines) {
  return lines
    .map(l => {
      const qty = Number(l.invoicedQuantity) || 0;
      const alreadyLinked = !!l.goodsShipmentLine;
      return {
        ...l,
        _productName: l['product$_identifier'] || l.id,
        _maxQty: alreadyLinked ? 0 : qty,
        _alreadyImported: alreadyLinked,
      };
    })
    .filter(l => Number(l.invoicedQuantity) > 0);
}

const fetchDocuments = async ({ base, bpId, invoiceId: receiptId }) => {
  const [res, headerRes] = await Promise.all([
    apiFetch(`${base}/purchase-invoice/header?_startRow=0&_endRow=500&_sortBy=creationDate desc`),
    apiFetch(`${base}/goods-receipt/goodsReceipt/${receiptId}`),
  ]);
  if (!res.ok) return { documents: [], sharedContext: { linesCache: {} } };

  let receiptCurrency = null;
  if (headerRes.ok) {
    receiptCurrency = (await headerRes.json())?.response?.data?.[0]?.etgoCurrency || null;
  }

  const all = (await res.json())?.response?.data || [];
  const statusAndBpCandidates = all.filter(o =>
    o.documentStatus === 'CO'
    && o.businessPartner === bpId
    && Number(o.grandTotalAmount ?? 0) >= 0
  );
  const candidates = receiptCurrency
    ? statusAndBpCandidates.filter(o => o.currency === receiptCurrency)
    : statusAndBpCandidates;
  const excludedByCurrency = !!receiptCurrency
    && candidates.length === 0
    && statusAndBpCandidates.length > 0;

  const lineResults = await Promise.all(
    candidates.map(async inv => {
      try {
        const r = await apiFetch(
          `${base}/purchase-invoice/lines?parentId=${inv.id}&_startRow=0&_endRow=200`,
          {},
        );
        return { id: inv.id, lines: r.ok ? (await r.json())?.response?.data || [] : [] };
      } catch {
        return { id: inv.id, lines: [] };
      }
    }),
  );

  const linesCache = {};
  lineResults.forEach(r => { linesCache[r.id] = r.lines; });

  const documents = candidates.filter(inv => {
    const lines = linesCache[inv.id] || [];
    return lines.some(l => !l.goodsShipmentLine && Number(l.invoicedQuantity) > 0);
  });

  return { documents, sharedContext: { linesCache }, excludedByCurrency };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const cached = sharedContext?.linesCache?.[docId];
  if (cached) return enrichLines(cached);
  try {
    const res = await apiFetch(
      `${base}/purchase-invoice/lines?parentId=${docId}&_startRow=0&_endRow=200`,
      {},
    );
    return res.ok ? enrichLines((await res.json())?.response?.data || []) : [];
  } catch {
    return [];
  }
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.invoiceDate,
});

const buildLineBody = async ({ line, qty, invoiceId: receiptId, lineNo }) => ({
  parentId: receiptId,
  product: line.product,
  movementQuantity: qty,
  uOM: line.uOM || null,
  invoiceLineId: line.id,
  lineNo,
});

export default function ImportFromPurchaseInvoiceModal(props) {
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="goods-receipt/goodsReceiptLine"
      titleKey="importFromPurchaseInvoice"
      searchPlaceholderKey="searchPurchaseInvoice"
      emptyMessageKey="noCompletedPurchaseInvoicesForThisVendor"
      noSearchResultsKey="noInvoicesMatchYourSearch"
      noCurrencyMatchMessageKey="noPurchaseInvoicesMatchReceiptCurrency"
      successMessageKey="linesImportedFromPurchaseInvoice"
      showPriceColumns={false}
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
