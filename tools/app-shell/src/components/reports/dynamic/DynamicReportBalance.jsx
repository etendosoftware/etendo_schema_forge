import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * ETP-6084 D8 — the Trial Balance's check, from the answer's `balance` ({ balanced, debitCreditDiff, closingDiff }):
 * total debit = total credit and the closing balances add up to zero. With a dimension filter or an account range
 * (`partial`) a mismatch is expected, so it is a note, not an error.
 *
 * ETP-6083: a balance sheet's check ({ balanced, activo, pnPasivo, diff }, core `balanceCheck`): assets = equity and
 * liabilities. With a filter the result is partial; with a product filter (`productFiltered`) the opening balances
 * carry no product, so the prior years of a closed year are missing too.
 */
export default function DynamicReportBalance({ balance, partial = false, productFiltered = false }) {
  const ui = useUI();
  const sheet = 'activo' in balance;
  if (balance.balanced) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-status-success-foreground mb-3" data-testid="DynamicReportBalance__ok">
        <CheckCircleIcon className="w-4 h-4" data-testid="CheckCircle__balance" />{ui(sheet ? 'dynamicReportSheetBalanced' : 'dynamicReportBalanced')}
      </p>
    );
  }
  return (
    <p role={partial ? undefined : 'alert'} className={`flex items-start gap-1.5 text-xs mb-3 ${partial ? 'text-muted-foreground' : 'text-destructive'}`} data-testid={partial ? 'DynamicReportBalance__partial' : 'DynamicReportBalance__error'}>
      <WarningIcon className="w-4 h-4 shrink-0" data-testid="Warning__balance" />
      <span>
        {sheet ? sheetText(balance, partial, productFiltered, ui) : trialText(balance, partial, ui)}
      </span>
    </p>
  );
}

function trialText(balance, partial, ui) {
  return `${ui(partial ? 'dynamicReportBalancePartial' : 'dynamicReportUnbalanced')} ${ui('dynamicReportBalanceDiff', { debitCredit: formatCurrency(null, balance.debitCreditDiff), closing: formatCurrency(null, balance.closingDiff) })}`;
}

function sheetText(balance, partial, productFiltered, ui) {
  const lead = ui(partial ? 'dynamicReportSheetPartial' : 'dynamicReportSheetUnbalanced');
  const diff = ui('dynamicReportSheetDiff', { assets: formatCurrency(null, balance.activo), equity: formatCurrency(null, balance.pnPasivo), diff: formatCurrency(null, balance.diff) });
  const note = partial && productFiltered ? ` ${ui('dynamicReportSheetProductNote')}` : '';
  return `${lead} ${diff}${note}`;
}
