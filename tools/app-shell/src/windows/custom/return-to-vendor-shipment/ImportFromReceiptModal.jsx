import { apiFetch } from '@/auth/api.js';
import ImportReturnLinesModal from '@/components/import-return-lines/ImportReturnLinesModal';

const ACTION_BASE = (base) =>
  `${base}/return-to-vendor-shipment/returnToVendorShipment/_/action`;

const RECEIPT_CONFIG = {
  // `headers` is kept in the signature — callers outside this file (ImportReturnLinesModal)
  // still pass it — but it is now dead: apiFetch supplies the auth headers itself.
  fetchSourceDocs: async (base, bpId, headers) => {
    const res = await apiFetch(`${ACTION_BASE(base)}/availableReceipts`, {
      method: 'POST',
      baseUrl: '',
      body: JSON.stringify({ businessPartner: bpId }),
    });
    if (!res.ok) return [];
    return (await res.json())?.response?.data || [];
  },
  fetchSourceLines: async (base, docId, headers) => {
    const res = await apiFetch(`${ACTION_BASE(base)}/availableReceiptLines`, {
      method: 'POST',
      baseUrl: '',
      body: JSON.stringify({ receiptId: docId }),
    });
    if (!res.ok) return [];
    return (await res.json())?.response?.data || [];
  },
  importActionUrl: (base, targetId) =>
    `${base}/return-to-vendor-shipment/returnToVendorShipment/${targetId}/action/importReceiptLines`,
  titleKey: 'importFromReceipt',
  searchPlaceholderKey: 'searchReceipt',
  noDocsKey: 'noCompletedReceiptsForThisVendor',
  noDocsMatchSearchKey: 'noReceiptsMatchYourSearch',
  successToastKey: 'linesImportedFromReceipt',
  dateField: 'movementDate',
  showAmount: false,
  qtyStep: 1,
};

export default function ImportFromReceiptModal({ bpId, ...props }) {
  const config = {
    ...RECEIPT_CONFIG,
    fetchSourceLines: async (base, docId, headers) => {
      const res = await apiFetch(`${ACTION_BASE(base)}/availableReceiptLines`, {
        method: 'POST',
        baseUrl: '',
        body: JSON.stringify({ receiptId: docId, businessPartner: bpId }),
      });
      if (!res.ok) return [];
      return (await res.json())?.response?.data || [];
    },
  };
  return (
    <ImportReturnLinesModal
      bpId={bpId}
      {...props}
      config={config}
      data-testid="ImportReturnLinesModal__ebdfa3" />
  );
}
