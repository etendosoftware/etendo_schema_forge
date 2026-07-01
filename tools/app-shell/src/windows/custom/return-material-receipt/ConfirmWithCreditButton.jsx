import { useUI } from '@/i18n';
import { generateReturnReceiptPdf, getReturnReceiptPdfLabels } from './useReturnReceiptPdf';
import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';

export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();
  return (
    <ConfirmWithCreditButtonBase
      data={data}
      recordId={recordId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      entitySegment="returnMaterialReceipt"
      invoiceRoute="/sales-invoice/"
      invoiceType="facturaVenta"
      invoiceCreatedTitleKey="rmrInvoiceCreatedTitle"
      generatePdfFn={generateReturnReceiptPdf}
      getPdfLabelsFn={getReturnReceiptPdfLabels}
      specName="return-material-receipt"
      entityName="returnMaterialReceipt"
      confirmDrLabel={ui('processReceipt')}
      confirmModalTitle={ui('returnReceipt.confirmModal.title')}
      infoRowPre={ui('returnReceipt.confirmModal.infoRowPre')}
      infoRowBold={ui('returnReceipt.confirmModal.infoRowBold')}
      infoRowPost={ui('returnReceipt.confirmModal.infoRowPost')}
      confirmWithInvoiceLabel={ui('returnReceipt.confirmModal.confirmWithInvoice')}
      data-testid="ConfirmWithCreditButtonBase__a61728" />
  );
}
