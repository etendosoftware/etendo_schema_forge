import DocumentSecondaryActions from '@/windows/custom/shared/DocumentSecondaryActions';

/**
 * Adapts the shared `DocumentSecondaryActions` group to sales-quotation (ETP-5260).
 * Wired as `topbarSecondary` from `windows/custom/sales-quotation/index.jsx`, this
 * renders Copy link -> Clone -> Send to the LEFT of Save/Confirm — see the
 * classification comment near `DetailView.jsx`'s `topbarSecondary`/`topbarRight`
 * render for the primary/secondary split rationale.
 *
 * Clone uses `cloneActionName: 'cloneRecord'` / `headerEntity: 'quotation'`,
 * matching the pre-ETP-5260 inline `CloneOrderModal` call in
 * `QuotationTopbarActions`.
 *
 * Send stays gated to non-Draft statuses (ETP-4717 — available from "Bajo
 * evaluación" onward) and reuses `QuotationTopbarActions`' existing
 * SendDocumentModal — which carries the client-rendered PDF/documentType
 * context this shared component does not have — via a window CustomEvent.
 * Mirrors the purchase-order reference adapter,
 * `artifacts/purchase-order/custom/PurchaseOrderSecondaryActions.jsx`.
 */
export default function QuotationSecondaryActions(props) {
  const status = props.data?.documentStatus;

  return (
    <DocumentSecondaryActions
      {...props}
      windowName="sales-quotation"
      clone={{ cloneActionName: 'cloneRecord', headerEntity: 'quotation' }}
      showSend={Boolean(status) && status !== 'DR'}
      onSendClick={() => window.dispatchEvent(new CustomEvent('sales-quotation:open-send-modal'))}
      data-testid="QuotationSecondaryActions" />
  );
}
