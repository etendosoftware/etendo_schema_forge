import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { draftDocumentsOf, fetchInOutDocuments, fetchInOutLines, isCoveredDocument, pendingDocumentTotal, pendingOf } from '@/windows/custom/shared/inOutImport.js';

// ETP-6099 — the invoices and their lines come from the receipt's own read actions
// (`availableInvoices` / `availableInvoiceLines`, inOutImport.js): completed invoices of the
// vendor with a non-negative total, in the receipt's currency, newest created first, each line with
// the server's default pending, as on the goods shipment's sibling (ImportFromSalesInvoiceModal):
// what is left to receive, draft receipts deducted (this one too), a line another draft receipt holds
// named under it («en albarán: …»). ETP-5828 QA UI-8 reversed the `pendingBasis: 'classic'` product
// decision (full invoiced quantity until linked, no draft deduction): it let the same invoice line be
// received twice. The covered invoices (`pendingLines: 0`) are listed too and hidden by
// `isDocumentCovered`. The row total is the invoice's pending `amount` (`detail`, ETP-5828 QA UI-9;
// it used to be 0,00), and once the lines are loaded it follows them, priced with their `unitPrice`.
// Replaced: the company-wide invoice list (500), the receipt header and the lines of EVERY candidate
// invoice read at open to drop the fully linked ones.
const ENTITY = 'goodsReceipt'; // the header entity of the action URLs
const SPEC = 'goods-receipt';

const CURRENCY_PROBE = Object.freeze({
  sourceHeader: 'purchase-invoice/header',
  isCandidate: (o) => Number(o.grandTotalAmount ?? 0) >= 0,
});

const fetchDocuments = ({ base, bpId, invoiceId: receiptId }) => fetchInOutDocuments({
  apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: receiptId, bpId,
  action: 'availableInvoices', dateKey: 'invoiceDate', currencyProbe: CURRENCY_PROBE,
});

const toInvoiceLine = (l) => {
  const pending = pendingOf(l);
  const unitPrice = Number(l.unitPrice) || 0;
  return {
    ...l,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: pending,
    _unitPrice: unitPrice,
    _lineNetAmount: unitPrice * pending,
    _alreadyImported: pending === 0,
    _inDraftShipments: draftDocumentsOf(l),
  };
};

// Only lines invoiced in a positive quantity are received from here.
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await fetchInOutLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: sharedContext?.targetId,
    action: 'availableInvoiceLines', params: { invoiceId: docId },
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
      getDocumentTotal={pendingDocumentTotal}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
    />
  );
}
