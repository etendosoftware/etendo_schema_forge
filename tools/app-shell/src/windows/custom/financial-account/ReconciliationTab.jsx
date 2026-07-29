import { useNavigate } from 'react-router-dom';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';

/**
 * Reconciliation tab of the financial-account detail view.
 *
 * Hosts the manual bank reconciliation split panel (T6). The panel reads the
 * pending statement lines and candidate operations for the account and composes
 * Etendo's reconciliation flow on the backend.
 *
 * @param {{ account: object|null, paymentMethods?: Array<object>, onReconcileSuccess?: () => void }} props
 */
export function ReconciliationTab({ account, paymentMethods, onReconcileSuccess }) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ReconciliationSplitPanel
        accountId={account?.id}
        currency={account?.currency}
        paymentMethods={paymentMethods}
        onBack={() => navigate(-1)}
        onReconcileSuccess={onReconcileSuccess}
        data-testid="ReconciliationSplitPanel__46a213" />
    </div>
  );
}
