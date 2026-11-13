import { useUI } from '@/i18n';
import { formatCurrency, formatGroupedNumber } from '@/lib/formatCurrency.js';
import { computeTotals, documentTotal } from './invoiceInboxReviewModel.js';

const MAX_RATE_DECIMALS = 2;

function TotalRow({ label, value, testId, first = false }) {
  return (
    <div className={`flex justify-between px-3.5 pb-2.5 text-sm leading-snug text-muted-foreground ${first ? 'pt-2.5' : ''}`}>
      <span data-testid={`${testId}-label`}>{label}</span>
      <span className="tabular-nums" data-testid={testId}>{value}</span>
    </div>
  );
}

/**
 * ETP-6050 F5 — the totals card: Base imponible, one "IVA {rate}% s/ {base}" row per rate (from
 * the lines) and the Total on a muted band (bold, a red asterisk, a large amount), in the
 * document's currency (`formatCurrency`). Always shown: with no lines it shows zeros.
 *
 * @param {{header: object, lines: object[], currency: string}} props
 */
export default function InvoiceInboxReviewTotals({ header, lines, currency }) {
  const ui = useUI();
  const totals = computeTotals(lines);
  const total = documentTotal(header, totals);
  return (
    <section className="overflow-hidden rounded-xl border border-border" data-testid="invoice-inbox-review-totals">
      <TotalRow
        first
        label={ui('invoiceInboxReviewTotalBase')}
        value={formatCurrency(currency, totals.base)}
        testId="invoice-inbox-review-total-base"
        data-testid="TotalRow__9b4c54" />
      {totals.taxes.map((tax) => (
        <TotalRow
          key={tax.rate}
          label={ui('invoiceInboxReviewTotalTax', {
            rate: formatGroupedNumber(tax.rate, { maximumFractionDigits: MAX_RATE_DECIMALS }),
            base: formatCurrency(currency, tax.base),
          })}
          value={formatCurrency(currency, tax.amount)}
          testId={`invoice-inbox-review-total-tax-${tax.rate}`}
          data-testid="TotalRow__9b4c54" />
      ))}
      <div className="flex items-baseline justify-between border-t border-border bg-muted/50 px-3.5 py-3">
        <span className="text-[15px] font-bold leading-tight" data-testid="invoice-inbox-review-total-label">
          {ui('invoiceInboxReviewTotal')}
          <span className="ml-[3px] text-destructive" aria-hidden="true">*</span>
        </span>
        <span className="text-xl font-extrabold leading-tight tracking-tight tabular-nums" data-testid="invoice-inbox-review-total">
          {formatCurrency(currency, total)}
        </span>
      </div>
    </section>
  );
}
