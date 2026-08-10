import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { MoneyAmount } from '@/components/ui/money-amount';
import { formatCurrency } from '@/lib/formatCurrency';
import { ToggleRow } from './ToggleRow.jsx';
// Pure decision logic lives in a plain .js sibling so the node:test runner can import it.
// Re-exported here so callers have a single entry point for the feature.
export { writeoffState, WRITEOFF_EPSILON } from './writeoffMath.js';

/**
 * Opt-in write-off of the shortfall left when a payment settles an invoice for less than its
 * outstanding amount (ETP-4797). Shared by the reconciliation payment-method modal and
 * `NewPaymentEntryModal`, which create the same kind of payment — the outcome must not depend on
 * where the user started.
 *
 * <p><b>This is Etendo's native write-off, not a G/L item.</b> The difference is stored as
 * `writeoffAmount` on the payment schedule detail and its payment detail, and posts against the
 * business partner group's write-off account. There is deliberately no accounting-concept
 * SELECTOR here — the destination account is resolved from configuration, not chosen by the user
 * at this moment. The "on" copy names it generically ("an accounting account") without implying a
 * pick, which is accurate: the amount really does land in a real GL account.
 */

/**
 * The three-row breakdown above the toggle: what the money side pays, what the invoice asks, and
 * the gap between them. Only the reconciliation modal shows it — `NewPaymentEntryModal` already
 * has its own amount strip right above.
 */
export function WriteoffBreakdown({ fundedLabel, fundedAmount, invoiceLabel, invoiceAmount,
  difference, currency, 'data-testid': dataTestId = 'writeoff-breakdown' }) {
  const ui = useUI();
  return (
    <div
      className="overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]"
      data-testid={dataTestId}
    >
      <Row
        label={fundedLabel}
        testId="writeoff-breakdown-funded"
        data-testid="Row__d2d255">
        <MoneyAmount
          value={fundedAmount}
          currency={currency}
          tone="neutral"
          className="tabular-nums"
          data-testid="MoneyAmount__writeoff-funded" />
      </Row>
      <Row
        label={invoiceLabel}
        testId="writeoff-breakdown-invoice"
        data-testid="Row__d2d255">
        <MoneyAmount
          value={invoiceAmount}
          currency={currency}
          tone="neutral"
          className="tabular-nums"
          data-testid="MoneyAmount__writeoff-invoice" />
      </Row>
      <Row
        label={ui('writeoffBreakdownDifference')}
        testId="writeoff-breakdown-difference"
        emphasis
        data-testid="Row__d2d255">
        <MoneyAmount
          value={difference}
          currency={currency}
          tone="neutral"
          className="tabular-nums text-[var(--status-warning-fg)]"
          data-testid="MoneyAmount__writeoff-difference" />
      </Row>
    </div>
  );
}

/** One breakdown line. The last one (`emphasis`) is tinted so the gap reads as the conclusion. */
function Row({ label, children, emphasis = false, testId }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] px-3.5 py-2.5 last:border-b-0',
        emphasis && 'bg-[hsl(var(--muted))]',
      )}
      data-testid={testId}
    >
      <span className="min-w-0 truncate text-[13px] leading-[18px] text-[hsl(var(--muted-foreground))]">
        {label}
      </span>
      <span className="shrink-0 text-[13px] font-bold leading-[18px]">{children}</span>
    </div>
  );
}

/**
 * The toggle itself, boxed so it reads as one decision rather than another form field. Turning it
 * on darkens the border and tints the background, which is the handoff's way of showing that the
 * default (off = today's behaviour) has been deliberately left.
 *
 * @param {object} props
 * @param {boolean} props.checked
 * @param {(v:boolean)=>void} props.onCheckedChange
 * @param {number} props.amount    the difference, already positive
 * @param {string} props.currency
 * @param {boolean} [props.isReceipt] drives "cobrada" vs "pagada" in the copy
 * @param {boolean} [props.blocked]   over the account's write-off limit
 * @param {number|null} [props.limit] shown in the blocked message
 */
export function WriteoffToggleRow({ checked, onCheckedChange, amount, currency,
  isReceipt = true, blocked = false, limit = null,
  'data-testid': dataTestId = 'writeoff-toggle' }) {
  const ui = useUI();
  const money = formatCurrency(currency, amount);
  const direction = isReceipt ? 'Receipt' : 'Payment';
  const caption = blocked
    ? ui('writeoffAdjustLimitExceeded', { limit: formatCurrency(currency, Number(limit) || 0) })
    : ui(checked ? `writeoffAdjustOn${direction}` : `writeoffAdjustOff${direction}`, { amount: money });

  return (
    <div
      className={cn(
        'rounded-lg border px-3.5',
        checked && !blocked
          ? 'border-[hsl(var(--foreground))] bg-[hsl(var(--muted))]'
          : 'border-[hsl(var(--border-control))]',
      )}
      data-testid={`${dataTestId}-box`}
    >
      <ToggleRow
        label={ui('writeoffAdjustTitle', { amount: money })}
        caption={caption}
        checked={checked && !blocked}
        onCheckedChange={onCheckedChange}
        disabled={blocked}
        data-testid={dataTestId} />
    </div>
  );
}
