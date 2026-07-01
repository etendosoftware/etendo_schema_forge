import { ArrowUpRight, Check } from 'lucide-react';
import { useUI } from '@/i18n';

/**
 * Right-most cell of each row in the accounts table.
 *
 * - When the account has zero pending bank-statement lines we show the
 *   "Conciliado" green pill (bg #EEFBF4, check icon #1E874C, label #17663A).
 * - Otherwise we render a clickable pill that links the user to the matching
 *   workspace (introduced in T6 / ETP-4100). In T1 the caller passes an inert
 *   onClick that fires a toast.
 */
export function ReconcilePill({ pendingCount = 0, onClick }) {
  const ui = useUI();

  if (!pendingCount || pendingCount <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[#EEFBF4] px-2 py-1 text-xs font-normal text-[#17663A]"
        data-testid="reconcile-status-reconciled"
      >
        <Check className="h-3.5 w-3.5 text-[#1E874C]" data-testid="Check__69351f" />
        {ui('financeAccountsStatusReconciled')}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-[#121217] underline decoration-[#d1d4db] underline-offset-4 hover:decoration-[#121217]"
      data-testid="reconcile-status-pending"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#f3164e]" aria-hidden="true" />
      {ui('financeAccountsReconcilePending', { count: pendingCount })}
      <ArrowUpRight className="h-3 w-3" data-testid="ArrowUpRight__69351f" />
    </button>
  );
}
