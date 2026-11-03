import { ArrowUpRight } from 'lucide-react';
import { useUI } from '@/i18n';
import { MoneyAmount } from '@/components/ui/money-amount';
import { cn } from '@/lib/utils';
import { SelectBox } from './AutoMatchSelectBox.jsx';
import {
  bounceReason, isAmbiguousPair, isSelectableGroup, pairOriginalLines,
} from './bouncePairs.js';

const TAG_CLS = 'inline-flex h-6 shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-normal';

/**
 * The ONE tag of a pair row: "Confianza alta", or "Revisar: <short reason>" (ETP-5581). Kept to a
 * single tag on purpose — the signals behind it are spelled out in the reconciliation panel.
 */
function PairTag({ group, original }) {
  const ui = useUI();
  const reason = bounceReason(group, original, group.counterpartLine);
  if (reason.high) {
    return (
      <span
        className={cn(TAG_CLS, 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]')}
        data-testid={`automatch-bounce-tag-high-${group.groupKey}`}>
        {ui('financeReconcileBounceTagHigh')}
      </span>
    );
  }
  return (
    <span
      className={cn(TAG_CLS, 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]')}
      data-testid={`automatch-bounce-tag-review-${group.groupKey}`}>
      {ui('financeReconcileBounceTagReview', { reason: ui(reason.shortKey, reason.params) })}
    </span>
  );
}

/** One side of a pair row: description + signed amount, then a meta line. */
function PairSide({ line, currency, meta, strong = false, testId }) {
  const amount = Number(line?.amount ?? 0);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-3 py-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn('truncate text-sm leading-5 text-[hsl(var(--foreground))]', strong ? 'font-semibold' : 'font-medium')}
          title={line?.description || undefined}>
          {line?.description || line?.referenceNo || '—'}
        </span>
        <MoneyAmount
          value={amount}
          currency={currency || 'EUR'}
          tone={amount < 0 ? 'negative' : 'positive'}
          className="flex-none text-sm font-semibold"
          data-testid="MoneyAmount__bounce-pair" />
      </div>
      <div className="flex min-h-[24px] flex-wrap items-center justify-between gap-2">
        {meta}
      </div>
    </div>
  );
}

function BouncePairRow({ group, checked, onToggle, onReview, currency, formatDate }) {
  const ui = useUI();
  const ambiguous = isAmbiguousPair(group);
  const originals = pairOriginalLines(group);
  // An ambiguous pair shows its first candidate (they all carry the same amount) and every
  // candidate's date; which one it is gets decided in the panel.
  const original = ambiguous ? null : originals[0] ?? null;
  const shownOriginal = originals[0] ?? {};
  const originalDates = originals.map((l) => formatDate(l.date)).filter(Boolean).join(' · ');
  const bounce = group.counterpartLine ?? {};
  const review = group.confidence !== 'high' || ambiguous;
  const selectable = isSelectableGroup(group);
  return (
    <div
      className="flex flex-row items-stretch overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]"
      data-testid={`automatch-bounce-row-${group.groupKey}`}>
      <div className="flex w-8 flex-none items-start justify-center border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-1 py-3">
        <SelectBox
          checked={checked}
          disabled={!selectable}
          onClick={() => onToggle(group)}
          testId={`automatch-bounce-check-${group.groupKey}`}
          ariaLabel={ui(selectable
            ? 'financeReconcileAutomatchBounceCheck'
            : 'financeReconcileAutomatchBounceAmbiguousCheck')}
          data-testid="SelectBox__bounce-pair" />
      </div>
      <div className="flex min-w-0 flex-1 border-r border-[hsl(var(--border-subtle))] bg-card">
        <PairSide
          line={shownOriginal}
          currency={currency}
          strong
          testId={`automatch-bounce-original-${group.groupKey}`}
          meta={(
            <>
              <span className="text-xs font-medium leading-4 text-[hsl(var(--muted-foreground))]">
                {originalDates}
              </span>
              <PairTag group={group} original={original} data-testid="PairTag__bounce-pair" />
            </>
          )}
          data-testid="PairSide__bounce-original" />
      </div>
      <div className="flex min-w-0 flex-1 bg-card">
        <PairSide
          line={bounce}
          currency={currency}
          testId={`automatch-bounce-line-${group.groupKey}`}
          meta={(
            <>
              <span className="text-xs font-medium leading-4 text-[hsl(var(--muted-foreground))]">
                {formatDate(bounce.date)}
              </span>
              {review && onReview ? (
                <button
                  type="button"
                  onClick={() => onReview(group)}
                  className="inline-flex h-7 flex-none items-center gap-1 rounded-full border border-[hsl(var(--border-control))] bg-card px-2.5 text-xs font-medium text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)] hover:bg-[hsl(var(--muted))]"
                  data-testid={`automatch-bounce-review-${group.groupKey}`}>
                  <ArrowUpRight
                    className="h-4 w-4 text-[hsl(var(--text-disabled))]"
                    data-testid="ArrowUpRight__bounce-review" />
                  {ui('financeReconcileAutomatchBounceReview')}
                </button>
              ) : null}
            </>
          )}
          data-testid="PairSide__bounce-line" />
      </div>
    </div>
  );
}

