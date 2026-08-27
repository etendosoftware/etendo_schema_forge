import ReturnToVendorShipmentPage from '@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage';
import ReturnToVendorShipmentPreview from './ReturnToVendorShipmentPreview';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';

// ETP-4857 — bulk "Confirmar" for Borrador rows, at parity with Goods Shipment.
// buildInOutActions only offers CO (confirm) when a draft is selected; it never
// offers RE (reactivate) for completed rows — this window must stay DR→CO only.
function ReturnToVendorShipmentBulkActions(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="returnToVendorShipment"
        buildActions={buildInOutActions}
        labelKey="confirmBulk"
        data-testid="BulkDocumentAction__a5f79c" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__a5f79c" />
    </>
  );
}

export default function ReturnToVendorShipmentWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
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
      // ETP-4717 — no `emailAction`: the row-hover "Enviar" trigger this window had
      // (ETP-4718) called an email contract (`${windowName}-send`) the backend never
      // registered (it only has `return-to-vendor-send`), so every send failed with
      // "Unknown email contract". QA asked to remove the action outright rather than
      // reconcile the name. `decisions.json → window.sendDocument.enabled: false`
      // already suppresses the row Email icon via `sendDocument` threaded into
      // RowQuickActions (it takes precedence over `documentPreview`); omitting
      // `emailAction` here too keeps this window consistent with the sibling
      // `return-material-receipt` (same shell, no `emailAction`, no live trigger).
      {...rest}
      data-testid="ReturnWindowShell__a5f79c" />
  );
}
