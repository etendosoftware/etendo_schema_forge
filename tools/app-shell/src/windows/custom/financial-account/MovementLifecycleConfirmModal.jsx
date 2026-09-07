import { RotateCcw, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal';

/* eslint-disable react/prop-types */

const SUB_KEY_BY_ACTION = {
  delete: {
    both: 'financeAccountTxConfirmDeleteSubBoth',
    reconciled: 'financeAccountTxConfirmDeleteSubReconciledOnly',
    posted: 'financeAccountTxConfirmDeleteSubPostedOnly',
    // ETP-5111 — nothing to undo: no conciliación, no asiento. Says only that the delete is
    // permanent, because that is the only true thing left to say.
    neither: 'financeAccountTxConfirmDeleteSubNeither',
  },
  reactivate: {
    both: 'financeAccountTxConfirmReactivateSubBoth',
    reconciled: 'financeAccountTxConfirmReactivateSubReconciledOnly',
    posted: 'financeAccountTxConfirmReactivateSubPostedOnly',
    // Deliberately no `neither`: Reactivar is offered only for a Processed movement and its own
    // `needsConfirm` gate (MovementRowKebab) opens this dialog only when posted and/or reconciled,
    // so the state cannot occur. If that gate is ever removed, the subtitle renders empty — which
    // is the safe direction to fail, unlike the posted-state fallthrough this replaced.
  },
};

// `null` where there is nothing to warn about; `LifecycleConfirmModal` then renders no yellow box.
const WARNING_KEY_BY_STATE = {
  both: 'financeAccountTxConfirmWarningBoth',
  reconciled: 'financeAccountTxConfirmWarningReconciledOnly',
  posted: 'financeAccountTxConfirmWarningPostedOnly',
  neither: null,
};

const TITLE_KEY_BY_ACTION = {
  delete: 'financeAccountTxConfirmDeleteTitle',
  reactivate: {
    reconciled: 'financeAccountTxConfirmReactivateTitleReconciled',
    default: 'financeAccountTxConfirmReactivateTitle',
  },
};

// "Eliminar de todos modos" only makes sense as overriding the warning box, so the state that has
// no warning gets a plain "Eliminar" instead (ETP-5111).
const CONFIRM_LABEL_KEY_BY_ACTION = {
  delete: 'financeAccountTxConfirmDeleteBtn',
  reactivate: 'financeAccountTxConfirmReactivateBtn',
};

const CONFIRM_LABEL_KEY_DELETE_PLAIN = 'financeAccountTxConfirmDeleteBtnPlain';

const CONFIRM_ICON_BY_ACTION = {
  delete: Trash2,
  reactivate: RotateCcw,
};

function resolveStateKey(reconciled, posted) {
  if (reconciled && posted) return 'both';
  if (reconciled) return 'reconciled';
  // ETP-5111 — no live caller reaches this any more (the kebab routes an effect-less delete to
  // `DeleteConfirmDialog`), but the branch stays: without it the fallthrough below reports a
  // movement that is neither reconciled nor posted as posted, and the dialog promises to reverse
  // an accounting entry that does not exist. A wrong answer is worse than an empty one.
  if (!posted) return 'neither';
  return 'posted';
}

/**
 * Resolves the sub-title (below the red title) naming exactly which effects apply.
 * Mirrors `PaymentLifecycleConfirmModal`'s `resolveSubKey`, but Movimientos only has
 * two possible effects (Conciliación, Asiento) — there is no separate "Transacción
 * financiera" to name here, since the movement itself IS the transaction being
 * confirmed.
 *
 * ETP-5111 — the `'neither'` tier below currently has NO live caller: an effect-less delete goes to
 * the generic `DeleteConfirmDialog` instead, and Reactivar's own gate means it never opens without
 * something to undo. It is retained deliberately (see `resolveStateKey`) so the defensive branch
 * has copy to land on rather than rendering the posted wording at someone.
 */
function resolveSubKey(action, stateKey) {
  return SUB_KEY_BY_ACTION[action][stateKey];
}

/**
 * Same tiering as {@link resolveSubKey} for the yellow warning box, or `null` when there is
 * nothing to warn about — see `WARNING_KEY_BY_STATE.neither`.
 */
function resolveWarningKey(stateKey) {
  return WARNING_KEY_BY_STATE[stateKey];
}

/**
 * The confirm button's label. Only `delete` in the no-warning state differs: with no yellow box
 * above it, "Eliminar de todos modos" is overriding nothing.
 */
function resolveConfirmLabelKey(action, stateKey) {
  if (action === 'delete' && stateKey === 'neither') {
    return CONFIRM_LABEL_KEY_DELETE_PLAIN;
  }
  return CONFIRM_LABEL_KEY_BY_ACTION[action];
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
 * ETP-5111 — this cartel is now reached ONLY when the action really has effects to enumerate: the
 * Movimientos kebab routes a blocked delete and a plain-draft delete to the generic
 * `DeleteConfirmDialog` instead (see `MovementRowKebab`'s `showCartel`). A caller that reaches it
 * with neither flag set therefore no longer exists; `resolveStateKey`'s `'neither'` tier is kept as
 * the safe landing if one ever appears again, rather than falling through to the posted wording.
 *
 * @param {{
 *   action: 'reactivate' | 'delete',
 *   reconciled: boolean,
 *   posted: boolean,
 *   onConfirm: () => Promise<void> | void,
 *   onClose: () => void,
 * }} props
 */
export default function MovementLifecycleConfirmModal({
  action, reconciled, posted, onConfirm, onClose,
}) {
  const ui = useUI();
  const stateKey = resolveStateKey(reconciled, posted);
  const title = ui(resolveTitleKey(action, reconciled));
  const sub = ui(resolveSubKey(action, stateKey));
  const confirmLabel = ui(resolveConfirmLabelKey(action, stateKey));
  // Resolved only when there IS a key: `ui(null)` would hand the modal a falsy value anyway, but
  // going through the translator for a deliberate absence reads like an oversight.
  const warningKey = resolveWarningKey(stateKey);
  const warning = warningKey ? ui(warningKey) : null;
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
