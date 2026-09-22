import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch } from '@/auth/api.js';

const ACTION_BASE = (base) =>
  `${base}/return-material-receipt/returnMaterialReceipt/_/action`;
const IMPORT_ACTION_URL = (base, targetId) =>
  `${base}/return-material-receipt/returnMaterialReceipt/${targetId}/action/importShipmentLines`;

const fetchDocuments = async ({ base, bpId }) => {
  const res = await apiFetch(`${ACTION_BASE(base)}/availableShipments`, {
    baseUrl: '', method: 'POST', body: JSON.stringify({ businessPartner: bpId }),
  });
  const documents = res.ok ? (await res.json())?.response?.data || [] : [];
  return { documents, sharedContext: {} };
};

const fetchLines = async ({ base, docId }) => {
  const res = await apiFetch(`${ACTION_BASE(base)}/availableShipmentLines`, {
    baseUrl: '', method: 'POST', body: JSON.stringify({ shipmentId: docId }),
  });
  if (!res.ok) return [];
  const raw = (await res.json())?.response?.data || [];
  return raw.map((line) => ({
    ...line,
    _maxQty: Math.max(0, Number(line.movementQuantity) || 0),
    _productName: line['product$_identifier'] || line.id,
  }));
};

const getDocDisplay = (doc) => ({ docNo: doc.documentNo || doc.id, date: doc.movementDate });

const submitImport = async ({ lines, base, invoiceId }) => {
  const res = await apiFetch(IMPORT_ACTION_URL(base, invoiceId), {
    baseUrl: '',
    method: 'POST',
    body: JSON.stringify({ lines: lines.map(({ line, qty }) => ({ sourceLineId: line.id, returnQuantity: qty })) }),
  });
  if (!res.ok) return { ok: false };
  const body = await res.json();
  return { ok: true, count: body?.response?.data?.importedCount ?? lines.length };
};

export default function ImportFromShipmentModal({ targetId, ...props }) {
  return (
    <ImportLinesModal
      {...props}
      invoiceId={targetId}
      titleKey="importFromShipment"
      searchPlaceholderKey="searchShipment"
      emptyMessageKey="noCompletedShipmentsForThisCustomer"
      noSearchResultsKey="noShipmentsMatchYourSearch"
      successMessageKey="linesImportedFromShipment"
      fetchDocuments={fetchDocuments}
      fetchLines={fetchLines}
      getDocDisplay={getDocDisplay}
      submitImport={submitImport}
      showPriceColumns={false}
      filterZeroQty
      autoSelectOnExpand
      eagerLoadLines={false}
      showAvailableQtyColumn
      qtyColumnLabelKey="returnQty"
    />
  );
}
