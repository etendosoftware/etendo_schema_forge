import ReturnMaterialReceiptPage from '@generated/return-material-receipt/generated/web/return-material-receipt/ReturnMaterialReceiptPage';
import ReturnMaterialReceiptPreview from './ReturnMaterialReceiptPreview';
import { useReturnReceiptPdf } from './useReturnReceiptPdf.js';
import ReturnMaterialReceiptRowConfirmModal from './ReturnMaterialReceiptRowConfirmModal.jsx';
import ReturnMaterialReceiptSecondaryActions from './ReturnMaterialReceiptSecondaryActions.jsx';
import { CONFIRM_EVENT } from './ConfirmWithCreditButton.jsx';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import { useMenuLabel } from '@/i18n';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import BulkDocumentAction, { buildInOutActions, buildPostActions, postRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';

// ETP-5408 — "Confirmar" is the generic draftMode Confirm (saveActions.jsx), the same
// button Facturas / Pedidos / Albaranes render. These values mirror decisions.json →
// window.draftMode (emitted into the generated Page); this override only adds `onConfirm`,
// which a JSON declaration cannot carry. runDraftModeConfirm saves a dirty header first,
// then calls it; ConfirmWithCreditButton (topbarRight) listens for CONFIRM_EVENT and opens
// ConfirmInOutModal. `label: 'confirm'` is the i18n key every other window uses.
// `disableWhenEmpty` replaces the old `linesCount === 0` gate of the hand-rolled button.
const DRAFT_MODE = {
  enabled: true,
  processField: 'documentAction',
  processValue: 'CO',
  label: 'confirm',
  disableWhenEmpty: true,
  onConfirm: () => window.dispatchEvent(new CustomEvent(CONFIRM_EVENT)),
};

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
        labelKey="process"
        data-testid="BulkDocumentAction__4e1c28" />
      {/* ETP-5378 — bulk Contabilizar, at parity with Goods Shipment: gated on
          processed & not-yet-posted rows. */}
      <BulkDocumentAction
        {...props}
        entity="returnMaterialReceipt"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__4e1c28" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__4e1c28" />
    </>
  );
}

export default function ReturnMaterialReceiptWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
  const tMenu = useMenuLabel();
  const { createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'sale' });
  return (
    <CreateContactContext.Provider value={createContactCtxValue}>
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
        // ETP-5260 defect fix — forwarded through ReturnWindowShell's `...pageProps`
        // and the generated ReturnMaterialReceiptPage's own `{...props}` spread
        // straight to DetailView; renders Copy link to the LEFT of Save/Confirm.
        topbarSecondary={ReturnMaterialReceiptSecondaryActions}
        // ETP-5408 — reaches DetailView the same way (the generated Page spreads `{...props}`
        // AFTER its own `draftMode`, so this one wins). See DRAFT_MODE above.
        draftMode={DRAFT_MODE}
        // ETP-5316 — Clone/duplicate is not a supported action for Customer Returns
        // (grid row action was showing it for CO rows). Mirrors sibling
        // return-to-vendor-shipment (duplicateAction={{ show: false }}), which
        // already had this suppressed. Document view has never shown Clone
        // (ReturnMaterialReceiptSecondaryActions already passes clone={false}).
        duplicateAction={{ show: false }}
        hideLink
        bulkActions={ReturnMaterialReceiptBulkActions}
        // ETP-4912 — without `usePdf` the row-hover envelope falls back to useNoPdf, so the
        // modal had no client PDF and sent the print-* artifact instead of the document the
        // preview shows. return-to-vendor-shipment now has its own `emailAction` too (ETP-5124,
        // once its backend contract-name mismatch — ETP-4717 — was fixed); each window keeps
        // its own `usePdf`/`documentType` wiring since the PDF hooks and labels differ.
        emailAction={{
          usePdf: useReturnReceiptPdf,
          documentType: tMenu('Return Material Receipt'),
          visibleWhen: "@documentStatus@='CO'",
        }}
        // ETP-5378 — row-hover Confirmar, opening the same popup
        // ConfirmWithCreditButton shows in the form.
        confirmAction={{
          ConfirmModal: ReturnMaterialReceiptRowConfirmModal,
          specName: 'return-material-receipt',
          entityName: 'returnMaterialReceipt',
          confirmedTitleKey: 'documentConfirmed',
          invoiceResultTitleKey: 'rmrInvoiceCreatedTitle',
          invoiceDocType: 'facturaVenta',
          invoiceRoute: '/sales-invoice',
        }}
        {...rest}
        data-testid="ReturnWindowShell__4e1c28" />
      {contactPortal}
    </CreateContactContext.Provider>
  );
}
