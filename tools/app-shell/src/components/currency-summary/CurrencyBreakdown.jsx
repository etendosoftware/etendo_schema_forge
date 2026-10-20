import { formatCurrency } from '@/lib/formatCurrency.js';
import { TruncatedText } from '@/components/ui/truncated-text.jsx';

/**
 * Gray "breakdown by currency" card shared by the Cuentas sidebar (balances) and the
 * Receipts / Payments list sidebar (ETP-5778). Purely informational: no hover, no click.
 *
 * Each row shows the exact amount in its own currency; when it does not fit next to the ISO
 * label it ellipsises and reveals the full amount in a tooltip (TruncatedText).
 *
 * @param {object} props
 * @param {Array<{currencyIso: string, total: number}>} props.rows
 * @param {string} props.primaryIso - ISO of the placeholder row shown when `rows` is empty
 * @param {string} props.title - already-translated card title
 * @param {boolean} [props.emptyFallback=true] - render a zero row for `primaryIso` when there are no rows
 * @param {string} [props.testIdPrefix='balance-by-currency'] - rows get `${prefix}-${iso}` and `${prefix}-${iso}-amount`
 */
export function CurrencyBreakdown({
  rows,
  primaryIso,
  title,
  emptyFallback = true,
  testIdPrefix = 'balance-by-currency',
}) {
  const visibleRows = rows.length > 0 || !emptyFallback
    ? rows
    : [{ currencyIso: primaryIso, total: 0 }];

  return (
    <div className="rounded-lg bg-[hsl(var(--muted))] p-3">
      <h3 className="text-xs font-semibold leading-4 text-[hsl(var(--muted-foreground))]">
        {title}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {visibleRows.map((row, idx) => (
          <div key={row.currencyIso}>
            {idx > 0 ? (
              <div className="mb-2 h-px w-full bg-[hsl(var(--foreground) / 0.05)]" />
            ) : null}
            {/* The ISO label keeps its width (`shrink-0`); the amount takes the rest
                (`min-w-0 flex-1` bounds it, so TruncatedText can measure the clip) and
                ellipsises with the exact value in a tooltip when it does not fit. */}
            <div
              className="flex items-center justify-between gap-2"
              data-testid={`${testIdPrefix}-${row.currencyIso}`}
            >
              <span className="shrink-0 text-xs font-normal leading-4 text-[hsl(var(--muted-foreground))]">
                {row.currencyIso}
              </span>
              <TruncatedText
                text={formatCurrency(row.currencyIso, row.total)}
                className="min-w-0 flex-1 text-right text-sm font-medium leading-5 text-[hsl(var(--foreground))] tabular-nums"
                data-testid={`${testIdPrefix}-${row.currencyIso}-amount`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
