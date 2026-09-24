import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch } from '@/auth/api.js';
import { enrichReturnLine, getReturnDocDisplay, submitReturnImportBatch } from '@/windows/custom/shared/importReturnLinesHelpers.js';

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
  return raw.map(enrichReturnLine);
};

const submitImport = (args) => submitReturnImportBatch({ ...args, actionUrl: IMPORT_ACTION_URL });

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
      getDocDisplay={getReturnDocDisplay}
      submitImport={submitImport}
      showPriceColumns={false}
      filterZeroQty
      autoSelectOnExpand
      eagerLoadLines={false}
      showAvailableQtyColumn
      qtyColumnLabelKey="returnQty"
      data-testid="ImportLinesModal__ebdfa3" />
  );
}
