import PaymentLifecycleConfirmModal from '@/windows/custom/shared/PaymentLifecycleConfirmModal';
import ConfirmPaymentModal from '@/windows/custom/shared/ConfirmPaymentModal';

/* eslint-disable react/prop-types */
export default function ReactivarConfirmModal({ process, record, onConfirm, onClose }) {
  if (process?.columnName === 'aPRMProcessPayment') {
    return <ConfirmPaymentModal dir="out" onConfirm={onConfirm} onClose={onClose} />;
  }
  return <PaymentLifecycleConfirmModal dir="out" action="reactivate" data={record} onConfirm={onConfirm} onClose={onClose} />;
}
