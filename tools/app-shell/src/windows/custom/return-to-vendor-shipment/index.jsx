import { useMemo } from 'react';
import ReturnToVendorShipmentPage from '@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/ReturnToVendorShipmentPage';
import ReturnToVendorShipmentPreview from './ReturnToVendorShipmentPreview';
import { useReturnToVendorPdf } from './useReturnToVendorPdf.js';
import ReturnToVendorShipmentRowConfirmModal from './ReturnToVendorShipmentRowConfirmModal.jsx';
import ReturnToVendorShipmentSecondaryActions from './ReturnToVendorShipmentSecondaryActions.jsx';
import { CONFIRM_EVENT } from './ConfirmWithCreditButton.jsx';
import ReturnWindowShell from '../shared/ReturnWindowShell';
import { buildReturnDraftMode } from '../shared/returnDraftMode.js';
import { useMenuLabel, useUI } from '@/i18n';
import CopyLinkButton from '@/components/contract-ui/CopyLinkButton';
import BulkDocumentAction, { buildInOutActions, buildPostActions, postRowFilter } from '@/components/contract-ui/BulkDocumentAction';
import { CreateContactContext } from '@/components/contract-ui/CreateContactContext.js';
import { useCreateContactModal } from '@/components/contract-ui/useCreateContactModal.jsx';

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
        labelKey="process"
        data-testid="BulkDocumentAction__a5f79c" />
      {/* ETP-5378 — bulk Contabilizar, at parity with Goods Shipment: gated on
          processed & not-yet-posted rows. */}
      <BulkDocumentAction
        {...props}
        entity="returnToVendorShipment"
        actionMode="neoAction"
        buildActions={buildPostActions}
        rowFilter={postRowFilter}
        labelKey="post"
        data-testid="BulkDocumentActionPost__a5f79c" />
      <CopyLinkButton
        selectedRows={props.selectedRows}
        windowName={props.windowName}
        data-testid="CopyLinkButton__a5f79c" />
    </>
  );
}

export default function ReturnToVendorShipmentWindow({ windowName, recordId, apiBaseUrl, token, ...rest }) {
  const tMenu = useMenuLabel();
  const ui = useUI();
  const draftMode = useMemo(() => buildReturnDraftMode(ui, CONFIRM_EVENT), [ui]);
  const { createContactCtxValue, contactPortal } =
    useCreateContactModal({ apiBaseUrl, token, documentType: 'purchase' });
  return (
    <CreateContactContext.Provider value={createContactCtxValue}>
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
        // ETP-5260 defect fix — forwarded through ReturnWindowShell's `...pageProps`
        // and the generated ReturnToVendorShipmentPage's own `{...props}` spread
        // straight to DetailView; renders Copy link to the LEFT of Save/Confirm.
        topbarSecondary={ReturnToVendorShipmentSecondaryActions}
        // ETP-5408 — wins over the generated Page's own `draftMode` (it spreads `{...props}` after).
        draftMode={draftMode}
        duplicateAction={{ show: false }}
        hideLink
        bulkActions={ReturnToVendorShipmentBulkActions}
        // ETP-5124 — re-added `emailAction` now that the backend registers a correctly
        // named contract (`return-to-vendor-shipment-send`, matching this window's
        // `${windowName}-send` derivation) via `ReturnToVendorShipmentSendEmailContract`.
        // The prior ETP-4717 removal (contract-name mismatch — see docs/feedback.md) no
        // longer applies.
        emailAction={{
          usePdf: useReturnToVendorPdf,
          documentType: tMenu('Return to Vendor Shipment'),
          visibleWhen: "@documentStatus@='CO'",
        }}
        // ETP-5378 — row-hover Confirmar, opening the same popup
        // ConfirmWithCreditButton shows in the form.
        confirmAction={{
          ConfirmModal: ReturnToVendorShipmentRowConfirmModal,
          specName: 'return-to-vendor-shipment',
          entityName: 'returnToVendorShipment',
          confirmedTitleKey: 'documentConfirmed',
          invoiceResultTitleKey: 'returnToVendor.invoiceCreatedTitle',
          invoiceDocType: 'facturaCompra',
          invoiceRoute: '/purchase-invoice',
        }}
        {...rest}
        data-testid="ReturnWindowShell__a5f79c" />
      {contactPortal}
    </CreateContactContext.Provider>
  );
}
