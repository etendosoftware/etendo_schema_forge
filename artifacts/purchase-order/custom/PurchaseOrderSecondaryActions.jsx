import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to purchase-order (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/purchase-order/index.jsx`, this
 * renders Copy link -> Clone -> Send to the LEFT of Save/Confirm — see the
 * classification comment near `DetailView.jsx`'s `topbarSecondary`/`topbarRight`
 * render for the primary/secondary split rationale.
 *
 * Clone uses `DocumentSecondaryActions`' default post-clone navigation
 * (`/purchase-order/{newId}`), matching the pre-ETP-5260 inline behaviour.
 *
 * Send stays gated to Completed (matching the grid row quick-action's status
 * gate, ETP-4717) and reuses `PurchaseOrderActions`' existing SendDocumentModal
 * — which carries the client-rendered PDF/documentType context this shared
 * component does not have — via a window CustomEvent, rather than duplicating
 * that modal here. This is the same event-bridge pattern
 * `PurchaseOrderDraftChips`/the draftMode Confirm button already use to reach
 * into `PurchaseOrderActions` (topbarRight).
 *
 * New windows migrating to `topbarSecondary` should copy this file as the
 * reference adapter.
 */
export default function PurchaseOrderSecondaryActions(props) {
  const isCompleted = props.data?.documentStatus === 'CO';

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="purchase-order"
      clone
      showSend={isCompleted}
      onSendClick={() => window.dispatchEvent(new CustomEvent('purchase-order:open-send-modal'))}
      data-testid="PurchaseOrderSecondaryActions" />
  );
}
