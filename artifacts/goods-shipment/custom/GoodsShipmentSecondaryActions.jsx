import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to goods-shipment (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/goods-shipment/index.jsx` (or
 * the generated HeaderPage via `customComponents.topbarSecondary`, see the plan
 * doc), this renders Copy link -> Clone -> Send to the LEFT of Save/Confirm —
 * see the classification comment near `DetailView.jsx`'s
 * `topbarSecondary`/`topbarRight` render for the primary/secondary split
 * rationale.
 *
 * Clone uses `headerEntity="goodsShipment"` + `routePrefix="/goods-shipment/"`
 * (CloneOrderModal's own "State 2" — a list of cloned documents with internal
 * navigation — see `DocumentSecondaryActions`' `routePrefix` doc), matching the
 * pre-ETP-5260 inline behaviour in `GoodsShipmentActions`. Note this is a
 * DIFFERENT clone UX than purchase-order/sales-order/sales-quotation (which
 * auto-navigate to the new record) — this window kept its own "review then
 * click through" flow on purpose.
 *
 * Send stays gated to Completed (matching `GoodsShipmentActions`' own gate)
 * and reuses `GoodsShipmentActions`' existing SendDocumentModal — which
 * carries the client-rendered delivery-note PDF context this shared component
 * does not have — via a window CustomEvent, rather than duplicating that
 * modal here. Mirrors the purchase-order reference adapter,
 * `artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx`.
 */
export default function GoodsShipmentSecondaryActions(props) {
  const isCompleted = props.data?.documentStatus === 'CO';

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="goods-shipment"
      clone={{ headerEntity: 'goodsShipment', routePrefix: '/goods-shipment/' }}
      showSend={isCompleted}
      onSendClick={() => window.dispatchEvent(new CustomEvent('goods-shipment:open-send-modal'))}
      data-testid="GoodsShipmentSecondaryActions" />
  );
}
