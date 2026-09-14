import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';
import SendToSifButton from '@/windows/custom/shared/SendToSifButton.jsx';

/**
 * Adapts the shared `DocumentSecondaryActions` group to purchase-invoice (ETP-5260).
 * Wired as `topbarRight`'s replacement slot from
 * `windows/custom/purchase-invoice/index.jsx` (this window is on the "Camino B"
 * prop-hardcoded path, see the plan doc), rendering Copy link -> Clone to the
 * LEFT of Save/Confirm — see the classification comment near `DetailView.jsx`'s
 * `topbarSecondary`/`topbarRight` render for the primary/secondary split
 * rationale.
 *
 * Clone reuses the `cloneInvoiceError` / `invoiceProcessing` i18n keys that
 * `PurchaseInvoiceTopbar` used inline before ETP-5260 (its `titleKey`/`bodyKey`/
 * `actionLabelKey` props were never actually read by `CloneOrderModal` — dead
 * props, not carried over here).
 *
 * `SendToSifButton` (send invoice to SII/TBAI) is NOT the generic "send by
 * email" action `DocumentSecondaryActions.showSend` models — it is a
 * fiscal-compliance action specific to invoices, with its own gating
 * (`status === 'CO'` + pending SII/TBAI targets) and its own modal. It is
 * rendered here, after Clone, matching the DF's "Enviar" position in the
 * secondary group, while staying a window-specific concern (not folded into
 * the shared component).
 *
 * The payment-status badge stays in `PurchaseInvoiceTopbar` (topbarRight),
 * unaffected by this migration — it is a primary/status indicator that
 * belongs at the extreme right, after Save/Confirm.
 */
export default function PurchaseInvoiceSecondaryActions(props) {
  const { data, recordId, apiBaseUrl } = props;

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="purchase-invoice"
      clone={{ errorKey: 'cloneInvoiceError', processingKey: 'invoiceProcessing' }}
      data-testid="PurchaseInvoiceSecondaryActions">
      <SendToSifButton
        data={data}
        recordId={recordId}
        apiBaseUrl={apiBaseUrl}
        status={data?.documentStatus}
        data-testid="SendToSifButton__PurchaseInvoiceSecondaryActions" />
    </DocumentSecondaryActions>
  );
}
