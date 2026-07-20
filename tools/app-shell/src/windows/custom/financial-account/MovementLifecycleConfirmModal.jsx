import { RotateCcw, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal';

/* eslint-disable react/prop-types */

const SUB_KEY_BY_ACTION = {
  delete: {
    both: 'financeAccountTxConfirmDeleteSubBoth',
    reconciled: 'financeAccountTxConfirmDeleteSubReconciledOnly',
    posted: 'financeAccountTxConfirmDeleteSubPostedOnly',
  },
  reactivate: {
    both: 'financeAccountTxConfirmReactivateSubBoth',
    reconciled: 'financeAccountTxConfirmReactivateSubReconciledOnly',
    posted: 'financeAccountTxConfirmReactivateSubPostedOnly',
  },
};

const WARNING_KEY_BY_STATE = {
  both: 'financeAccountTxConfirmWarningBoth',
  reconciled: 'financeAccountTxConfirmWarningReconciledOnly',
  posted: 'financeAccountTxConfirmWarningPostedOnly',
};

const TITLE_KEY_BY_ACTION = {
  delete: 'financeAccountTxConfirmDeleteTitle',
  reactivate: {
    reconciled: 'financeAccountTxConfirmReactivateTitleReconciled',
    default: 'financeAccountTxConfirmReactivateTitle',
  },
};

const CONFIRM_LABEL_KEY_BY_ACTION = {
  delete: 'financeAccountTxConfirmDeleteBtn',
  reactivate: 'financeAccountTxConfirmReactivateBtn',
};

const CONFIRM_ICON_BY_ACTION = {
  delete: Trash2,
  reactivate: RotateCcw,
};

function resolveStateKey(reconciled, posted) {
  if (reconciled && posted) return 'both';
  if (reconciled) return 'reconciled';
  return 'posted';
}

/**
 * Resolves the sub-title (below the red title) naming exactly which effects apply.
 * Mirrors `PaymentLifecycleConfirmModal`'s `resolveSubKey`, but Movimientos only has
 * two possible effects (Conciliación, Asiento) — there is no separate "Transacción
 * financiera" to name here, since the movement itself IS the transaction being
 * confirmed. The dialog only ever opens when `reconciled || posted` (see
 * `MovementRowKebab`'s `needsConfirm`), so "neither" is unreachable.
 */
function resolveSubKey(action, reconciled, posted) {
  return SUB_KEY_BY_ACTION[action][resolveStateKey(reconciled, posted)];
}

/** Same tiering as {@link resolveSubKey} for the yellow warning box. */
function resolveWarningKey(reconciled, posted) {
  return WARNING_KEY_BY_STATE[resolveStateKey(reconciled, posted)];
}

function resolveTitleKey(action, reconciled) {
  if (action === 'delete') return TITLE_KEY_BY_ACTION.delete;
  return reconciled ? TITLE_KEY_BY_ACTION.reactivate.reconciled : TITLE_KEY_BY_ACTION.reactivate.default;
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
  const title = ui(resolveTitleKey(action, reconciled));
  const sub = ui(resolveSubKey(action, reconciled, posted));
  const confirmLabel = ui(CONFIRM_LABEL_KEY_BY_ACTION[action]);
  const warning = ui(resolveWarningKey(reconciled, posted));
  // Matches PaymentLifecycleConfirmModal's confirm-button icon treatment (restored from
  // the pre-refactor payments ReactivarModal; applied here too for full parity).
  const ConfirmIconComponent = CONFIRM_ICON_BY_ACTION[action];

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
