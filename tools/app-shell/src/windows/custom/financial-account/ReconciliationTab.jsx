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
        currency={account?.currencyIso}
        paymentMethods={paymentMethods}
        // ETP-4797: caps the write-off the payment-method modal will offer. Undefined when the
        // account has none configured, which the panel reads as "no limit".
        writeoffLimit={account?.writeoffLimit}
        // Amount tolerance (a PERCENTAGE) gating the "post the remainder to an accounting concept"
        // offer. Read under BOTH names on purpose: the Cuentas LIST serves the W-spec contract name
        // (`eTGOAmountTolerance`) while the account DETAIL comes from the older
        // `financial-accounts-page` R spec, which hand-builds flat names (`amountTolerance`) — the
        // same dual read `EditAccountModal.readTolerances` does.
        amountTolerance={account?.eTGOAmountTolerance ?? account?.amountTolerance ?? 0}
        // The account's difference concept, preselected in the confirmation modal. Absent → the
        // banner shows with its action disabled, explaining what to configure.
        glItemDifference={account?.glItemDifferenceId
          ? { id: account.glItemDifferenceId, name: account.glItemDifferenceName || '' }
          : null}
        onBack={() => navigate(-1)}
        onReconcileSuccess={onReconcileSuccess}
        data-testid="ReconciliationSplitPanel__46a213" />
    </div>
  );
}
