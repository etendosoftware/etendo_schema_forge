import { useUI } from '@/i18n';
import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';

// ETP-5408 — the Borrador "Confirmar" button is NOT rendered here: it is the generic
// draftMode Confirm (saveActions.jsx), declared in decisions.json → window.draftMode and
// overridden in index.jsx with an `onConfirm` that dispatches CONFIRM_EVENT. This topbarRight
// component only hosts the confirm flow (ConfirmWithCreditButtonBase listens for the event
// and opens ConfirmInOutModal) plus the completed-state "create invoice" action.
// ETP-5260 — Copy link lives in ReturnMaterialReceiptSecondaryActions (topbarSecondary), not here.
export const CONFIRM_EVENT = 'return-material-receipt:open-confirm-modal';

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
        entitySegment="returnMaterialReceipt"
        invoiceRoute="/sales-invoice/"
        invoiceType="facturaVenta"
        invoiceCreatedTitleKey="rmrInvoiceCreatedTitle"
        specName="return-material-receipt"
        entityName="returnMaterialReceipt"
        confirmDrLabel={ui('processReceipt')}
        confirmModalTitle={ui('returnReceipt.confirmModal.title')}
        infoRowPre={ui('returnReceipt.confirmModal.infoRowPre')}
        infoRowBold={ui('returnReceipt.confirmModal.infoRowBold')}
        infoRowPost={ui('returnReceipt.confirmModal.infoRowPost')}
        confirmWithInvoiceLabel={ui('returnReceipt.confirmModal.confirmWithInvoice')}
        postConfirmButtonLabel={ui('returnReceipt.createRectificativeInvoice')}
        cardTitle={ui('returnReceipt.createRectificativeInvoice')}
        cardDesc={ui('returnReceipt.createRectificativeInvoiceDescription')}
        data-testid="ConfirmWithCreditButtonBase__a61728" />
    </>
  );
}
