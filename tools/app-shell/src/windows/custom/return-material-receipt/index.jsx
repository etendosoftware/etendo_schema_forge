import ReturnMaterialReceiptPage from '@generated/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage';
import ReturnMaterialReceiptPreview from './ReturnMaterialReceiptPreview';
import { useReturnReceiptPdf } from './useReturnReceiptPdf.js';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import { useMenuLabel } from '@/i18n';
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
  const tMenu = useMenuLabel();
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
      // ETP-4912 — without `usePdf` the row-hover envelope falls back to useNoPdf, so the
      // modal had no client PDF and sent the print-* artifact instead of the document the
      // preview shows. return-to-vendor-shipment has NO emailAction (removed under ETP-4717
      // due to a backend contract-name mismatch) — this window keeps its own on purpose.
      emailAction={{
        usePdf: useReturnReceiptPdf,
        documentType: tMenu('Return Material Receipt'),
        visibleWhen: "@documentStatus@='CO'",
      }}
      {...rest}
      data-testid="ReturnWindowShell__4e1c28" />
  );
}
