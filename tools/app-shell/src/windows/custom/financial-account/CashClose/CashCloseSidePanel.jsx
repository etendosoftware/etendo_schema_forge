import { Lock } from 'lucide-react';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { DateField } from '@/components/ui/date-field';
import { Input } from '@/components/ui/input';
import { MoneyAmount } from '@/components/ui/money-amount';
import { getCurrencySymbol } from '@/lib/formatCurrency.js';
import { isCurrencySymbolRightSide } from '@/lib/currencyFormatConfig.js';
import { FieldRow } from '../formFields.jsx';

/**
 * Right-hand column of the cash-close screen (ETP-4795): the close inputs, the live summary and
 * the two actions. Fixed 400px wide; the sections scroll while the action footer stays pinned.
 *
 * These are SECTIONS of the window surface, not cards — no background, border, radius or shadow of
 * their own. Hierarchy comes from 1px hairlines between them plus the weight of the section title,
 * matching the standard product windows. Padding is 20/24 so it lines up with the table grid.
 *
 * Purely presentational — every number arrives already computed by `cashCloseMath.summarize()`.
 */

const SECTION = 'border-b border-[hsl(var(--border-subtle))] px-6 py-5 last:border-b-0';
const SECTION_TITLE = 'text-sm font-bold leading-5 text-[hsl(var(--foreground))] mb-3.5';
const BTN_BASE = 'inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const BTN_PRIMARY = `${BTN_BASE} bg-[hsl(var(--foreground))] text-primary-foreground hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:hover:bg-[hsl(var(--foreground))] disabled:hover:text-primary-foreground`;
const BTN_SECONDARY = `${BTN_BASE} border border-[hsl(var(--border-control))] bg-card text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground)_/_0.05)] hover:bg-[hsl(var(--muted))]`;

/** One `label — value` row of the live summary. */
function SummaryRow({ label, children, separated = false, testId }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between py-2 text-sm leading-5',
        separated && 'mt-1 border-t border-[hsl(var(--border-subtle))] pt-3',
      )}
      data-testid={testId}
    >
      <span className="text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="font-semibold tabular-nums">{children}</span>
    </div>
  );
}

