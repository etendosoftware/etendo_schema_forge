import PaymentLifecycleConfirmModal from '@/windows/custom/shared/PaymentLifecycleConfirmModal';
import PaymentEditModalLauncher from '@/windows/custom/shared/PaymentEditModalLauncher';

/**
 * The window's single `processConfirmModal` slot, routed by process.
 *
 * Confirmar no longer opens a yes/no dialog: this window has no form of its own, so that dialog was
 * the only thing a user who reactivated a payment could reach, and it could not change anything.
 * It now opens the invoice's editable payment modal, which is where amount, date, method, account
 * and the PIS block can be corrected before confirming — or saved back as a draft.
 */
export default function ReactivarConfirmModal({ process, record, onConfirm, onClose, apiBaseUrl, onRefresh }) {
  if (process?.columnName === 'aPRMProcessPayment') {
    return (
      <PaymentEditModalLauncher
        dir="out"
        record={record}
        apiBaseUrl={apiBaseUrl}
        onConfirm={onConfirm}
        onClose={onClose}
        onRefresh={onRefresh} />
    );
  }
  return <PaymentLifecycleConfirmModal dir="out" action="reactivate" data={record} onConfirm={onConfirm} onClose={onClose} />;
}
