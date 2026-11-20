import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * ETP-6084 D8 — the Trial Balance's check, from the answer's `balance` ({ balanced, debitCreditDiff, closingDiff }):
 * total debit = total credit and the closing balances add up to zero. With a dimension filter or an account range
 * (`partial`) a mismatch is expected, so it is a note, not an error.
 */
export default function DynamicReportBalance({ balance, partial = false }) {
  const ui = useUI();
  if (balance.balanced) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-status-success-foreground mb-3" data-testid="DynamicReportBalance__ok">
        <CheckCircleIcon className="w-4 h-4" data-testid="CheckCircle__balance" />{ui('dynamicReportBalanced')}
      </p>
    );
  }
  return (
    <p role={partial ? undefined : 'alert'} className={`flex items-start gap-1.5 text-xs mb-3 ${partial ? 'text-muted-foreground' : 'text-destructive'}`} data-testid={partial ? 'DynamicReportBalance__partial' : 'DynamicReportBalance__error'}>
      <WarningIcon className="w-4 h-4 shrink-0" data-testid="Warning__balance" />
      <span>
        {ui(partial ? 'dynamicReportBalancePartial' : 'dynamicReportUnbalanced')}{' '}
        {ui('dynamicReportBalanceDiff', { debitCredit: formatCurrency(null, balance.debitCreditDiff), closing: formatCurrency(null, balance.closingDiff) })}
      </span>
    </p>
  );
}
