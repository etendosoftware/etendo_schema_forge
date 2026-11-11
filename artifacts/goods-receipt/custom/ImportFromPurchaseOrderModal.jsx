import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { newestCreatedFirst } from '@/windows/custom/shared/importActionClient.js';
import { draftDocumentsOf, fetchInOutDocuments, fetchInOutLines, isCoveredDocument, pendingDocumentTotal, pendingOf } from '@/windows/custom/shared/inOutImport.js';

// ETP-6099 — the orders and their lines come from the receipt's own read actions
// (`availableOrders` / `availableOrderLines`, inOutImport.js): the vendor's completed orders in
// the receipt's currency with quantity left to receive, drafts deducted server-side. The covered
// ones (`pendingLines: 0`, everything held by draft receipts) are listed too and hidden by
// `isDocumentCovered`. Replaced: the company-wide order list (500), the receipt header, the
// receipt list (100) and the lines of every draft receipt.
const ENTITY = 'goodsReceipt'; // the header entity of the action URLs
const SPEC = 'goods-receipt';

const CURRENCY_PROBE = Object.freeze({
  sourceHeader: 'purchase-order/header',
  isCandidate: (o) => Number(o.deliveryStatusPurchase ?? 0) < 100,
});

const fetchDocuments = ({ base, bpId, invoiceId: receiptId }) => fetchInOutDocuments({
  apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: receiptId, bpId,
  action: 'availableOrders', dateKey: 'orderDate', currencyProbe: CURRENCY_PROBE,
  // The popup always listed purchase orders newest CREATED first; the action sorts by order date.
  order: newestCreatedFirst,
});

const toOrderLine = (l) => {
  const pending = pendingOf(l);
  const unitPrice = Number(l.unitPrice) || 0;
  return {
    ...l,
    _productName: l['product$_identifier'] || l.id,
    _maxQty: pending,
    _orderedQty: Number(l.orderedQuantity) || 0,
    _unitPrice: unitPrice,
    _lineNetAmount: unitPrice * pending,
    _alreadyImported: pending <= 0,
    _inDraftShipments: draftDocumentsOf(l),
  };
};

// A line ordered at 0 or less (a return or a total-discount line) is never received from here.
const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await fetchInOutLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: sharedContext?.targetId,
    action: 'availableOrderLines', params: { orderId: docId },
  });
  return rows.map(toOrderLine).filter(l => l._orderedQty > 0);
};

const getDocDisplay = (doc) => ({
  docNo: doc.documentNo || doc.id,
  date: doc.orderDate,
});

const buildLineBody = async ({ line, qty, invoiceId: receiptId, lineNo }) => ({
  parentId: receiptId,
  product: line.product,
  movementQuantity: qty,
  // NOTE: do NOT send orderQuantity here. It maps to M_InOutLine.QuantityOrder,
  // the *secondary-UOM* order quantity, which the m_inoutline check constraint
  // requires to be NULL unless M_Product_UOM_ID is set. Single-UOM products have
  // no secondary UOM, so sending it caused a constraint violation (HTTP 500).
  uOM: line.uOM || null,
  salesOrderLine: line.id,
  lineNo,
});

const afterImport = async ({ importedDocIds, base, invoiceId }) => {
  if (importedDocIds.size !== 1) return;
  const [orderId] = importedDocIds;
  await moduleApiFetch(`${base}/goods-receipt/goodsReceipt/${invoiceId}`, {
    method: 'PATCH',
    
    body: JSON.stringify({ salesOrder: orderId }),
  });
};

export default function ImportFromPurchaseOrderModal(props) {
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
      titleKey="importFromPurchaseOrder"
      searchPlaceholderKey="searchPurchaseOrder"
      emptyMessageKey="noCompletedPurchaseOrdersWithPendingQuantitiesForThisVendor"
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey="noPurchaseOrdersMatchReceiptCurrency"
      successMessageKey="linesImportedFromPurchaseOrder"
      showPriceColumns={false}
      fetchDocuments={loaders.fetchDocuments}
      fetchLines={loaders.fetchLines}
      eagerLoadLines={false}
      isDocumentCovered={isCoveredDocument}
      getDocumentTotal={pendingDocumentTotal}
      getDocDisplay={getDocDisplay}
      buildLineBody={buildLineBody}
      afterImport={afterImport}
    />
  );
}
