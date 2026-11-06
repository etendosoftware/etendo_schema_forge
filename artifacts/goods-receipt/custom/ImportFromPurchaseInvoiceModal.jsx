import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { fetchInOutDocuments, fetchInOutLines, isCoveredDocument, pendingOf, zeroDocumentTotal } from '@/windows/custom/shared/inOutImport.js';

// ETP-6099 — the invoices and their lines come from the receipt's own read actions
// (`availableInvoices` / `availableInvoiceLines`, inOutImport.js): completed invoices of the
// vendor with a non-negative total, in the receipt's currency, newest created first, each line with
// the server's pending under `pendingBasis: 'classic'` (product decision), which keeps this popup's
// rule from before it read the actions: 0 once the invoice line is linked to a receipt line,
// otherwise its full invoiced quantity — draft receipts are NOT deducted, so a line another draft
// receipt holds is offered in full, with no «in draft» note (the old popup showed none). The covered
// invoices (`pendingLines: 0`) are listed too and hidden by `isDocumentCovered`. Replaced: the company-wide invoice list (500), the receipt header
// and the lines of EVERY candidate invoice read at open to drop the fully linked ones.
const ENTITY = 'goodsReceipt'; // the header entity of the action URLs
const SPEC = 'goods-receipt';
const CLASSIC_PENDING = Object.freeze({ pendingBasis: 'classic' }); // both reads

const CURRENCY_PROBE = Object.freeze({
  sourceHeader: 'purchase-invoice/header',
  isCandidate: (o) => Number(o.grandTotalAmount ?? 0) >= 0,
});

const fetchDocuments = ({ base, bpId, invoiceId: receiptId }) => fetchInOutDocuments({
  apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: receiptId, bpId,
  action: 'availableInvoices', dateKey: 'invoiceDate', currencyProbe: CURRENCY_PROBE, params: CLASSIC_PENDING,
});

const toInvoiceLine = (l) => {
  const pending = pendingOf(l);
  return {
    ...l,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: pending,
    _alreadyImported: pending === 0,
  };
};

// Only lines invoiced in a positive quantity are received from here.
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await fetchInOutLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: sharedContext?.targetId,
    action: 'availableInvoiceLines', params: { ...CLASSIC_PENDING, invoiceId: docId },
  });
  return rows.filter(l => Number(l.invoicedQuantity) > 0).map(toInvoiceLine);
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
  const loaders = useImportLoadFailureToast(fetchDocuments, fetchLines);
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
      fetchDocuments={loaders.fetchDocuments}
      fetchLines={loaders.fetchLines}
      eagerLoadLines={false}
      isDocumentCovered={isCoveredDocument}
      getDocumentTotal={zeroDocumentTotal}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
