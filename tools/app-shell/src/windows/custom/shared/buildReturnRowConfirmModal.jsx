import { useUI } from '@/i18n';
import ConfirmInOutModal from '@/components/contract-ui/ConfirmInOutModal';

/**
 * ETP-5378 — shared shape for the row-hover Confirmar popup on both return windows, fed
 * to useRowConfirmAction as its `ConfirmModal`. Mirrors the DR-status branch of
 * ConfirmWithCreditButtonBase's own ConfirmInOutModal call — the exact popup the form
 * shows on these same windows (return-{material-receipt,to-vendor-shipment}/
 * ConfirmWithCreditButton.jsx) — so confirming from the grid behaves identically to
 * confirming from the form, including the fully-invoiced degraded mode: `invoiceAction`
 * is left undefined once the document is already 100% invoiced, since
 * `createReturnInvoice` would have nothing left to invoice.
 *
 * Sonar flagged ReturnMaterialReceiptRowConfirmModal.jsx and
 * ReturnToVendorShipmentRowConfirmModal.jsx as 35.7% duplicated — they differed only in
 * specName/entityName and which i18n keys to read. Each window's own file now just
 * supplies that `config` to this factory, called once at module scope so the returned
 * component keeps a stable identity across renders (not re-created per render).
 *
 * @param {object} config
 * @param {string} config.specName    NEO spec segment, e.g. "return-material-receipt"
 * @param {string} config.entityName  entity segment, e.g. "returnMaterialReceipt"
 * @param {string} config.titleKey                 i18n key for the popup title
 * @param {string} config.infoRowPreKey             i18n key for the summary's lead text
 * @param {string} config.infoRowBoldKey            i18n key for the summary's bold word
 * @param {string} config.infoRowPostKey            i18n key for the summary's trailing text
 * @param {string} config.cardTitleKey               i18n key for the "create invoice" card title
 * @param {string} config.cardDescKey                i18n key for the "create invoice" card description
 * @param {string} config.confirmLabelKey            i18n key for the plain confirm button
 * @param {string} config.confirmWithInvoiceLabelKey i18n key for the confirm-with-invoice button
 * @param {string} config.testId      data-testid for the rendered ConfirmInOutModal
 * @returns {Function} a `{ base, headers, token, recordId, data, onConfirmed, onClose }` component
 */
export function buildReturnRowConfirmModal(config) {
  return function ReturnRowConfirmModal({ base, headers, token, recordId, data, onConfirmed, onClose }) {
    const ui = useUI();
    const isFullyInvoiced = parseFloat(data?.invoiceStatus ?? 0) >= 100;
    // ETP-5378 QA follow-up (CP-10 / CP-15) — the SAME picker the form shows. Without this URL
    // `rectifyActive` stays false in ConfirmInOutModal, so the popup rendered no "Factura a
    // rectificar" field, `originInvoices` never reached createReturnInvoice, and the backend
    // fell back to chain auto-detection. On a return with no invoiced origin that detection
    // finds nothing and answers 400 (ERR_RECTIFIED_INVOICE_REQUIRED) — but only AFTER the
    // separate documentAction POST has already committed, leaving the document Completed with
    // no invoice and no way back from the UI. Supplying the URL also arms the `rectify.isSatisfied`
    // gate in `canConfirm`, so the confirm button stays disabled until an invoice is picked and
    // that request can no longer be sent empty.
    const rectifiableInvoicesUrl =
      `${base}/${config.specName}/${config.entityName}/${data?.id || recordId}/action/rectifiableInvoices`;
    return (
      <ConfirmInOutModal
        base={base}
        headers={headers}
        recordId={recordId}
        specName={config.specName}
        entityName={config.entityName}
        invoiceAction={isFullyInvoiced ? undefined : 'createReturnInvoice'}
        defaultCreateInvoice={!isFullyInvoiced}
        rectifiableInvoicesUrl={rectifiableInvoicesUrl}
        token={token}
        title={ui(config.titleKey)}
        docInfo={{ bpName: data?.['businessPartner$_identifier'], documentNo: data?.documentNo }}
        infoRowPre={ui(config.infoRowPreKey)}
        infoRowBold={ui(config.infoRowBoldKey)}
        infoRowPost={ui(config.infoRowPostKey)}
        cardTitle={ui(config.cardTitleKey)}
        cardDesc={ui(config.cardDescKey)}
        confirmLabel={ui(config.confirmLabelKey)}
        confirmWithInvoiceLabel={ui(config.confirmWithInvoiceLabelKey)}
        processingLabel={ui('processing')}
        cancelLabel={ui('cancel')}
        onConfirmed={onConfirmed}
        onClose={onClose}
        data-testid={config.testId} />
    );
  };
}

export default buildReturnRowConfirmModal;
