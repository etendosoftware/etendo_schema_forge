import { useMemo, useCallback } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { translateBackendError, translateBackendErrorBody } from '@/lib/backendErrors.js';
import { useApplySuggestions } from '@/hooks/useReconciliation';
import { useAutoMatchSelection } from '@/hooks/useAutoMatchReview.js';
import { cn } from '@/lib/utils';
import { formatCalendarDate } from '@/lib/dateOnly';
import { StatusBadge, automatchBadgeKind } from './reconciliationBadges.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { AutoMatchBounceSection } from './AutoMatchBounceSection.jsx';
import {
  bouncePairPayload, splitAutoMatchGroups, summarizeApplyResults,
} from './bouncePairs.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLineDate(isoDate) {
  if (!isoDate) return '';
  return formatCalendarDate(isoDate, 'es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function RuleTypeBadge({ label, tone = 'default' }) {
  const cls = {
    default: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    rule: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]',
    new: 'bg-[var(--status-info-bg)] text-[var(--status-info-fg)]',
  }[tone] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-1 text-xs font-normal leading-4', cls)}>
      {label}
    </span>
  );
}

function formatSignedAmount(amount, currency) {
  if (amount === 0) return '—';
  const sign = amount < 0 ? '-' : '+';
  return `${sign}${formatCurrency(currency, Math.abs(amount))}`;
}

/* The checkboxes are the shared `Checkbox` (`@/components/ui/checkbox`), the one DataTable and every
   list use for row selection, so the modal gets the same look and the same indeterminate state. */

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function StatementContent({ group, currency }) {
  const ui = useUI();
  const line = group.statementLine ?? {};
  const opCount = (group.operations ?? []).length;
  const amount = Number(line.amount ?? 0);
  const isRule = group.origin === 'rule';
  // Every group states its type, using the same pill the left panel shows for the same line. Only
  // rule groups used to be labelled, so an exact match and a within-tolerance one looked identical
  // even though the second one posts an accounting entry (ETP-4965 QA round).
  const badgeKind = automatchBadgeKind(group);
  // The rule badge keeps its own key because it appends the rule name; the other two are the plain
  // shared labels ("Con sugerencia" / "Con diferencia").
  const badgeLabel = isRule && group.ruleName
    ? `${ui('financeReconcileAutomatchBadgeByRule')} ${group.ruleName}`
    : undefined;

  return (
    <div className="flex flex-col gap-1">
      {/* Header row: name (+ count) + amount */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold leading-5 text-[hsl(var(--foreground))]">
            {line.description || line.referenceNo || '—'}
          </span>
          {opCount > 0 && (
            <span className="flex-none rounded-lg bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
              {opCount}
            </span>
          )}
        </div>
        <MoneyAmount
          value={amount}
          currency={currency || 'EUR'}
          tone={amount < 0 ? 'negative' : 'positive'}
          className="flex-none text-sm font-semibold"
          data-testid="MoneyAmount__a89979" />
      </div>
      {/* Type badge: suggested / difference / by rule */}
      <div className="flex gap-1" data-testid={`automatch-group-kind-${badgeKind}`}>
        <StatusBadge kind={badgeKind} label={badgeLabel} data-testid="StatusBadge__a89979" />
      </div>
      {/* Reference + date */}
      {line.referenceNo && (
        <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">{line.referenceNo}</span>
      )}
      {line.date && (
        <span className="text-xs font-medium leading-4 text-[hsl(var(--muted-foreground))]">{formatLineDate(line.date)}</span>
      )}
    </div>
  );
}

/**
 * What the operation cell calls this row. A difference row names the accounting account the leftover
 * will be posted to; it is always known, because the engine only proposes an amount deviation when
 * the financial account has one configured.
 */
function displayName(op) {
  if (op.isNew) return op.name || op.glItemId || '—';
  return op.partnerName || op.documentNo || '—';
}

function OperationRow({ op, isLast, currency }) {
  const ui = useUI();
  const amount = Number(op.amount ?? 0);
  const isNew = op.isNew;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-3',
        !isLast && 'border-b border-[hsl(var(--border-subtle))]',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium leading-5 text-[hsl(var(--foreground))]">
            {displayName(op)}
          </span>
          <RuleTypeBadge
            label={isNew ? ui('financeReconcileAutomatchBadgeNew') : (op.documentNo || op.typeLabel || '')}
            tone={isNew ? 'new' : 'default'}
            data-testid="RuleTypeBadge__a89979" />
        </div>
        {isNew && (
          <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">
            {ui(op.isDifference ? 'financeReconcileAutomatchOpDifference' : 'financeReconcileAutomatchOpNew')}
          </span>
        )}
        {/* The movement's own description — what the Movimientos list shows. A payment number on
            its own identifies nothing to whoever approves the batch. */}
        {!isNew && op.description && (
          <span
            className="truncate text-xs leading-4 text-[hsl(var(--muted-foreground))]"
            data-testid="automatch-op-description">
            {op.description}
          </span>
        )}
      </div>
      <div className="flex-none text-right">
        <div className={cn(
          'text-sm font-semibold leading-5',
          amount < 0 ? 'text-[hsl(var(--destructive))]' : 'text-[var(--status-success-fg)]',
        )}>
          {formatSignedAmount(amount, currency)}
        </div>
        {op.date && (
          <div className="text-xs font-medium leading-4 text-[hsl(var(--muted-foreground))]">{formatLineDate(op.date)}</div>
        )}
      </div>
    </div>
  );
}

