import { CheckIcon, CircleNotchIcon, TrashIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { STATUS, isSelectableRow } from './invoiceInboxFilters.js';
import { canConfirm, canMarkReviewed, isConfirmRetry, pendingCount } from './invoiceInboxReviewModel.js';

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
      <span className="min-w-[120px] flex-1 truncate text-right text-xs font-medium text-destructive" role="status" data-testid="invoice-inbox-review-pending">
        {ui(pending === 1 ? 'invoiceInboxReviewPendingOne' : 'invoiceInboxReviewPendingMany', { count: pending })}
      </span>
    );
  }
  return (
    <span className="min-w-[120px] flex-1 truncate text-right text-xs font-medium text-muted-foreground" role="status" data-testid={ready ? 'invoice-inbox-review-reviewed' : 'invoice-inbox-review-pending'}>
      {ready ? ui('invoiceInboxReviewReviewedByYou') : ''}
    </span>
  );
}

/**
 * A save in flight never disables "Marcar como revisada" / "Confirmar factura" (`saving` is accepted
 * but unused): pressing a button blurs the focused input, whose commit starts a save BEFORE the click
 * lands, so a disabled button would swallow the user's click. The click handlers wait for the save
 * (`flush`), adopt its token and send nothing when it failed or left required fields pending.
 *
 * ETP-6050 F8 — the fixed footer of the review panel: an icon-only Discard (danger, 32px; hidden
 * when the document cannot be discarded; it opens the ETP-6049 confirmation through
 * `onDiscard`), the "{n} obligatorios pendientes" counter from `validation.missing` taking the
 * free space (destructive while pending, "Revisada por ti" as muted text on a READY document),
 * and "Marcar como revisada" (hidden when READY) / "Confirmar factura". S2: "Marcar como
 * revisada" is live (`onMarkReviewed`): enabled only on a valid PENDING_REVIEW document with no
 * save in flight; without the handler (a footer rendered on its own) it stays the disabled
 * "Próximamente" button. ETP-6051: "Confirmar factura" is live (`onConfirm`): enabled on a valid
 * PENDING_REVIEW / READY document with no save in flight (`canConfirm`); on a failed confirm
 * (ERROR / CONFIRM_FAILED) it reads "Reintentar" and runs the same confirm. Without the handler (a
 * footer rendered on its own) it stays the disabled "Próximamente" button. A confirmed or discarded
 * document has no footer.
 *
 * With `locked` (`editable: false`, e.g. a foreign receiver) only Discard is offered.
 *
 * @param {{review: object, onDiscard: () => void, discarding?: boolean, locked?: boolean,
 *   onMarkReviewed?: () => void, onConfirm?: () => void, saving?: boolean, marking?: boolean,
 *   confirming?: boolean}} props
 */
export default function InvoiceInboxReviewFooter({
  review, onDiscard, discarding = false, locked = false, onMarkReviewed = null, saving = false, marking = false,
  onConfirm = null, confirming = false,
}) {
  const ui = useUI();
  if (review.status === STATUS.CONFIRMED || review.status === STATUS.DISCARDED) return null;
  const ready = review.status === STATUS.READY;
  const canDiscard = isSelectableRow({ status: review.status });
  // `editable: false` (e.g. a foreign receiver): the only action left is Discard.
  if (locked && !canDiscard) return null;
  // `pr-[76px]`: the app's floating chat bubble (about 48px, bottom right) must never cover the primary action.
  return (
    <footer
      className="flex flex-none flex-wrap items-center gap-2 border-t border-border py-3 pl-5 pr-[76px]"
      data-testid="invoice-inbox-review-footer">
      {canDiscard && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={discarding || confirming}
          onClick={onDiscard}
          aria-label={ui('invoiceInboxBulkDiscard')}
          title={ui('invoiceInboxBulkDiscard')}
          className="h-8 w-8 flex-none border-destructive/30 bg-[var(--status-destructive-bg)] text-destructive hover:bg-[var(--status-destructive-bg)] hover:text-destructive"
          data-testid="invoice-inbox-review-discard">
          <TrashIcon className="h-4 w-4" aria-hidden="true" data-testid="Trash2__review-discard" />
        </Button>
      )}
      {locked ? <span className="flex-1" /> : <CounterText pending={pendingCount(review.document)} ready={ready} data-testid="CounterText__review" />}
      <div className="flex flex-none flex-wrap items-center justify-end gap-2 max-[480px]:w-full max-[480px]:[&>*]:min-w-[150px] max-[480px]:[&>*]:flex-1" data-testid="invoice-inbox-review-footer-actions">
      {!locked && !ready && !onMarkReviewed && (
        <SoonButton
          label={ui('invoiceInboxReviewMarkReviewed')}
          variant="secondary"
          testId="invoice-inbox-review-mark-reviewed"
          data-testid="SoonButton__822e07" />
      )}
      {!locked && !ready && onMarkReviewed && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!canMarkReviewed(review) || marking || confirming}
          onClick={onMarkReviewed}
          data-testid="invoice-inbox-review-mark-reviewed">
          {marking && <CircleNotchIcon className="h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__review-marking" />}
          {ui('invoiceInboxReviewMarkReviewed')}
        </Button>
      )}
      {!locked && !onConfirm && (
        <SoonButton
          label={ui('invoiceInboxReviewConfirm')}
          icon={CheckIcon}
          variant="default"
          testId="invoice-inbox-review-confirm"
          data-testid="SoonButton__822e07" />
      )}
      {!locked && onConfirm && (
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={!canConfirm(review) || marking || confirming || discarding}
          onClick={onConfirm}
          data-testid="invoice-inbox-review-confirm">
          {confirming
            ? <CircleNotchIcon className="h-4 w-4 animate-spin" aria-hidden="true" data-testid="Loader2__review-confirming" />
            : <CheckIcon className="h-4 w-4" aria-hidden="true" data-testid="Check__review-confirm" />}
          {ui(isConfirmRetry(review) ? 'invoiceInboxReviewRetryConfirm' : 'invoiceInboxReviewConfirm')}
        </Button>
      )}
      </div>
    </footer>
  );
}
