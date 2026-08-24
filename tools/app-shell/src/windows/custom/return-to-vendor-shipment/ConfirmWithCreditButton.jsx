import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';
import { useUI } from '@/i18n';

export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl, onSave, isDirty }) {
  const ui = useUI();

  return (
    <>
      {/* ETP-4721 — sibling, not extraActions: ConfirmWithCreditButtonBase
          early-returns null for any status other than DR/CO, and the
          copy-link action must stay visible regardless of document status. */}
      <CopyRecordLinkButton
        recordId={recordId}
        windowName="return-to-vendor-shipment"
        data-testid="CopyRecordLinkButton__218245" />
      <ConfirmWithCreditButtonBase
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        onSave={onSave}
        isDirty={isDirty}
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
