import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';
import { useUI } from '@/i18n';

// ETP-5260 defect fix — Copy link used to render here as a topbarRight sibling
// (ETP-4721), which landed it to the RIGHT of Save/Confirm against the DF. It
// now lives in ReturnToVendorShipmentSecondaryActions (topbarSecondary, left
// of Save/Confirm). ConfirmWithCreditButtonBase is a PRIMARY action available
// in Borrador (ETP-4933) and stays here in topbarRight — do not move it.
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
