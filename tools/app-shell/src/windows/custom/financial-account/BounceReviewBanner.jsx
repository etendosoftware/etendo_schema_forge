import { useUI } from '@/i18n';

/**
 * "Volver a las sugerencias (N)" (ETP-5581) — shown above the reconciliation while the user reviews
 * a bounce pair they reached from the automatch modal with "Revisar en el panel". The modal is
 * hidden, not closed: what was checked in it is kept, and this reopens it as it was.
 *
 * Renders nothing outside a review, while the modal is open (`hidden`), or when there is nothing
 * left to go back to.
 *
 * @param {{ reviewing: boolean, hidden?: boolean, count: number, onBack: () => void }} props
 *   `count` is the suggestions still offered
 */
export function BounceReviewBanner({
  reviewing, hidden = false, count, onBack,
}) {
  const ui = useUI();
  if (!reviewing || hidden || !(count > 0)) return null;
  return (
    <div
      role="status"
      className="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] bg-[var(--status-info-bg)] px-4 py-2 text-[var(--status-info-fg)]"
      data-testid="recon-bounce-review-banner">
      <span className="text-sm font-medium">{ui('financeReconcileBounceReviewBanner')}</span>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-8 items-center rounded-full border border-[var(--status-info-border)] bg-card px-3 text-sm font-medium text-[var(--status-info-fg)] hover:bg-[hsl(var(--muted))]"
        data-testid="recon-bounce-review-back">
        {ui('financeReconcileBounceReviewBack', { count })}
      </button>
    </div>
  );
}

export default BounceReviewBanner;
