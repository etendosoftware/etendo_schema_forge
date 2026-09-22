import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch } from '@/auth/api.js';

const ACTION_BASE = (base) =>
  `${base}/return-to-vendor-shipment/returnToVendorShipment/_/action`;
const IMPORT_ACTION_URL = (base, targetId) =>
  `${base}/return-to-vendor-shipment/returnToVendorShipment/${targetId}/action/importReceiptLines`;

const fetchDocuments = async ({ base, bpId }) => {
  const res = await apiFetch(`${ACTION_BASE(base)}/availableReceipts`, {
    baseUrl: '', method: 'POST', body: JSON.stringify({ businessPartner: bpId }),
  });
  const documents = res.ok ? (await res.json())?.response?.data || [] : [];
  return { documents, sharedContext: {} };
};

// receiptId AND businessPartner are both sent — a receipt can be shared across
// vendors, so the line list must stay scoped to the vendor of the return being built.
const fetchLines = async ({ base, docId, bpId }) => {
  const res = await apiFetch(`${ACTION_BASE(base)}/availableReceiptLines`, {
    baseUrl: '', method: 'POST', body: JSON.stringify({ receiptId: docId, businessPartner: bpId }),
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

export default function ImportFromReceiptModal({ targetId, bpId, ...props }) {
  return (
    <ImportLinesModal
      {...props}
      bpId={bpId}
      invoiceId={targetId}
      titleKey="importFromReceipt"
      searchPlaceholderKey="searchReceipt"
      emptyMessageKey="noCompletedReceiptsForThisVendor"
      noSearchResultsKey="noReceiptsMatchYourSearch"
      successMessageKey="linesImportedFromReceipt"
      fetchDocuments={fetchDocuments}
      fetchLines={({ base, docId }) => fetchLines({ base, docId, bpId })}
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
