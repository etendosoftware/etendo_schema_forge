import ReturnMaterialReceiptPage from '@generated/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage';
import ReturnMaterialReceiptPreview from './ReturnMaterialReceiptPreview';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';

// ETP-4857 — bulk "Confirmar" for Borrador rows, at parity with Goods Shipment.
// buildInOutActions only offers CO (confirm) when a draft is selected; it never
// offers RE (reactivate) for completed rows — this window must stay DR→CO only.
function ReturnMaterialReceiptBulkActions(props) {
  return (
    <>
      <BulkDocumentAction
        {...props}
        entity="returnMaterialReceipt"
        buildActions={buildInOutActions}
        labelKey="confirmBulk"
        data-testid="BulkDocumentAction__4e1c28" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__4e1c28" />
    </>
  );
}

export default function ReturnMaterialReceiptWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
  return (
    <ReturnWindowShell
      windowName={windowName}
      recordId={recordId}
      apiBaseUrl={apiBaseUrl}
      token={token}
      PageComponent={ReturnMaterialReceiptPage}
      renderPreview={({ row, onClose, onEdit }) => (
        <ReturnMaterialReceiptPreview
          receipt={row}
          token={token}
          apiBaseUrl={apiBaseUrl}
          windowName={windowName}
          onClose={onClose}
          onEdit={onEdit}
          data-testid="ReturnMaterialReceiptPreview__4e1c28" />
      )}
      entity="returnMaterialReceipt"
      headerEntity="returnMaterialReceipt"
      routePrefix="/return-material-receipt/"
      duplicateAction={{ show: true, visibleWhen: "@documentStatus@='CO'" }}
      hideLink
      bulkActions={ReturnMaterialReceiptBulkActions}
      {...rest}
      data-testid="ReturnWindowShell__4e1c28" />
  );
}
