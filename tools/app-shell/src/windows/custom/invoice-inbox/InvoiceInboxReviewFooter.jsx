import { Check, Trash2 } from 'lucide-react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { STATUS, isSelectableRow } from './invoiceInboxFilters.js';
import { pendingCount } from './invoiceInboxReviewModel.js';

/** A disabled action with its "coming soon" tooltip on the wrapper (a disabled button gets no pointer events). */
function SoonButton({ label, icon: Icon = null, variant, testId }) {
  const ui = useUI();
  return (
    <span title={ui('comingSoon')} className="inline-flex flex-none" data-testid={`${testId}-wrapper`}>
      <Button type="button" variant={variant} size="sm" disabled data-testid={testId}>
        {Icon && <Icon className="h-4 w-4" aria-hidden="true" data-testid={`Icon__${testId}`} />}
        {label}
      </Button>
    </span>
  );
}

/** The free-space slot: the pending counter, or "Revisada por ti" on a READY document. */
function CounterText({ pending, ready }) {
  const ui = useUI();
  if (pending > 0) {
    return (
      <span className="min-w-0 flex-1 truncate text-right text-xs font-medium text-destructive" role="status" data-testid="invoice-inbox-review-pending">
        {ui(pending === 1 ? 'invoiceInboxReviewPendingOne' : 'invoiceInboxReviewPendingMany', { count: pending })}
      </span>
    );
  }
  return (
    <span className="min-w-0 flex-1 truncate text-right text-xs font-medium text-muted-foreground" role="status" data-testid={ready ? 'invoice-inbox-review-reviewed' : 'invoice-inbox-review-pending'}>
      {ready ? ui('invoiceInboxReviewReviewedByYou') : ''}
    </span>
  );
}

/**
 * ETP-6050 F8 — the fixed footer of the review panel: an icon-only Discard (danger, 32px; hidden
 * when the document cannot be discarded; it opens the ETP-6049 confirmation through
 * `onDiscard`), the "{n} obligatorios pendientes" counter from `validation.missing` taking the
 * free space (destructive while pending, "Revisada por ti" as muted text on a READY document),
 * and "Marcar como revisada" (hidden when READY) / "Confirmar factura", shown DISABLED
 * ("Próximamente") until S3 / ETP-6051. A confirmed or discarded document has no footer.
 *
 * With `locked` (`editable: false`, e.g. a foreign receiver) only Discard is offered.
 *
 * @param {{review: object, onDiscard: () => void, discarding?: boolean, locked?: boolean}} props
 */
export default function InvoiceInboxReviewFooter({ review, onDiscard, discarding = false, locked = false }) {
  const ui = useUI();
  if (review.status === STATUS.CONFIRMED || review.status === STATUS.DISCARDED) return null;
  const ready = review.status === STATUS.READY;
  const canDiscard = isSelectableRow({ status: review.status });
  // `editable: false` (e.g. a foreign receiver): the only action left is Discard.
  if (locked && !canDiscard) return null;
  return (
    <footer
      className="flex flex-none items-center gap-2 border-t border-border px-5 py-3"
      data-testid="invoice-inbox-review-footer">
      {canDiscard && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={discarding}
          onClick={onDiscard}
          aria-label={ui('invoiceInboxBulkDiscard')}
          title={ui('invoiceInboxBulkDiscard')}
          className="h-8 w-8 flex-none border-destructive/30 bg-[var(--status-destructive-bg)] text-destructive hover:bg-[var(--status-destructive-bg)] hover:text-destructive"
          data-testid="invoice-inbox-review-discard">
          <Trash2 className="h-4 w-4" aria-hidden="true" data-testid="Trash2__review-discard" />
        </Button>
      )}
      {locked ? <span className="flex-1" /> : <CounterText pending={pendingCount(review.document)} ready={ready} data-testid="CounterText__review" />}
      {!locked && !ready && (
        <SoonButton
          label={ui('invoiceInboxReviewMarkReviewed')}
          variant="secondary"
          testId="invoice-inbox-review-mark-reviewed" />
      )}
      {!locked && (
        <SoonButton
          label={ui('invoiceInboxReviewConfirm')}
          icon={Check}
          variant="default"
          testId="invoice-inbox-review-confirm" />
      )}
    </footer>
  );
}
