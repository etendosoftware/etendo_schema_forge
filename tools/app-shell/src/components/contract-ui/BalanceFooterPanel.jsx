import { useUI } from '@/i18n';
import { computeBalance } from '@/lib/balanceTotals';

/**
 * BalanceFooterPanel — generic debit/credit balance footer for double-entry
 * windows (e.g. manual journals). Renders Σ debit, Σ credit, the difference,
 * and a balanced/unbalanced badge. Activated by decisions.json
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
  const { totalDebit, totalCredit, difference, isBalanced, hasAmounts } =
    computeBalance(lines, pendingLine, editingLine, config);

  const fmt = (v) => (typeof formatAmount === 'function' ? formatAmount(v, currency) : String(v));

  const divider = (
    <div style={{ borderTopWidth: '0.5px', borderTopStyle: 'solid', borderTopColor: 'var(--border)' }} />
  );

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
        {divider}
        <div className="flex justify-between items-center py-2 px-2 font-semibold">
          <span>{ui('difference')}</span>
          <div className="flex items-center gap-2">
            <span className="tabular-nums" data-testid="balance-difference">{fmt(difference)}</span>
            {hasAmounts && (
              <span
                data-testid="balance-status"
                data-balanced={String(isBalanced)}
                className={`text-xs rounded px-2 py-0.5 ${isBalanced ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
              >
                {isBalanced ? `✓ ${ui('balanced')}` : `✗ ${ui('unbalanced')}`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
