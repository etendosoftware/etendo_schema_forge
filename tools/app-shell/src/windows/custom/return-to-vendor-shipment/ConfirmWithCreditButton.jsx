import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';
import { useUI } from '@/i18n';

// ETP-5408 — the Borrador "Confirmar" button is NOT rendered here: it is the generic
// draftMode Confirm (saveActions.jsx), declared in decisions.json → window.draftMode and
// overridden in index.jsx with an `onConfirm` that dispatches CONFIRM_EVENT. This topbarRight
// component only hosts the confirm flow (ConfirmWithCreditButtonBase listens for the event
// and opens ConfirmInOutModal) plus the completed-state "create invoice" action.
// ETP-5260 — Copy link lives in ReturnToVendorShipmentSecondaryActions (topbarSecondary), not here.
export const CONFIRM_EVENT = 'return-to-vendor-shipment:open-confirm-modal';

export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl, saveGate, onRefresh, isDocumentReadOnly }) {
  const ui = useUI();

  return (
    <>
      <ConfirmWithCreditButtonBase
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        confirmEventName={CONFIRM_EVENT}
        saveGate={saveGate}
        onRefresh={onRefresh}
        isDocumentReadOnly={isDocumentReadOnly}
        entitySegment="returnToVendorShipment"
        invoiceRoute="/purchase-invoice/"
        invoiceType="facturaCompra"
        invoiceCreatedTitleKey="returnToVendor.invoiceCreatedTitle"
        specName="return-to-vendor-shipment"
        entityName="returnToVendorShipment"
        confirmDrLabel={ui('confirmReturn')}
        confirmModalTitle={ui('returnToVendor.confirmModal.title')}
        infoRowPre={ui('returnToVendor.confirmModal.infoRowPre')}
        infoRowBold={ui('returnToVendor.confirmModal.infoRowBold')}
        infoRowPost={ui('returnToVendor.confirmModal.infoRowPost')}
        confirmWithInvoiceLabel={ui('returnToVendor.confirmModal.confirmWithInvoice')}
        postConfirmButtonLabel={ui('returnToVendor.createCreditNote')}
        cardTitle={ui('returnToVendor.createCreditNote')}
        cardDesc={ui('returnToVendor.createCreditNoteDescription')}
        data-testid="ConfirmWithCreditButtonBase__218245" />
    </>
  );
}
