import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { draftDocumentsOf, fetchInOutDocuments, fetchInOutLines, isCoveredDocument, pendingOf, zeroDocumentTotal } from '@/windows/custom/shared/inOutImport.js';

// ETP-6099 — the invoices and their lines come from the shipment's own read actions
// (`availableInvoices` / `availableInvoiceLines`, inOutImport.js). The server applies what the
// popup filtered here before: completed, plain invoices of the customer (not rectificative — ETP-6002
// IMP-3: a rectificative delivers nothing) in the shipment's currency, newest created first, and the
// pending per line — with an order line: invoiced − delivered − drafts (this shipment included);
// without one: 0 once the invoice line points at a shipment line, else the invoiced quantity. The
// covered invoices (`pendingLines: 0`) are listed too and hidden by `isDocumentCovered`, so the
// popup still says «all already imported». Replaced: the company-wide invoice list (500), the
// shipment header, the shipment list (100), the lines of every draft shipment and, per expanded
// invoice, the lines of its sales order.
const ENTITY = 'goodsShipment'; // the header entity of the action URLs
const SPEC = 'goods-shipment';

// The «no invoices in this currency» probe (only when nothing is listed): plain invoices only,
// the same criteria as ImportFromSourceInvoiceModal and the «Facturas» subset filter.
const CURRENCY_PROBE = Object.freeze({
  sourceHeader: 'sales-invoice/header',
  criteria: Object.freeze([
    { fieldName: 'transactionDocument$documentCategory', operator: 'equals', value: 'ARI' },
    { fieldName: 'transactionDocument$etsgIsRectificative', operator: 'notEqual', value: true },
  ]),
});

const fetchDocuments = ({ base, bpId, invoiceId: shipmentId }) => fetchInOutDocuments({
  apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: shipmentId, bpId,
  action: 'availableInvoices', dateKey: 'invoiceDate', currencyProbe: CURRENCY_PROBE,
});

const toInvoiceLine = (l) => {
  const pending = pendingOf(l);
  return {
    ...l,
    _orderLineId: l.orderLine || undefined,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: pending,
    _unitPrice: 0,
    _lineNetAmount: 0,
    _alreadyImported: pending === 0,
    _inDraftShipments: draftDocumentsOf(l),
  };
};

const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await fetchInOutLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: sharedContext?.targetId,
    action: 'availableInvoiceLines', params: { invoiceId: docId },
  });
  return rows.map(toInvoiceLine);
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
  // ETP-4576 - the credential belongs to apiFetch, not to the component.
  // Empty base ON PURPOSE: these modals pull from ANOTHER spec than their own window
  // (an invoice importing shipment lines), and resolveApiUrl only skips a prefix that
  // matches - so a configured base doubles it and 404s.
  const apiFetch = useApiFetch('');
  const loaders = useImportLoadFailureToast(fetchDocuments, fetchLines);
  return (
    <ImportLinesModal
      {...props}
      linesEndpoint="goods-shipment/goodsShipmentLine"
      titleKey="importFromSalesInvoice"
      searchPlaceholderKey="searchSalesInvoice"
      emptyMessageKey="noCompletedSalesInvoicesForThisCustomer"
      noSearchResultsKey="noInvoicesMatchYourSearch"
      noCurrencyMatchMessageKey="noSalesInvoicesMatchShipmentCurrency"
      allImportedMessageKey="allSalesInvoicesAlreadyImported"
      successMessageKey="linesImportedFromSalesInvoice"
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