export function CashCloseSidePanel({
  currency, summary, statementDate, onStatementDateChange,
  declaredInput, onDeclaredInputChange, glItemDifference,
  busy, onConfirm, onSaveDraft,
}) {
  const ui = useUI();
  // ETP-4314 follow-up: symbol side read from C_CURRENCY.ISSYMBOLRIGHTSIDE, not hardcoded.
  const rightSide = isCurrencySymbolRightSide(currency);

  return (
    <div className="flex w-[400px] shrink-0 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Datos del cierre */}
        <div className={SECTION} data-testid="cash-close-inputs-card">
          <h4 className={SECTION_TITLE}>{ui('financeAccountCashCloseDataTitle')}</h4>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow
              label={ui('financeAccountCashCloseStatementDate')}
              data-testid="FieldRow__2219ac">
              <DateField
                value={statementDate}
                onChange={onStatementDateChange}
                data-testid="cash-close-statement-date" />
            </FieldRow>
            <FieldRow
              label={ui('financeAccountCashCloseDeclaredBalance')}
              data-testid="FieldRow__2219ac">
              {/* Raw-string state (not a parsed number), so the box can be emptied and typed
                  into freely — parsing happens once, in cashCloseMath.parseDeclaredAmount.
                  Same approach the tolerance fields use in EditAccountModal. */}
              <div className="relative">
                <Input
                  className={`bg-card ${rightSide ? 'pr-8' : 'pl-8'} text-right tabular-nums`}
                  inputMode="decimal"
                  // Shared key, so the decimal separator follows the locale (0,00 vs 0.00).
                  placeholder={ui('financeAccountAmountPlaceholder')}
                  value={declaredInput}
                  onChange={(e) => onDeclaredInputChange(e.target.value)}
                  data-testid="cash-close-declared-balance" />
                <span
                  className={`pointer-events-none absolute ${rightSide ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground`}>
                  {getCurrencySymbol(currency) || '€'}
                </span>
              </div>
            </FieldRow>
          </div>
        </div>

        {/* Cuadre en vivo */}
        <div className={SECTION} data-testid="cash-close-summary-card">
          <h4 className={SECTION_TITLE}>{ui('financeAccountCashCloseLiveSummary')}</h4>

          <SummaryRow
            label={ui('financeAccountCashCloseOpeningBalance')}
            testId="cash-close-row-opening"
            data-testid="SummaryRow__2219ac">
            <MoneyAmount
              value={summary.openingBalance}
              currency={currency}
              tone="neutral"
              data-testid="MoneyAmount__2219ac" />
          </SummaryRow>
          <SummaryRow
            label={ui('financeAccountCashCloseMarkedIn')}
            testId="cash-close-row-in"
            data-testid="SummaryRow__2219ac">
            <MoneyAmount
              value={summary.markedIn}
              currency={currency}
              tone="positive"
              data-testid="MoneyAmount__2219ac" />
          </SummaryRow>
          <SummaryRow
            label={ui('financeAccountCashCloseMarkedOut')}
            testId="cash-close-row-out"
            data-testid="SummaryRow__2219ac">
            <MoneyAmount
              value={summary.markedOut}
              currency={currency}
              tone="negative"
              data-testid="MoneyAmount__2219ac" />
          </SummaryRow>
          <SummaryRow
            label={ui('financeAccountCashCloseCalculated')}
            separated
            testId="cash-close-row-calculated"
            data-testid="SummaryRow__2219ac">
            <MoneyAmount
              value={summary.calculated}
              currency={currency}
              tone="neutral"
              data-testid="MoneyAmount__2219ac" />
          </SummaryRow>
          <SummaryRow
            label={ui('financeAccountCashCloseDeclaredBalance')}
            testId="cash-close-row-declared"
            data-testid="SummaryRow__2219ac">
            <MoneyAmount
              value={summary.declared}
              currency={currency}
              tone="neutral"
              data-testid="MoneyAmount__2219ac" />
          </SummaryRow>

          <div className="flex items-center justify-between py-2" data-testid="cash-close-row-difference">
            <span className="text-sm leading-5 text-[hsl(var(--muted-foreground))]">
              {ui('financeAccountCashCloseDifference')}
            </span>
            <MoneyAmount
              value={summary.difference}
              currency={currency}
              tone={summary.balanced ? 'positive' : 'negative'}
              className="text-xl font-bold leading-7 tabular-nums"
              data-testid="MoneyAmount__2219ac" />
          </div>

          {summary.balanced ? (
            <span
              className="mt-2.5 inline-flex h-6 items-center rounded-full bg-[var(--status-success-bg)] px-2 py-0.5 text-xs font-normal text-[var(--status-success-fg)]"
              data-testid="cash-close-balanced-pill"
            >
              {ui('financeAccountCashCloseBalanced')}
            </span>
          ) : (
            <p
              className="mt-2 text-xs leading-4 text-[hsl(var(--muted-foreground))]"
              data-testid="cash-close-unbalanced-note"
            >
              {/* The concept itself is not named: it is configured once per account and is not a
                  choice being made here, so it only adds a term to parse. The no-concept branch
                  stays — that one is a blocker the user has to act on. */}
              {glItemDifference
                ? ui('financeAccountCashCloseUnbalancedNote')
                : ui('financeAccountCashCloseUnbalancedNoConcept')}
            </p>
          )}
        </div>

        {/* Pendientes para el próximo cierre */}
        <div
          className={cn(SECTION, 'flex items-center gap-3 py-4')}
          data-testid="cash-close-pending-card"
        >
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--muted))] px-2 text-xs font-semibold text-[hsl(var(--foreground))]">
            {summary.pendingCount}
          </span>
          <span className="text-[13px] leading-[18px] text-[hsl(var(--muted-foreground))]">
            {ui('financeAccountCashClosePendingNext')}
          </span>
        </div>
      </div>
      {/* Acciones — ancladas al pie de la misma superficie, precedidas por un hairline. */}
      <div
        className="flex shrink-0 flex-col gap-2.5 border-t border-[hsl(var(--border-subtle))] px-6 py-5"
        data-testid="cash-close-actions"
      >
        <button
          type="button"
          className={BTN_PRIMARY}
          disabled={busy}
          onClick={onConfirm}
          data-testid="cash-close-confirm"
        >
          <Lock className="h-4 w-4" data-testid="Lock__2219ac" />
          {ui('financeAccountCashCloseConfirm')}
        </button>
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy}
          onClick={onSaveDraft}
          data-testid="cash-close-save-draft"
        >
          {ui('financeAccountCashCloseSaveDraft')}
        </button>
      </div>
    </div>
  );
}
