import ReturnToVendorShipmentPage from '@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage';
import ReturnToVendorShipmentPreview from './ReturnToVendorShipmentPreview';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import { useReturnToVendorPdf } from './useReturnToVendorPdf.js';
import { useMenuLabel } from '@/i18n';

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
