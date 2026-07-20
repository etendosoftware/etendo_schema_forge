import { RotateCcw, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import LifecycleConfirmModal from './LifecycleConfirmModal';
import { DEPOSITED_STATUSES } from './paymentStatuses';

/* eslint-disable react/prop-types */

// Payment status search_key that means "cleared against a bank statement" —
// same code PaymentConciliadoBadge.jsx gates on. The deposited-but-not-yet-
// reconciled statuses (RPR/RDNC/PPM/PWNC/RPAE) must NOT show the Conciliación
// item — that was the original bug this component fixes.
const RECONCILED_STATUS = 'RPPC';

/**
 * Resolves the sub-title (below the red title) describing exactly what will be undone,
 * matching the level of detail the pre-refactor `ReactivarModal` had — but accurate to
 * the record's real state instead of always assuming "conciliado":
 *   - reconciled → names all three effects (conciliación, transacción, asiento), like
 *     the original reconciled-only copy.
 *   - deposited but not reconciled → names the two effects that actually apply
 *     (transacción, asiento) — `hasTransaction` and "asiento" are the same condition
 *     for now (see `PaymentLifecycleConfirmModal`'s own comment on that).
 *   - never deposited (still Draft — only reachable via Eliminar) → nothing accounting-
 *     related ever existed; falls back to the plain generic copy.
 */
function resolveSubKey(action, dir, reconciled, hasTransaction) {
  const isDelete = action === 'delete';
  if (reconciled) {
    if (isDelete) return dir === 'in' ? 'paymentConfirmDeleteSubInReconciled' : 'paymentConfirmDeleteSubOutReconciled';
    return dir === 'in' ? 'reactivarInSub' : 'reactivarOutSub';
  }
  if (hasTransaction) {
    return isDelete
      ? (dir === 'in' ? 'paymentConfirmDeleteSubIn' : 'paymentConfirmDeleteSubOut')
      : (dir === 'in' ? 'paymentConfirmReactivateSubIn' : 'paymentConfirmReactivateSubOut');
  }
  // Draft, never deposited — delete-only path (reactivate is never offered on a Draft).
  return dir === 'in' ? 'paymentConfirmDeleteSubInDraft' : 'paymentConfirmDeleteSubOutDraft';
}

/** Same tiering as {@link resolveSubKey} for the yellow warning box. */
function resolveWarningKey(dir, reconciled, hasTransaction) {
  if (reconciled) return dir === 'in' ? 'reactivarWarningIn' : 'reactivarWarningOut';
  if (hasTransaction) return dir === 'in' ? 'paymentConfirmWarningPostedIn' : 'paymentConfirmWarningPostedOut';
  return 'paymentConfirmWarning';
}

/**
 * Wires {@link LifecycleConfirmModal} for a Cobro/Pago record with cobro/pago
 * wording, deriving `reconciled`/`hasTransaction`/`posted` from the record
 * itself. Shared by the grid (`PaymentHeaderTableBase`) and the detail view
 * (`ReactivarConfirmModal` custom components / `DetailView`'s delete confirm)
 * so both surfaces show the exact same cartel for Reactivar and Eliminar.
 *
 * @param {{
 *   dir: 'in' | 'out',
 *   action: 'reactivate' | 'delete',
 *   data: { status?: string, posted?: string } | null,
 *   onConfirm: () => Promise<void> | void,
 *   onClose: () => void,
 * }} props
 */
export default function PaymentLifecycleConfirmModal({ dir, action, data, onConfirm, onClose }) {
  const ui = useUI();
  const isIn = dir === 'in';
  const isDelete = action === 'delete';
  const reconciled = data?.status === RECONCILED_STATUS;
  // A deposited (processed) payment always has its OWN associated financial-account
  // movement (FIN_Finacc_Transaction), separate from the payment record itself — unlike
  // Movimientos, where the transaction IS the record being confirmed. Reactivating or
  // deleting a deposited payment reverts that movement, regardless of whether it also
  // happens to be reconciled or posted.
  const hasTransaction = DEPOSITED_STATUSES.has(data?.status);
  // Asiento contable: tied to the SAME condition as the transaction, not `data.posted ===
  // 'Y'` — in practice `posted` is rarely 'Y' (most records sit in a non-posted AD_Ref_List
  // 234 code, e.g. 'D' = "Document Disabled", not "will post later"), so gating on the
  // literal flag hid this item almost everywhere. Tying it to "was ever deposited" avoids
  // that while still not claiming an entry exists for a payment still in Draft. Exact
  // criterion still TBD (ETP-4500 follow-up) if this needs to be more precise later.
  const posted = hasTransaction;

  const reactivateTitleKey = reconciled
    ? (isIn ? 'paymentConfirmReactivateTitleInReconciled' : 'paymentConfirmReactivateTitleOutReconciled')
    : (isIn ? 'paymentConfirmReactivateTitleIn' : 'paymentConfirmReactivateTitleOut');
  const title = isDelete
    ? ui(isIn ? 'paymentConfirmDeleteTitleIn' : 'paymentConfirmDeleteTitleOut')
    : ui(reactivateTitleKey);
  const sub = ui(resolveSubKey(action, dir, reconciled, hasTransaction));
  const confirmLabel = ui(isDelete ? 'paymentConfirmDeleteBtn' : 'paymentConfirmReactivateBtn');
  const warning = ui(resolveWarningKey(dir, reconciled, hasTransaction));
  // Matches the pre-refactor ReactivarModal, which always paired its confirm button with
  // this rotate icon; Eliminar gets the analogous Trash2 (new — delete had no cartel before).
  const ConfirmIconComponent = isDelete ? Trash2 : RotateCcw;

  return (
    <LifecycleConfirmModal
      reconciled={reconciled}
      posted={posted}
      hasTransaction={hasTransaction}
      title={title}
      sub={sub}
      confirmLabel={confirmLabel}
      cancelLabel={ui('cancel')}
      warning={warning}
      confirmIcon={<ConfirmIconComponent
        width={15}
        height={15}
        strokeWidth={2.2}
        data-testid="ConfirmIconComponent__5f76e8" />}
      itemConciliacion={[ui('reactivarItem1Title'), ui('reactivarItem1Desc')]}
      itemTransaccion={[ui('reactivarItem2Title'), ui('reactivarItem2Desc')]}
      itemAsiento={[ui('reactivarItem3Title'), ui('reactivarItem3Desc')]}
      onConfirm={onConfirm}
      onClose={onClose}
      testIdPrefix="payment-confirm"
      data-testid="LifecycleConfirmModal__5f76e8" />
  );
}
