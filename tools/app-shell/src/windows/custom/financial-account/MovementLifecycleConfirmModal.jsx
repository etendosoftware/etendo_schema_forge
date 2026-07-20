import { RotateCcw, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal';

/* eslint-disable react/prop-types */

/**
 * Resolves the sub-title (below the red title) naming exactly which effects apply.
 * Mirrors `PaymentLifecycleConfirmModal`'s `resolveSubKey`, but Movimientos only has
 * two possible effects (Conciliación, Asiento) — there is no separate "Transacción
 * financiera" to name here, since the movement itself IS the transaction being
 * confirmed. The dialog only ever opens when `reconciled || posted` (see
 * `MovementRowKebab`'s `needsConfirm`), so "neither" is unreachable.
 */
function resolveSubKey(action, reconciled, posted) {
  const isDelete = action === 'delete';
  if (reconciled && posted) {
    return isDelete ? 'financeAccountTxConfirmDeleteSubBoth' : 'financeAccountTxConfirmReactivateSubBoth';
  }
  if (reconciled) {
    return isDelete ? 'financeAccountTxConfirmDeleteSubReconciledOnly' : 'financeAccountTxConfirmReactivateSubReconciledOnly';
  }
  return isDelete ? 'financeAccountTxConfirmDeleteSubPostedOnly' : 'financeAccountTxConfirmReactivateSubPostedOnly';
}

/** Same tiering as {@link resolveSubKey} for the yellow warning box. */
function resolveWarningKey(reconciled, posted) {
  if (reconciled && posted) return 'financeAccountTxConfirmWarningBoth';
  if (reconciled) return 'financeAccountTxConfirmWarningReconciledOnly';
  return 'financeAccountTxConfirmWarningPostedOnly';
}

/**
 * Wires {@link LifecycleConfirmModal} for a Movimiento (financial-account transaction)
 * with movement wording. Mirrors `PaymentLifecycleConfirmModal` 1:1 (same resolveSubKey/
 * resolveWarningKey shape, same confirm-button icon treatment) so both domains render
 * the exact same cartel with the same level of icon/text detail — only the item set and
 * i18n keys differ, by design (see this file's own comment on why there's no "Transacción
 * financiera" item here).
 *
 * @param {{
 *   action: 'reactivate' | 'delete',
 *   reconciled: boolean,
 *   posted: boolean,
 *   onConfirm: () => Promise<void> | void,
 *   onClose: () => void,
 * }} props
 */
export default function MovementLifecycleConfirmModal({ action, reconciled, posted, onConfirm, onClose }) {
  const ui = useUI();
  const isDelete = action === 'delete';

  const title = isDelete
    ? ui('financeAccountTxConfirmDeleteTitle')
    : ui(reconciled ? 'financeAccountTxConfirmReactivateTitleReconciled' : 'financeAccountTxConfirmReactivateTitle');
  const sub = ui(resolveSubKey(action, reconciled, posted));
  const confirmLabel = ui(isDelete ? 'financeAccountTxConfirmDeleteBtn' : 'financeAccountTxConfirmReactivateBtn');
  const warning = ui(resolveWarningKey(reconciled, posted));
  // Matches PaymentLifecycleConfirmModal's confirm-button icon treatment (restored from
  // the pre-refactor payments ReactivarModal; applied here too for full parity).
  const ConfirmIconComponent = isDelete ? Trash2 : RotateCcw;

  return (
    <LifecycleConfirmModal
      reconciled={reconciled}
      posted={posted}
      title={title}
      sub={sub}
      confirmLabel={confirmLabel}
      cancelLabel={ui('financeAccountTxNewCancel')}
      warning={warning}
      confirmIcon={<ConfirmIconComponent
        width={15}
        height={15}
        strokeWidth={2.2}
        data-testid="ConfirmIconComponent__d0836d" />}
      itemConciliacion={[ui('reactivarItem1Title'), ui('reactivarItem1Desc')]}
      itemAsiento={[ui('reactivarItem3Title'), ui('reactivarItem3Desc')]}
      onConfirm={onConfirm}
      onClose={onClose}
      testIdPrefix="movement-confirm"
      data-testid="LifecycleConfirmModal__d0836d" />
  );
}
