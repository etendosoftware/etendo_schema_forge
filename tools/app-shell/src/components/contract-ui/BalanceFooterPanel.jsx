import { useUI } from '@/i18n';
import { computeBalance } from '@/lib/balanceTotals';

/**
 * BalanceFooterPanel — generic debit/credit balance footer for double-entry
 * windows (e.g. manual journals). Renders Σ debit and Σ credit only; the
 * balance check itself (difference/isBalanced) is computed here but kept
 * internal — it is not rendered — and Save/Complete blocking still relies on
 * `computeBalance` directly (see `blockSaveForBalance`/`blockCompleteForBalance`
 * in DetailView.jsx). Activated by decisions.json
 * `window.balanceFooter: { debitField, creditField }`.
 *
 * Props:
 *   lines, pendingLine, editingLine — line snapshots (see computeBalance)
 *   config        — { debitField, creditField }
 *   formatAmount  — (amount, currency?) => string
 *   currency      — currency identifier string
 */
export default function BalanceFooterPanel({
  lines = [],
  pendingLine = null,
  editingLine = null,
  config,
  formatAmount,
  currency,
}) {
  const ui = useUI();
  const { totalDebit, totalCredit } = computeBalance(lines, pendingLine, editingLine, config);

  const fmt = (v) => (typeof formatAmount === 'function' ? formatAmount(v, currency) : String(v));

  return (
    <div className="mt-1 flex flex-col items-end" data-testid="balance-footer">
      <div className="w-full text-sm pr-12">
        <div className="flex justify-between py-2 px-2">
          <span className="text-muted-foreground">{ui('totalDebit')}</span>
          <span className="tabular-nums" data-testid="balance-total-debit">{fmt(totalDebit)}</span>
        </div>
        <div className="flex justify-between py-2 px-2">
          <span className="text-muted-foreground">{ui('totalCredit')}</span>
          <span className="tabular-nums" data-testid="balance-total-credit">{fmt(totalCredit)}</span>
        </div>
      </div>
    </div>
  );
}
