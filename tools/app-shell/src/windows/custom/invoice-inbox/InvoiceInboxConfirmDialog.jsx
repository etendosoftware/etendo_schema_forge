import { useMemo, useRef } from 'react';
import { CheckIcon, CircleNotchIcon } from '@phosphor-icons/react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { useUI } from '@/i18n';
import { useCurrency } from '@/hooks/useCurrency';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { summarizeConfirm } from './invoiceInboxConfirmModel.js';

/** Radix dismissal events (Escape, click outside) are cancelled outright while the batch runs. */
function preventWhile(locked) {
  return locked ? (event) => event.preventDefault() : undefined;
}

/** The total per currency: one line each (normally a single one). */
function TotalLines({ totals, label, labelWithCurrency }) {
  if (!totals.length) return null;
  // With more than one currency the symbol alone is a weak hint: the ISO code names each line.
  const several = totals.length > 1;
  return (
    <dl className="flex flex-col gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm" data-testid="invoice-inbox-confirm-totals">
      {totals.map(({ currency, amount }) => (
        <div key={currency} className="flex items-baseline justify-between gap-3" data-testid={`invoice-inbox-confirm-total-${currency || 'none'}`}>
          <dt className="text-muted-foreground">{several && currency ? labelWithCurrency(currency) : label}</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(currency, amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryNotes({ summary, ui }) {
  const { newProducts, skipped, mismatches } = summary;
  return (
    <>
      {newProducts > 0 && (
        <p className="text-sm" data-testid="invoice-inbox-confirm-new-products">
          {ui(newProducts === 1 ? 'invoiceInboxConfirmNewProductsOne' : 'invoiceInboxConfirmNewProductsMany', { count: newProducts })}
        </p>
      )}
      {mismatches > 0 && (
        <p className="text-sm text-status-warning-foreground" data-testid="invoice-inbox-confirm-mismatch">
          {ui(mismatches === 1 ? 'invoiceInboxConfirmMismatchWarnOne' : 'invoiceInboxConfirmMismatchWarnMany', { count: mismatches })}
        </p>
      )}
      {skipped > 0 && (
        <p className="text-sm text-status-warning-foreground" data-testid="invoice-inbox-confirm-skipped">
          {ui(skipped === 1 ? 'invoiceInboxConfirmSkippedOne' : 'invoiceInboxConfirmSkippedMany', { count: skipped })}
        </p>
      )}
    </>
  );
}

function dialogTitle(ui, count) {
  return count === 1 ? ui('invoiceInboxConfirmTitleOne') : ui('invoiceInboxConfirmTitleMany', { count });
}

function bodyText(ui, count, progress) {
  if (progress) return ui('invoiceInboxConfirmInProgress', { done: progress.done, total: progress.total });
  return ui(count === 1 ? 'invoiceInboxConfirmBodyOne' : 'invoiceInboxConfirmBodyMany');
}

/**
 * ETP-6051 — confirmation of "Confirm" in the Invoice Inbox batch bar. Shows what will happen
 * before it does: how many invoices (the confirmable rows of the selection), the total amount
 * PER CURRENCY (one line each, normally one), how many new products will be created, and how many
 * selected documents are skipped because they cannot be confirmed. Shaped like
 * `InvoiceInboxDiscardDialog` (same primitives, same busy lock).
 *
 * Opens with the focus on Cancel. While `running`: `aria-busy`, both buttons disabled, the corner X
 * hidden, Escape and clicks outside ignored, a spinner on Confirm and the `progress` ("Confirming 3
 * of 10…") as the body; the dialog stays open until the caller closes it after the run.
 *
 * @param {{ open: boolean, rows: object[], running?: boolean,
 *   progress?: {done: number, total: number}|null, onConfirm: () => void, onClose: () => void }} props
 */
export default function InvoiceInboxConfirmDialog({
  open, rows, running = false, progress = null, onConfirm, onClose,
}) {
  const ui = useUI();
  const orgCurrency = useCurrency();
  const cancelRef = useRef(null);
  const lock = preventWhile(running);
  const summary = useMemo(() => summarizeConfirm(rows, orgCurrency), [rows, orgCurrency]);
  const count = summary.confirmable.length;
  const focusCancel = (event) => {
    event.preventDefault();
    cancelRef.current?.focus();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!next && !running) onClose?.(); }}
      data-testid="Dialog__invoice-inbox-confirm">
      <DialogContent
        className={running ? 'max-w-md [&>button]:hidden' : 'max-w-md'}
        aria-busy={running || undefined}
        onOpenAutoFocus={focusCancel}
        onEscapeKeyDown={lock}
        onPointerDownOutside={lock}
        onInteractOutside={lock}
        data-testid="invoice-inbox-confirm-dialog">
        <DialogHeader data-testid="DialogHeader__invoice-inbox-confirm">
          <DialogTitle data-testid="invoice-inbox-confirm-dialog-title">{dialogTitle(ui, count)}</DialogTitle>
          <DialogDescription aria-live="polite" data-testid="invoice-inbox-confirm-dialog-body">
            {bodyText(ui, count, running ? progress : null)}
          </DialogDescription>
        </DialogHeader>
        <TotalLines totals={summary.totals} label={ui('invoiceInboxConfirmTotal')} labelWithCurrency={(currency) => ui('invoiceInboxConfirmTotalCurrency', { currency })} data-testid="TotalLines__invoice-inbox-confirm" />
        <SummaryNotes summary={summary} ui={ui} data-testid="SummaryNotes__invoice-inbox-confirm" />
        <DialogFooter data-testid="DialogFooter__invoice-inbox-confirm">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={running}
            onClick={onClose}
            data-testid="invoice-inbox-confirm-cancel">
            {ui('cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={running || count === 0}
            onClick={onConfirm}
            data-testid="invoice-inbox-confirm-confirm">
            {running
              ? <CircleNotchIcon
                  aria-hidden="true"
                  className="!size-3.5 animate-spin [animation-duration:0.8s]"
                  data-testid="invoice-inbox-confirm-spinner" />
              : <CheckIcon aria-hidden="true" data-testid="Check__invoice-inbox-confirm" />}
            {ui(running ? 'invoiceInboxConfirming' : 'invoiceInboxBulkConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
