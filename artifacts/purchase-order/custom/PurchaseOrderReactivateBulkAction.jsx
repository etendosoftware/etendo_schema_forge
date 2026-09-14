import BulkDocumentAction from '@/components/contract-ui/BulkDocumentAction';
import { useUI } from '@/i18n';

// ETP-5315 review fix (blocker) — unlike sales-order, purchase-order's
// PurchaseOrderBulkActions ALSO renders the pre-existing CO-only
// `<BulkDocumentAction buildActions={buildInOutActions} labelKey="confirmBulk">`
// (unrelated to this ticket, left untouched). BulkDocumentAction's DEFAULT
// `buildActions` (used when none is passed) independently adds a 'CO' option
// whenever any selected row is DR, so mirroring OrderReactivateBulkAction.jsx
// verbatim (no buildActions) would make BOTH components render their own
// "Confirmar" button for any draft-containing selection — two identical
// buttons side by side. sales-order never hits this because it has no
// second BulkDocumentAction to collide with.
//
// Fix: a custom buildActions scoped to THIS component that only ever offers
// 'RE' (never 'CO' — that stays exclusively the other component's job), and
// only when a completed row still eligible for reactivation (not blocked by
// hasLinkedDocuments) is present. An all-draft selection — already fully
// covered by the untouched CO-only BulkDocumentAction — yields an empty
// action list here, so this component renders nothing (see
// BulkDocumentAction's `actions.length === 0` early return) instead of a
// second overlapping button.
//
// ETP-5315 QA fix (medium) — this component used to pass labelKey="confirmBulk",
// the EXACT same key as the sibling CO-only BulkDocumentAction in
// PurchaseOrderBulkActions (index.jsx). For a selection mixing a DRAFT row and a
// COMPLETED-unlinked row, both buttons render side by side, both reading
// "Confirmar"/"Confirm" — indistinguishable even though one books and the other
// reactivates. Fixed by giving this button its own `reactivateBulk` label
// (see en_US.json/es_ES.json) instead of reusing `confirmBulk`.
const buildReactivateActions = (rows) => {
  const statusOf = (row) => row.documentStatus || row.docStatus;
  const hasReactivatableRow = rows.some(
    (row) => statusOf(row) === 'CO' && !row.hasLinkedDocuments,
  );
  return hasReactivatableRow ? [{ value: 'RE', labelKey: 'reactivate' }] : [];
};

export default function PurchaseOrderReactivateBulkAction(props) {
  const ui = useUI();

  const rowFilter = (row, action) => {
    if (action === 'RE' && row.hasLinkedDocuments) {
      return ui('cannotReactivateLinkedDocs');
    }
    return true;
  };

  return (
    <BulkDocumentAction
      {...props}
      buildActions={buildReactivateActions}
      rowFilter={rowFilter}
      labelKey="reactivateBulk"
    />
  );
}
