import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { apiFetch as moduleApiFetch } from '@/auth/api.js';
import useImportLoadFailureToast from '@/windows/custom/shared/useImportLoadFailureToast.js';
import { draftDocumentsOf, fetchInOutDocuments, fetchInOutLines, isCoveredDocument, pendingDocumentTotal, pendingOf } from '@/windows/custom/shared/inOutImport.js';

// ETP-6099 — the orders and their lines come from the shipment's own read actions
// (`availableOrders` / `availableOrderLines`, inOutImport.js): the customer's completed orders in
// the shipment's currency with quantity left to deliver, drafts deducted server-side. The covered
// ones (`pendingLines: 0`, everything held by draft shipments) are listed too and hidden by
// `isDocumentCovered`. Replaced: the company-wide order list (500), the shipment header, the
// shipment list (100) and the lines of every draft shipment.
const ENTITY = 'goodsShipment'; // the header entity of the action URLs
const SPEC = 'goods-shipment';

const CURRENCY_PROBE = Object.freeze({
  sourceHeader: 'sales-order/header',
  isCandidate: (o) => Number(o.deliveryStatus ?? 100) < 100,
});

const fetchDocuments = ({ base, bpId, invoiceId: shipmentId }) => fetchInOutDocuments({
  apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: shipmentId, bpId,
  action: 'availableOrders', dateKey: 'orderDate', currencyProbe: CURRENCY_PROBE,
});

const toOrderLine = (l) => {
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

const fetchLines = async ({ base, docId, sharedContext }) => {
  const rows = await fetchInOutLines({
    apiFetch: moduleApiFetch, base, spec: SPEC, entity: ENTITY, targetId: sharedContext?.targetId,
    action: 'availableOrderLines', params: { orderId: docId },
  });
  return rows.map(toOrderLine);
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
      titleKey="addFromSalesOrder"
      searchPlaceholderKey="searchSalesOrder"
      emptyMessageKey="noCompletedSalesOrdersForThisCustomer"
      noSearchResultsKey="noOrdersMatchYourSearch"
      noCurrencyMatchMessageKey="noSalesOrdersMatchShipmentCurrency"
      successMessageKey="linesImportedFromSalesOrder"
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