/**
 * "Posibles rebotes (N)" — the bounce pairs of the automatch modal (ETP-5581), below its
 * reconciliation groups and in the same card style: left the outgoing line, right the bounce.
 *
 * - High-confidence pairs start checked; pairs to review start unchecked and carry a
 *   "Revisar en el panel" button.
 * - An ambiguous pair (several possible outgoing lines) cannot be checked here: its original is
 *   chosen in the reconciliation panel, reached with the same button.
 * - The header checkbox toggles every pair that can be checked.
 *
 * Presentational: the checks live with the caller ({@link useAutoMatchSelection}).
 *
 * @param {{ pairs: Array<object>, isChecked: (group: object) => boolean,
 *   onToggle: (group: object) => void, onToggleAll: (checked: boolean) => void,
 *   onReview?: (group: object) => void, currency: string,
 *   formatDate: (raw: string) => string }} props
 */
export function AutoMatchBounceSection({
  pairs, isChecked, onToggle, onToggleAll, onReview, currency, formatDate,
}) {
  const ui = useUI();
  if (!pairs?.length) return null;
  const selectable = pairs.filter(isSelectableGroup);
  const checkedCount = selectable.filter(isChecked).length;
  const allChecked = selectable.length > 0 && checkedCount === selectable.length;
  return (
    <section className="flex flex-col gap-3 pt-3" data-testid="automatch-bounce-section">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-row">
          <div className="flex w-8 flex-none items-center justify-center">
            <SelectBox
              dash={checkedCount > 0}
              disabled={selectable.length === 0}
              onClick={() => onToggleAll(!allChecked)}
              testId="automatch-bounce-select-all"
              ariaLabel={ui('financeReconcileAutomatchBounceSelectAll')}
              data-testid="SelectBox__bounce-select-all" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
            <span className="text-base font-semibold leading-6 text-[hsl(var(--foreground))]">
              {ui('financeReconcileAutomatchBounceTitle')}
            </span>
            <span
              className="rounded-lg border border-[hsl(var(--border-control))] bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]"
              data-testid="automatch-bounce-count">
              {pairs.length}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 items-center pl-3">
            <span className="text-base font-semibold leading-6 text-[hsl(var(--foreground))]">
              {ui('financeReconcileAutomatchBounceColBounce')}
            </span>
          </div>
        </div>
        <span className="pl-11 text-xs leading-4 text-[hsl(var(--muted-foreground))]">
          {ui('financeReconcileAutomatchBounceHint')}
        </span>
      </div>
      {pairs.map((group) => (
        <BouncePairRow
          key={group.groupKey}
          group={group}
          checked={isChecked(group)}
          onToggle={onToggle}
          onReview={onReview}
          currency={currency}
          formatDate={formatDate}
          data-testid="BouncePairRow__automatch" />
      ))}
    </section>
  );
}

export default AutoMatchBounceSection;
