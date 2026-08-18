import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUI } from '@/i18n';
import { MoneyAmount } from '@/components/ui/money-amount';

/**
 * Confirmation step before completing a cash close (ETP-4795).
 *
 * Shown only when the close does NOT balance: completing it will post an adjustment movement
 * against the account's accounting concept for differences, and that must never happen silently.
 * A balanced close skips this dialog entirely and confirms directly.
 *
 * The dialog deliberately does NOT name the accounting concept the adjustment lands on. It is
 * configured once per account in Edit account → General and is not a decision being made here, so
 * naming it only adds a term the user has to parse at the moment they are confirming an amount.
 * `glItemDifference` is still required: with none configured the dialog says so and the confirm
 * button is disabled (the backend rejects the same case with a 400 — this is the earlier, friendlier
 * stop).
 */
export function CashCloseConfirmDialog({
  open, onOpenChange, difference, currency, glItemDifference, busy, onConfirm,
}) {
  const ui = useUI();
  const hasConcept = !!glItemDifference?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} data-testid="Dialog__cashclose">
      <DialogContent className="sm:max-w-md bg-card" data-testid="cash-close-confirm-dialog">
        <DialogHeader data-testid="DialogHeader__cashclose">
          <DialogTitle data-testid="DialogTitle__cashclose">
            {ui('financeAccountCashCloseConfirmTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3">
          <AlertTriangle
            className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--status-warning-fg)]"
            data-testid="AlertTriangle__c7cba9" />
          <div className="text-[13px] leading-[18px] text-[var(--status-warning-fg)]">
            {ui('financeAccountCashCloseConfirmDifference')}{' '}
            <MoneyAmount
              value={difference}
              currency={currency}
              tone="neutral"
              className="font-bold"
              data-testid="MoneyAmount__c7cba9" />
          </div>
        </div>

        {hasConcept ? (
          <p
            className="text-sm leading-5 text-[hsl(var(--muted-foreground))]"
            data-testid="cash-close-confirm-concept"
          >
            {ui('financeAccountCashCloseConfirmBody')}
          </p>
        ) : (
          <p
            className="text-sm leading-5 text-[hsl(var(--destructive))]"
            data-testid="cash-close-confirm-no-concept"
          >
            {ui('financeAccountCashCloseNoConceptError')}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="cash-close-confirm-cancel"
            className="inline-flex h-9 items-center rounded-full border border-[hsl(var(--border-control))] bg-card px-4 text-sm font-medium text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)] hover:bg-[hsl(var(--muted))] disabled:opacity-60"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !hasConcept}
            data-testid="cash-close-confirm-accept"
            className="inline-flex h-9 items-center rounded-full bg-[hsl(var(--foreground))] px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
          >
            {ui('financeAccountCashCloseConfirmAccept')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
