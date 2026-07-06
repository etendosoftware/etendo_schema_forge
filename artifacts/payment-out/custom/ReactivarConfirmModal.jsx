import ReactivarModal from '@/windows/custom/shared/ReactivarModal';
import ConfirmPaymentModal from '@/windows/custom/shared/ConfirmPaymentModal';

/* eslint-disable react/prop-types */
export default function ReactivarConfirmModal({ process, onConfirm, onClose }) {
  if (process?.columnName === 'aPRMProcessPayment') {
    return <ConfirmPaymentModal dir="out" onConfirm={onConfirm} onClose={onClose} />;
  }
  return <ReactivarModal dir="out" onConfirm={onConfirm} onClose={onClose} />;
}
