import { ArrowUpRight, Check } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Right-most cell of each row in the accounts table.
 *
 * - When the account has zero pending bank-statement lines we show the
 *   "Conciliado" green pill (bg var(--status-success-bg), check icon var(--status-success-fg), label var(--status-success-fg)).
 * - Otherwise we render a clickable pill that links the user to the matching
 *   workspace (introduced in T6 / ETP-4100). In T1 the caller passes an inert
 *   onClick that fires a toast.
 */
export function ReconcilePill({ pendingCount = 0, onClick }) {
  const ui = useUI();

  if (!pendingCount || pendingCount <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[var(--status-success-bg)] px-2 py-1 text-xs font-normal text-[var(--status-success-fg)]"
        data-testid="reconcile-status-reconciled"
      >
        <Check className="h-3.5 w-3.5 text-[var(--status-success-fg)]" data-testid="Check__69351f" />
        {ui('financeAccountsStatusReconciled')}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--foreground))] underline decoration-[hsl(var(--border-control))] underline-offset-4 hover:decoration-[hsl(var(--foreground))]"
      data-testid="reconcile-status-pending"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]" aria-hidden="true" />
      {ui('financeAccountsReconcilePending', { count: pendingCount })}
      <ArrowUpRight className="h-3 w-3" data-testid="ArrowUpRight__69351f" />
    </button>
  );
}
