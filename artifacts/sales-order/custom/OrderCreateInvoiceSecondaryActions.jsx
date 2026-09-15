import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to sales-order (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/sales-order/index.jsx`, this
 * renders Copy link -> Clone -> Send to the LEFT of Save/Confirm — see the
 * classification comment near `DetailView.jsx`'s `topbarSecondary`/`topbarRight`
 * render for the primary/secondary split rationale.
 *
 * Clone uses `DocumentSecondaryActions`' default post-clone navigation
 * (`/sales-order/{newId}`), matching the pre-ETP-5260 inline behaviour.
 *
 * Send stays gated to Completed (matching the grid row quick-action's status
 * gate, ETP-4717) and reuses `OrderCreateInvoice`'s existing SendDocumentModal
 * — which carries the client-rendered PDF/documentType context this shared
 * component does not have — via a window CustomEvent, rather than duplicating
 * that modal here. Mirrors the purchase-order reference adapter,
 * `artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx`.
 */
export default function OrderCreateInvoiceSecondaryActions(props) {
  const isCompleted = props.data?.documentStatus === 'CO';

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="sales-order"
      clone
      showSend={isCompleted}
      onSendClick={() => window.dispatchEvent(new CustomEvent('sales-order:open-send-modal'))}
      data-testid="OrderCreateInvoiceSecondaryActions" />
  );
}
