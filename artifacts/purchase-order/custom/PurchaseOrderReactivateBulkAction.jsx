import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';

// The selection bar carries ONE action button for this window, "Procesar", and the
// user picks the document action inside its dialog — the same shape sales-order,
// the invoices and the shipments use. So this mounts `BulkDocumentAction` with no
// `buildActions` of its own: the component's default offers `CO` when a draft row
// is selected and `RE` when a completed one is, which is exactly the menu this
// window needs now that ETP-5315 made purchase orders reactivatable again.
//
// ETP-5315 originally shipped this as a SECOND button beside the pre-existing
// CO-only one, which forced two workarounds that are now gone: a local
// `buildReactivateActions` emitting only `RE` (so the two buttons would not both
// render a `CO` entry), and a separate `reactivateBulk` label (so a mixed
// draft+completed selection would not show two identically-named buttons). With a
// single button neither problem exists — mirroring OrderReactivateBulkAction.jsx
// verbatim is finally the right thing.
//
// `rowFilter` stays: a completed order WITH linked documents must not be sent to
// the backend for `RE`. Returning a message counts that row as omitted in the
// result toast, so the user learns which orders were skipped and why instead of
// getting an opaque backend rejection.
export default function PurchaseOrderReactivateBulkAction(props) {
  const ui = useUI();

  const rowFilter = (row, action) => {
    if (action === 'RE' && row.hasLinkedDocuments) {
      return ui('cannotReactivateLinkedDocs');
    }
    return true;
  };

  return <BulkDocumentAction {...props} rowFilter={rowFilter} labelKey="process" />;
}
