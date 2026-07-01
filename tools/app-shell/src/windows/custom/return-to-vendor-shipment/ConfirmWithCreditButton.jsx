import { generateReturnToVendorPdf, getReturnToVendorPdfLabels } from './useReturnToVendorPdf';
import ConfirmWithCreditButtonBase from '../shared/ConfirmWithCreditButtonBase';
import { useUI } from '@/i18n';

export default function ConfirmWithCreditButton({ data, recordId, token, apiBaseUrl }) {
  const ui = useUI();

  return (
    <ConfirmWithCreditButtonBase
      data={data}
      recordId={recordId}
      token={token}
      apiBaseUrl={apiBaseUrl}
      entitySegment="returnToVendorShipment"
      invoiceRoute="/purchase-invoice/"
      invoiceType="facturaCompra"
      invoiceCreatedTitleKey="returnToVendor.invoiceCreatedTitle"
      generatePdfFn={generateReturnToVendorPdf}
      getPdfLabelsFn={getReturnToVendorPdfLabels}
      specName="return-to-vendor-shipment"
      entityName="returnToVendorShipment"
      confirmDrLabel={ui('confirmReturn')}
      confirmModalTitle={ui('returnToVendor.confirmModal.title')}
      infoRowPre={ui('returnToVendor.confirmModal.infoRowPre')}
      infoRowBold={ui('returnToVendor.confirmModal.infoRowBold')}
      infoRowPost={ui('returnToVendor.confirmModal.infoRowPost')}
      confirmWithInvoiceLabel={ui('returnToVendor.confirmModal.confirmWithInvoice')}
      cardTitle={ui('returnToVendor.createCreditNote')}
      cardDesc={ui('returnToVendor.createCreditNoteDescription')}
      data-testid="ConfirmWithCreditButtonBase__218245" />
  );
}
