import ReactivarModal from '@/windows/custom/shared/ReactivarModal';

/* eslint-disable react/prop-types */
export default function ReactivarConfirmModal({ onConfirm, onClose }) {
  return <ReactivarModal dir="in" onConfirm={onConfirm} onClose={onClose} />;
}
