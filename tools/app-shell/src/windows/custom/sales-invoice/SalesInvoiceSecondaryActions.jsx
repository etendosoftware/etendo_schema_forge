import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to sales-invoice (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/sales-invoice/index.jsx`, this
 * renders Copy link -> Clone to the LEFT of Save/Confirm — see the classification
 * comment near `DetailView.jsx`'s `topbarSecondary`/`topbarRight` render for the
 * primary/secondary split rationale.
 *
 * Clone reuses the `cloneInvoiceError` / `invoiceProcessing` i18n keys that
 * `SalesInvoiceTopbar` used inline before ETP-5260 (its `titleKey`/`bodyKey`/
 * `actionLabelKey` props were never actually read by `CloneOrderModal` — dead
 * props, not carried over here).
 *
 * `showSend` IS wired here (defect fix, ETP-5260 follow-up): the DF puts
 * "Enviar por email" in the Copy link -> Clone -> Send order, to the LEFT of
 * Save/Confirm, same as every other document window. Only the payment-status
 * badge (and the fiscal `SendToSifButton`) stays inside
 * `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx`, nested INSIDE
 * `SalesInvoiceTopbar` (topbarRight) — by the DF the badge belongs at the
 * extreme right, after Save/Confirm. Do NOT move the badge here.
 *
 * Clicking Send here does not own a modal (this component has no client-
 * rendered PDF context) — it dispatches a window CustomEvent that
 * `InvoiceTopbarExtra` listens for and uses to open its existing
 * `SendDocumentModal`, mirroring `purchase-order`'s
 * `purchase-order:open-send-modal` bridge (see
 * `PurchaseOrderSecondaryActions.jsx`).
 */
export default function SalesInvoiceSecondaryActions(props) {
  const isCompleted = props.data?.documentStatus === 'CO';

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="sales-invoice"
      clone={{ errorKey: 'cloneInvoiceError', processingKey: 'invoiceProcessing' }}
      showSend={isCompleted}
      onSendClick={() => window.dispatchEvent(new CustomEvent('sales-invoice:open-send-modal'))}
      data-testid="SalesInvoiceSecondaryActions" />
  );
}
