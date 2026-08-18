import { Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import LifecycleConfirmModal from '@/windows/custom/shared/LifecycleConfirmModal';

/* eslint-disable react/prop-types */

/**
 * Confirmation cartel for permanently deleting a bank connection (ETP-4764).
 *
 * This is the irreversible half of the footer split button: unlike the plain "Desconectar",
 * which only deactivates the connection and keeps it reconnectable, this deletes it on the bank
 * provider's side. It therefore gets the full {@link LifecycleConfirmModal} treatment — bullet
 * list of consequences plus the yellow warning box — mirroring the warning Etendo Classic shows
 * when its "Permanent deletion" checkbox is ticked.
 *
 * The consequences are passed through the explicit `items` escape hatch because they do not map
 * to the Conciliación / Transacción / Asiento triad the modal builds by default.
 *
 * @param {{
 *   onConfirm: () => Promise<void> | void,
 *   onClose: () => void,
 * }} props
 */
export default function BankConnectionDeleteConfirmModal({ onConfirm, onClose }) {
  const ui = useUI();

  return (
    <LifecycleConfirmModal
      title={ui('financeAccountsBankConnectionDeleteTitle')}
      sub={ui('financeAccountsBankConnectionDeleteSub')}
      items={[
        [
          ui('financeAccountsBankConnectionDeleteItem1Title'),
          ui('financeAccountsBankConnectionDeleteItem1Desc'),
        ],
        [
          ui('financeAccountsBankConnectionDeleteItem2Title'),
          ui('financeAccountsBankConnectionDeleteItem2Desc'),
        ],
      ]}
      warning={ui('financeAccountsBankConnectionDeleteWarning')}
      confirmLabel={ui('financeAccountsBankConnectionDeleteAction')}
      cancelLabel={ui('cancel')}
      confirmIcon={<Trash2 width={15} height={15} strokeWidth={2.2} data-testid="DeleteConnectionIcon__bc4764" />}
      onConfirm={onConfirm}
      onClose={onClose}
      testIdPrefix="bank-connection-delete-confirm"
      data-testid="LifecycleConfirmModal__bc4764" />
  );
}
