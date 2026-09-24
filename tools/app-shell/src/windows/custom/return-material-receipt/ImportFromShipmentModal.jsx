import ImportLinesModal from '@/components/contract-ui/ImportLinesModal';
import { apiFetch } from '@/auth/api.js';
import { enrichReturnLine, getReturnDocDisplay, submitReturnImportBatch } from '@/windows/custom/shared/importReturnLinesHelpers.js';

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
  return raw.map(enrichReturnLine);
};

const submitImport = (args) => submitReturnImportBatch({ ...args, actionUrl: IMPORT_ACTION_URL });

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
      getDocDisplay={getReturnDocDisplay}
      submitImport={submitImport}
      showPriceColumns={false}
      filterZeroQty
      autoSelectOnExpand
      eagerLoadLines={false}
      showAvailableQtyColumn
      qtyColumnLabelKey="returnQty"
      data-testid="ImportLinesModal__7efa65" />
  );
}
