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

// Per-dir i18n key lookups, one object per state tier — flat lookups instead of nested
// ternaries (Sonar S3358) and much lower branching in the resolver functions below (S3776).
const RECONCILED_DELETE_SUB_KEY = { in: 'paymentConfirmDeleteSubInReconciled', out: 'paymentConfirmDeleteSubOutReconciled' };
const RECONCILED_REACTIVATE_SUB_KEY = { in: 'reactivarInSub', out: 'reactivarOutSub' };
const DEPOSITED_DELETE_SUB_KEY = { in: 'paymentConfirmDeleteSubIn', out: 'paymentConfirmDeleteSubOut' };
const DEPOSITED_REACTIVATE_SUB_KEY = { in: 'paymentConfirmReactivateSubIn', out: 'paymentConfirmReactivateSubOut' };
const DRAFT_DELETE_SUB_KEY = { in: 'paymentConfirmDeleteSubInDraft', out: 'paymentConfirmDeleteSubOutDraft' };
const RECONCILED_WARNING_KEY = { in: 'reactivarWarningIn', out: 'reactivarWarningOut' };
const DEPOSITED_WARNING_KEY = { in: 'paymentConfirmWarningPostedIn', out: 'paymentConfirmWarningPostedOut' };
const RECONCILED_REACTIVATE_TITLE_KEY = { in: 'paymentConfirmReactivateTitleInReconciled', out: 'paymentConfirmReactivateTitleOutReconciled' };
const UNRECONCILED_REACTIVATE_TITLE_KEY = { in: 'paymentConfirmReactivateTitleIn', out: 'paymentConfirmReactivateTitleOut' };
const DELETE_TITLE_KEY = { in: 'paymentConfirmDeleteTitleIn', out: 'paymentConfirmDeleteTitleOut' };
const SUB_KEY_BY_ACTION_AND_STATE = {
  delete: {
    reconciled: RECONCILED_DELETE_SUB_KEY,
    deposited: DEPOSITED_DELETE_SUB_KEY,
    draft: DRAFT_DELETE_SUB_KEY,
  },
  reactivate: {
    reconciled: RECONCILED_REACTIVATE_SUB_KEY,
    deposited: DEPOSITED_REACTIVATE_SUB_KEY,
  },
};
const CONFIRM_LABEL_KEY_BY_ACTION = {
  delete: 'paymentConfirmDeleteBtn',
  reactivate: 'paymentConfirmReactivateBtn',
};
const CONFIRM_ICON_BY_ACTION = {
  delete: Trash2,
  reactivate: RotateCcw,
};

function resolvePaymentStateKey(reconciled, hasTransaction) {
  if (reconciled) return 'reconciled';
  if (hasTransaction) return 'deposited';
  return 'draft';
}

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
  const stateKey = resolvePaymentStateKey(reconciled, hasTransaction);
  return SUB_KEY_BY_ACTION_AND_STATE[action][stateKey][dir];
}

/** Same tiering as {@link resolveSubKey} for the yellow warning box. */
function resolveWarningKey(dir, reconciled, hasTransaction) {
  if (reconciled) return RECONCILED_WARNING_KEY[dir];
  if (hasTransaction) return DEPOSITED_WARNING_KEY[dir];
  return 'paymentConfirmWarning';
}

function resolveTitleKey(dir, action, reconciled) {
  if (action === 'delete') return DELETE_TITLE_KEY[dir];
  return reconciled ? RECONCILED_REACTIVATE_TITLE_KEY[dir] : UNRECONCILED_REACTIVATE_TITLE_KEY[dir];
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

  const title = ui(resolveTitleKey(dir, action, reconciled));
  const sub = ui(resolveSubKey(action, dir, reconciled, hasTransaction));
  const confirmLabel = ui(CONFIRM_LABEL_KEY_BY_ACTION[action]);
  const warning = ui(resolveWarningKey(dir, reconciled, hasTransaction));
  // Matches the pre-refactor ReactivarModal, which always paired its confirm button with
  // this rotate icon; Eliminar gets the analogous Trash2 (new — delete had no cartel before).
  const ConfirmIconComponent = CONFIRM_ICON_BY_ACTION[action];

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
