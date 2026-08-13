import ImportReturnLinesModal from '@/components/import-return-lines/ImportReturnLinesModal';

const ACTION_BASE = (base) =>
  `${base}/return-material-receipt/returnMaterialReceipt/_/action`;

const SHIPMENT_CONFIG = {
  fetchSourceDocs: async (base, bpId, headers) => {
    const res = await fetch(`${ACTION_BASE(base)}/availableShipments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ businessPartner: bpId }),
    });
    if (!res.ok) return [];
    return (await res.json())?.response?.data || [];
  },
  fetchSourceLines: async (base, docId, headers) => {
    const res = await fetch(`${ACTION_BASE(base)}/availableShipmentLines`, {
      method: 'POST',
      headers,
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
