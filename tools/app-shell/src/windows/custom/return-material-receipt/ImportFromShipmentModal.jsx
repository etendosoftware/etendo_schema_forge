import ImportReturnLinesModal from '@/components/import-return-lines/ImportReturnLinesModal';
import { apiFetch } from '@/auth/api.js';

const ACTION_BASE = (base) =>
  `${base}/return-material-receipt/returnMaterialReceipt/_/action`;

const SHIPMENT_CONFIG = {
  // `headers` is kept for signature compatibility with the caller
  // (ImportReturnLinesModal builds and passes it) but is no longer used here —
  // apiFetch derives the auth headers from the ambient session.
  fetchSourceDocs: async (base, bpId, headers) => {
    const res = await apiFetch(`${ACTION_BASE(base)}/availableShipments`, {
      baseUrl: '',
      method: 'POST',
      body: JSON.stringify({ businessPartner: bpId }),
    });
    if (!res.ok) return [];
    return (await res.json())?.response?.data || [];
  },
  fetchSourceLines: async (base, docId, headers) => {
    const res = await apiFetch(`${ACTION_BASE(base)}/availableShipmentLines`, {
      baseUrl: '',
      method: 'POST',
      body: JSON.stringify({ shipmentId: docId }),
    });
    if (!res.ok) return [];
    return (await res.json())?.response?.data || [];
  },
  importActionUrl: (base, targetId) =>
    `${base}/return-material-receipt/returnMaterialReceipt/${targetId}/action/importShipmentLines`,
  titleKey: 'importFromShipment',
  searchPlaceholderKey: 'searchShipment',
  noDocsKey: 'noCompletedShipmentsForThisCustomer',
  noDocsMatchSearchKey: 'noShipmentsMatchYourSearch',
  successToastKey: 'linesImportedFromShipment',
  dateField: 'movementDate',
  showAmount: false,
  qtyStep: 1,
};

export default function ImportFromShipmentModal(props) {
  return (
    <ImportReturnLinesModal
      {...props}
      config={SHIPMENT_CONFIG}
      data-testid="ImportReturnLinesModal__7efa65" />
  );
}
