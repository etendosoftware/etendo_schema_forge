import ReturnToVendorShipmentPage from '@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage';
import ReturnToVendorShipmentPreview from './ReturnToVendorShipmentPreview';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import { useReturnToVendorPdf } from './useReturnToVendorPdf.js';
import { useMenuLabel } from '@/i18n';

function ReturnToVendorShipmentBulkActions({ selectedRows, windowName }) {
  return (
    <CopyLinkButton
      selectedRows={selectedRows}
      windowName={windowName}
      data-testid="CopyLinkButton__a5f79c" />
  );
}

export default function ReturnToVendorShipmentWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
  const tMenu = useMenuLabel();

  return (
    <ReturnWindowShell
      windowName={windowName}
      recordId={recordId}
      apiBaseUrl={apiBaseUrl}
      token={token}
      PageComponent={ReturnToVendorShipmentPage}
      renderPreview={({ row, onClose, onEdit }) => (
        <ReturnToVendorShipmentPreview
          shipment={row}
          token={token}
          apiBaseUrl={apiBaseUrl}
          windowName={windowName}
          onClose={onClose}
          onEdit={onEdit}
          data-testid="ReturnToVendorShipmentPreview__a5f79c" />
      )}
      entity="returnToVendorShipment"
      headerEntity="returnToVendorShipment"
      routePrefix="/return-to-vendor-shipment/"
      duplicateAction={{ show: false }}
      hideLink
      bulkActions={ReturnToVendorShipmentBulkActions}
      // ETP-4718 — row-hover "Enviar" is only meaningful once the document is
      // Confirmado (documentStatus === 'CO'); Borrador has nothing to send yet.
      emailAction={{
        usePdf: useReturnToVendorPdf,
        documentType: tMenu('Return to Vendor Shipment'),
        visibleWhen: "@documentStatus@='CO'",
      }}
      {...rest}
      data-testid="ReturnWindowShell__a5f79c" />
  );
}