function GroupRow({ group, checked, onToggle, currency, glItemDifference }) {
  const ui = useUI();
  const statementLine = group.statementLine ?? {};
  const realOps = group.operations ?? [];
  // Rule-origin groups have no existing transaction — the system will create a payment.
  // For now this is purely visual: show one proposed "New / Create payment" operation with the
  // rule name and the statement-line amount. The actual creation is wired in a later step.
  const baseOps = group.origin === 'rule'
    ? [{
        id: 'new',
        isNew: true,
        name: group.ruleName,
        amount: Number(group.statementLine?.amount ?? 0),
      }]
    : realOps;

  // A near match links its operation AND posts the leftover to the account's accounting account.
  // That second movement was invisible until now: the modal showed only the linked operation, so
  // the user could not tell a within-tolerance match from an exact one, nor where the difference
  // would land. Same shape a rule group already uses for its proposed movement.
  const difference = Number(group.difference ?? 0);
  const ops = group.nearMatch && Math.abs(difference) > 0
    ? [...baseOps, {
        id: 'difference',
        isNew: true,
        isDifference: true,
        name: glItemDifference?.name || '',
        amount: difference,
      }]
    : baseOps;

  return (
    <div className="flex flex-row items-stretch overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]">
      {/* Checkbox sidebar */}
      <div className="flex w-8 flex-none items-start justify-center border-r border-[hsl(var(--border-subtle))] bg-[hsl(var(--muted))] px-1 py-3">
        <Checkbox
          checked={checked}
          onChange={() => onToggle(group)}
          aria-label={ui('financeReconcileAutomatchGroupCheck', {
            line: statementLine.description || statementLine.referenceNo || '—',
          })}
          data-testid={`automatch-group-check-${group.groupKey}`} />
      </div>
      {/* Statement line (left half) */}
      <div className="flex min-w-0 flex-1 items-start border-r border-[hsl(var(--border-subtle))] bg-card px-3 py-3">
        <div className="w-full">
          <StatementContent group={group} currency={currency} data-testid="StatementContent__a89979" />
        </div>
      </div>
      {/* Operations (right half) */}
      <div className="flex min-w-0 flex-1 flex-col bg-card">
        {ops.length === 0 ? (
          <div className="px-3 py-3 text-sm text-[hsl(var(--muted-foreground))]">—</div>
        ) : (
          ops.map((op, i) => (
            <OperationRow
              key={op.id ?? i}
              op={op}
              isLast={i === ops.length - 1}
              currency={currency}
              data-testid="OperationRow__a89979" />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

/**
 * The footer sentence for the checked suggestions. Transaction groups keep the wording they always
 * had ("Se vincularán N operación(es). Se crearán M movimiento(s)."); checked bounce pairs add the
 * lines they discard, joined to the link sentence when both are present (ETP-5581).
 *
 * @param {function} ui the `useUI()` translator
 * @param {{ willLink: number, willCreate: number, pairCount: number, hasPairs: boolean }} counts
 * @returns {string}
 */
function footerSummaryText(ui, {
  willLink, willCreate, pairCount, hasPairs,
}) {
  if (willLink + willCreate + pairCount === 0) {
    return ui(hasPairs ? 'financeReconcileAutomatchFooterNoneSelected' : 'financeReconcileAutomatchFooterNone');
  }
  const lines = pairCount * 2;
  const linkAndDiscard = willLink > 0 && pairCount > 0;
  return [
    linkAndDiscard && ui('financeReconcileAutomatchFooterLinkAndDiscard', { link: willLink, lines }),
    !linkAndDiscard && willLink > 0 && ui('financeReconcileAutomatchFooterLink', { count: willLink }),
    willCreate > 0 && ui('financeReconcileAutomatchFooterCreate', { count: willCreate }),
    !linkAndDiscard && pairCount > 0 && ui('financeReconcileAutomatchFooterDiscard', { count: lines }),
  ].filter(Boolean).join(' ');
}

/**
 * The primary button label: "Conciliar N grupo(s)" as always, or the bounce-pair variants
 * ("Conciliar N grupo(s) y descartar M par(es)", "Descartar M par(es)") when pairs are checked.
 */
function applyLabelText(ui, groupCount, pairCount) {
  if (pairCount === 0) return ui('financeReconcileAutomatchActionApply', { count: groupCount });
  if (groupCount === 0) return ui('financeReconcileAutomatchActionDiscardPairs', { count: pairCount });
  return ui('financeReconcileAutomatchActionApplyAndDiscard', { groups: groupCount, pairs: pairCount });
}

/**
 * The toast of an apply of transaction groups only — the modal's toast before ETP-5581, unchanged.
 *
 * applySuggestions answers 201 even when every group is rejected — the reason travels inside
 * results[]. Reducing that to two counters is what produced a bare "Error al aplicar la
 * conciliación" for problems the backend had already explained.
 */
function notifyApplyResults(results, ui) {
  const failures = results.filter((r) => r?.error);
  const failedCount = failures.length;
  const successCount = results.length - failedCount;
  if (failedCount === 0) {
    toast.success(ui('financeReconcileAutomatchToastSuccess', { count: successCount }));
  } else if (successCount > 0) {
    toast.warning(ui('financeReconcileAutomatchToastPartial', { success: successCount, failed: failedCount }));
  } else {
    // ETP-5121: the backend explains itself in English (e.g. the draft-statement guard);
    // translateBackendError maps the known sentences to a locale key and passes anything
    // else through untouched, so an unmapped message still reaches the user.
    toast.error(translateBackendError(failures[0]?.error?.message, ui)
      || ui('financeReconcileAutomatchToastError'));
  }
}

/**
 * The toast of an apply that carried bounce pairs (ETP-5581): what was reconciled, what was
 * discarded, and the first refusal translated — a bounce refusal is coded (`error.messageKeys`), so
 * it goes through `translateBackendErrorBody`. An apply without pairs keeps its original toast.
 */
function notifyApplyWithPairs(results, ui) {
  const { groupsOk, pairsOk, failures } = summarizeApplyResults(results);
  const done = [
    groupsOk > 0 && ui('financeReconcileAutomatchToastSuccess', { count: groupsOk }),
    pairsOk > 0 && ui('financeReconcileAutomatchToastPairsDiscarded', { count: pairsOk, lines: pairsOk * 2 }),
  ].filter(Boolean).join(' ');
  if (failures.length === 0) {
    toast.success(done);
    return;
  }
  const reason = translateBackendErrorBody(failures[0], ui, null) || ui('financeReconcileAutomatchToastError');
  if (groupsOk + pairsOk > 0) {
    toast.warning(
      `${done} ${ui('financeReconcileAutomatchToastSomeFailed', { count: failures.length })}`,
      { description: reason },
    );
    return;
  }
  toast.error(reason);
}

/**
 * Automatch suggestion modal — two-column layout matching the Figma design:
 * left = bank statement lines (with checkboxes), right = system operations to link.
 *
 * ETP-5581 — with the backend flag `bank-bounce-suggestions` on, `groups` also carries bounce pairs
 * (`kind: "bouncePair"`), rendered below the reconciliation groups as "Rebotes bancarios (N)"
 * ({@link AutoMatchBounceSection}) and applied in the SAME `applySuggestions` call. With the flag
 * off nothing in `groups` has that kind and the modal is exactly what it was.
 *
 * @param {{ accountId, accountName?, groups, kpis, currency?, open, onClose, onSuccess?,
 *   glItemDifference?, selection?, dismissedPairKeys?, onReviewPair? }} props `glItemDifference`
 *   is the account's `{ id, name }` for differences — the same object `ReconciliationTab` composes
 *   for the panel — used to name the movement a near-match group will create. It is always set
 *   when such a group is present: the engine does not propose an amount deviation for an account
 *   with nowhere to post it.
 *   `selection` (ETP-5581) lifts the checks out of the modal ({@link useAutoMatchSelection}) so the
 *   host decides how long they live (the financial-account detail keeps them across a close while
 *   the suggestions do not reload); without it the modal keeps its own. `dismissedPairKeys`
 *   are pairs the user said are not a bounce, hidden here. `onReviewPair(group)` is "Revisar en el
 *   panel"; without it the button is not offered.
 */
export function AutoMatchSuggestionModal({
  accountId,
  accountName = '',
  groups = [],
  kpis = {},
  currency = 'EUR',
  open,
  onClose,
  onSuccess,
  glItemDifference = null,
  selection = null,
  dismissedPairKeys = null,
  onReviewPair = null,
}) {
  const ui = useUI();
  const { apply, loading } = useApplySuggestions();

  // The checks default to every transaction group (and every high-confidence pair) whenever the
  // suggestions (re)load. The host may own them (`selection`); otherwise the modal does.
  const ownSelection = useAutoMatchSelection(groups);
  const { isChecked, toggle, setMany } = selection ?? ownSelection;

  const { transactionGroups, bouncePairs: allPairs } = useMemo(
    () => splitAutoMatchGroups(groups), [groups]);
  const pairs = useMemo(
    () => (dismissedPairKeys?.size ? allPairs.filter((p) => !dismissedPairKeys.has(p.groupKey)) : allPairs),
    [allPairs, dismissedPairKeys],
  );

  const checkedGroups = useMemo(
    () => transactionGroups.filter(isChecked), [transactionGroups, isChecked]);
  const checkedPairs = useMemo(() => pairs.filter(isChecked), [pairs, isChecked]);

  const allChecked = checkedGroups.length === transactionGroups.length && transactionGroups.length > 0;

  const toggleAll = useCallback(() => {
    setMany(transactionGroups, !allChecked);
  }, [allChecked, setMany, transactionGroups]);

  const toggleAllPairs = useCallback((on) => setMany(pairs, on), [pairs, setMany]);

  // A near-match group both links its operation AND creates the movement that absorbs the
  // difference, so it counts on both sides. Counting only the link is what made the footer promise
  // one movement while the apply created two. A DATE-only near match has a zero difference and
  // creates nothing — same rule the backend's willCreate KPI applies.
  const willCreate = checkedGroups.filter(
    (g) => g.isNew || (g.nearMatch && Math.abs(Number(g.difference ?? 0)) > 0)).length;
  const willLink = checkedGroups.filter((g) => !g.isNew).length;
  const applyCount = checkedGroups.length + checkedPairs.length;

  const handleApply = async () => {
    if (applyCount === 0 || loading) return;
    try {
      const payload = {
        financialAccountId: accountId,
        groups: [
          ...checkedGroups.map((g) => ({
            statementLineId: g.statementLine?.id,
            operationIds: (g.operations ?? []).filter((o) => !o.isNew).map((o) => o.id),
            ...(g.createPayment ? { createPayment: g.createPayment } : {}),
          })),
          // ETP-5581 — the checked bounce pairs travel in the same call; the backend discards
          // them first and refuses a line that two checked suggestions share.
          ...checkedPairs.map(bouncePairPayload),
        ],
      };
      const response = await apply(payload);
      const results = response?.results ?? [];
      if (checkedPairs.length > 0) notifyApplyWithPairs(results, ui);
      else notifyApplyResults(results, ui);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(translateBackendError(err?.message, ui) || ui('financeReconcileAutomatchToastError'));
    }
  };

  const footerSummary = footerSummaryText(ui, {
    willLink, willCreate, pairCount: checkedPairs.length, hasPairs: pairs.length > 0,
  });
  // The transaction-group block (its column header + rows, or the empty state) stays as it always
  // was, and only steps aside when the run found bounce pairs and nothing else.
  const showGroupBlock = transactionGroups.length > 0 || pairs.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__a89979">
      <DialogContent
        className="overflow-hidden p-0"
        style={{
          width: '1248px',
          maxWidth: '96vw',
          background: 'hsl(var(--card))',
          boxShadow: '0px 0px 0px 1px hsl(var(--foreground) / 0.1), 0px 24px 48px hsl(var(--foreground) / 0.03), 0px 10px 18px hsl(var(--foreground) / 0.03), 0px 5px 8px hsl(var(--foreground) / 0.04)',
          borderRadius: '8px',
        }}
        data-testid="automatch-suggestion-modal"
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center px-5 pt-3 pb-2" style={{ height: 48, borderBottom: '1px solid hsl(var(--border-subtle))' }}>
          <DialogTitle
            className="m-0 text-xl font-semibold leading-7 text-[hsl(var(--foreground))]"
            data-testid="DialogTitle__a89979">
            {ui('financeReconcileAutomatchModalTitle')}
          </DialogTitle>
        </div>

        {/* ── KPI strip ─────────────────────────────────────────────────── */}
        <div className="mx-5 mt-3 mb-2 flex items-center justify-between rounded-lg bg-[hsl(var(--muted))] px-3 py-2" style={{ height: 52 }}>
          {[
            { label: ui('financeReconcileAutomatchKpiAccount'), value: accountName },
            { label: ui('financeReconcileAutomatchKpiPending'), value: kpis.pendingLines ?? 0 },
            { label: ui('financeReconcileAutomatchKpiGroups'), value: kpis.groupsFound ?? 0 },
            { label: ui('financeReconcileAutomatchKpiOps'), value: kpis.opsToLink ?? 0 },
            // "A crear" was translated in all three locales but never rendered, so the movements
            // the run generates (rule payments + difference postings) had no figure anywhere.
            { label: ui('financeReconcileAutomatchKpiNew'), value: kpis.willCreate ?? 0 },
            // ETP-5581 — only when the backend reports bounce pairs (flag on): the pairs still
            // offered, the same figure the section header shows.
            ...(kpis.bouncePairs == null ? [] : [
              { label: ui('financeReconcileAutomatchKpiBouncePairs'), value: pairs.length },
            ]),
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-1 flex-col">
              <span className="text-xs leading-4 text-[hsl(var(--muted-foreground))]">{label}</span>
              <span className="text-sm font-medium leading-5 text-[hsl(var(--foreground))]">{value}</span>
            </div>
          ))}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col" style={{ height: 'calc(703px - 48px - 68px - 64px)', overflow: 'hidden' }}>
          {/* Column headers — mirrors GroupRow's box model (w-8 checkbox sidebar as a sibling of
              the two flex-1 columns, not nested in the first one) so the divider between the two
              title blocks lands exactly above the divider between the two row columns. */}
          {showGroupBlock ? (
            <div className="flex flex-row px-5 pb-0 pt-3">
              {/* Select-all sits in a w-8 box so its center lines up with the per-row checkbox
                  sidebar. Shows a dash whenever there is any selection (same control as the rows). */}
              <div className="flex w-8 flex-none items-center justify-center">
                <Checkbox
                  indeterminate={checkedGroups.length > 0}
                  onChange={toggleAll}
                  aria-label={ui('financeReconcileColSelect')}
                  data-testid="automatch-select-all" />
              </div>
              {/* Left header */}
              <div className="flex min-w-0 flex-1 items-center gap-2 pl-3">
                <span className="text-base font-semibold leading-6 text-[hsl(var(--foreground))]">
                  {ui('financeReconcileAutomatchColStatement')}
                </span>
                <span className="rounded-lg border border-[hsl(var(--border-control))] bg-[hsl(var(--muted))] px-1.5 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                  {transactionGroups.length}
                </span>
              </div>
              {/* Right header */}
              <div className="flex min-w-0 flex-1 items-center pl-3">
                <span className="text-base font-semibold leading-6 text-[hsl(var(--foreground))]">
                  {ui('financeReconcileAutomatchColOps')}
                </span>
              </div>
            </div>
          ) : null}

          {/* Rows */}
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-3">
            {showGroupBlock && transactionGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                {ui('financeReconcileAutomatchEmpty')}
              </p>
            ) : (
              transactionGroups.map((group) => (
                <GroupRow
                  key={group.groupKey}
                  group={group}
                  checked={isChecked(group)}
                  onToggle={toggle}
                  currency={currency}
                  glItemDifference={glItemDifference}
                  data-testid="GroupRow__a89979" />
              ))
            )}
            <AutoMatchBounceSection
              pairs={pairs}
              isChecked={isChecked}
              onToggle={toggle}
              onToggleAll={toggleAllPairs}
              onReview={onReviewPair}
              currency={currency}
              formatDate={formatLineDate}
              data-testid="AutoMatchBounceSection__a89979" />
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ height: 64, borderTop: '1px solid hsl(var(--border-subtle))' }}
        >
          {/* Summary info */}
          <div className="flex items-center gap-1 text-sm font-medium text-[hsl(var(--muted-foreground))]">
            <Info className="h-5 w-5 flex-none text-[hsl(var(--text-disabled))]" data-testid="Info__a89979" />
            <span>{footerSummary}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Cancel */}
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              data-testid="automatch-modal-cancel"
              className="h-10 rounded-full px-3 text-[hsl(var(--foreground))] hover:bg-muted hover:text-[hsl(var(--foreground))]"
            >
              {ui('cancel')}
            </Button>

            {/* Open reconciliation */}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="automatch-modal-open-reconciliation"
              className="h-10 gap-1 rounded-full border-[hsl(var(--border-control))] bg-card px-3 text-[hsl(var(--foreground))] shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted hover:text-[hsl(var(--foreground))] [&_svg]:size-5"
            >
              <ArrowUpRight className="h-5 w-5 text-[hsl(var(--text-disabled))]" data-testid="ArrowUpRight__a89979" />
              <span>{ui('financeReconcileAutomatchActionOpen')}</span>
            </Button>

            {/* Apply — the shared primary Button (blue), as "Nueva cuenta" in the accounts list. */}
            <Button
              type="button"
              onClick={handleApply}
              disabled={applyCount === 0 || loading}
              data-testid="automatch-modal-apply"
              className="h-10 gap-1 rounded-full px-3"
            >
              <span>
                {loading
                  ? ui('loading')
                  : applyLabelText(ui, checkedGroups.length, checkedPairs.length)}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
