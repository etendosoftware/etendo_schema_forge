import { useUI } from '@/i18n';
import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';

// ETP-5260 defect fix — Copy link used to render here as a topbarRight sibling
// (ETP-4721), which landed it to the RIGHT of Save/Confirm against the DF. It
// now lives in ReturnMaterialReceiptSecondaryActions (topbarSecondary, left of
// Save/Confirm). ConfirmWithCreditButtonBase is a PRIMARY action available in
// Borrador (ETP-4933) and stays here in topbarRight — do not move it.
export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl, onSave, isDirty, saveGate }) {
  const ui = useUI();
  return (
    <>
      <ConfirmWithCreditButtonBase
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        onSave={onSave}
        isDirty={isDirty}
        saveGate={saveGate}
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
