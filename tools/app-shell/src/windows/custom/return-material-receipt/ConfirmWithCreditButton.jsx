import { useUI } from '@/i18n';
import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';
import CopyRecordLinkButton from '@/components/contract-ui/CopyRecordLinkButton';

export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  return (
    <>
      {/* ETP-4721 — rendered as a sibling, not via ConfirmWithCreditButtonBase's
          extraActions, because the base component early-returns null for any
          status other than DR/CO. The copy-link action must stay visible for
          every persisted record regardless of document status. */}
      <CopyRecordLinkButton
        recordId={recordId}
        windowName="return-material-receipt"
        data-testid="CopyRecordLinkButton__a61728" />
      <ConfirmWithCreditButtonBase
        data={data}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
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
