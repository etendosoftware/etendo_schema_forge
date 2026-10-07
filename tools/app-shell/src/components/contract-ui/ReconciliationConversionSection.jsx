import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { MaskedAmountInput } from '@/components/forms/fields';
import { formatCurrency, formatPlainDecimal } from '@/lib/formatCurrency';
import { RATE_DECIMALS, roundHalfUp } from './reconciliationConversionMath.js';

/**
 * Bank-rate conversion block of the reconciliation payment-method modal (ETP-5657).
 *
 * Rendered only while `useReconciliationConversion` reports the conversion as active: every
 * selected invoice shares one currency other than the account's. Classic parity — the three
 * figures of Match Statement → Add Payment, all editable, each edit keeping the other two
 * consistent (the rules live in `reconciliationConversionMath.js`):
 *
 *  - the amount to collect / pay, in the invoice currency (lowering it is a partial payment);
 *  - the conversion rate, prefilled with the rate the bank implied;
 *  - the converted amount, in the account currency, prefilled with the statement amount.
 *
 * Below them, when every invoice carries its own rate: the invoice rate and the exchange gain or
 * loss Core's accounting will book. Like Classic there is no deviation warning — those two rows are
 * the only cues; the user lowers the amount (partial payment) or edits the rate.
 *
 * Built with the panel's own Tailwind dialog style rather than reusing `NewPaymentEntryModal`'s
 * `ConversionFields`, which is tied to that modal's inline styles and private helpers.
 *
 * @param {{ conversion: ReturnType<typeof import('./useReconciliationConversion.js').useReconciliationConversion> }} props
 */
export function ReconciliationConversionSection({ conversion }) {
  const ui = useUI();
  if (!conversion?.active) return null;
  const { fields, handlers } = conversion;
  const { invoiceCurrency, accountCurrency, errors } = fields;
  const actualLabelKey = fields.isReceipt
    ? 'financeReconcileConversionActualReceipt'
    : 'financeReconcileConversionActualPayment';

  return (
    <section className="flex flex-col gap-3 pb-2" data-testid="recon-conversion-section">
      <div
        className="flex items-center justify-between gap-3 rounded-lg border border-[hsl(var(--border-subtle))] px-3.5 py-2.5"
        data-testid="recon-conversion-statement"
      >
        <span className="text-[13px] leading-[18px] text-[hsl(var(--muted-foreground))]">
          {ui('writeoffBreakdownStatement')}
        </span>
        <span className="text-[13px] font-bold leading-[18px] tabular-nums text-[hsl(var(--foreground))]">
          {formatCurrency(accountCurrency, fields.statementAmount)}
        </span>
      </div>

      <ConversionField
        error={errors.actual
          ? ui('financeReconcileConversionActualError', {
            max: formatCurrency(invoiceCurrency, fields.outstanding),
          })
          : null}
        testId="recon-conversion-actual"
        data-testid="ConversionField__5fa215">
        <MaskedAmountInput
          label={ui(actualLabelKey, { currency: invoiceCurrency })}
          value={fields.actual ?? ''}
          onChange={handlers.onActualChange}
          currency={invoiceCurrency}
          data-testid="recon-conversion-actual-input" />
      </ConversionField>

      <ConversionField
        error={errors.rate ? ui('financeReconcileConversionRateError') : null}
        testId="recon-conversion-rate"
        data-testid="ConversionField__5fa215">
        <MaskedAmountInput
          label={ui('financeReconcileConversionRate', {
            from: invoiceCurrency, to: accountCurrency,
          })}
          value={fields.rate ?? ''}
          onChange={handlers.onRateChange}
          grouping={false}
          data-testid="recon-conversion-rate-input" />
      </ConversionField>

      <ConversionField
        error={errors.converted
          ? ui('financeReconcileConversionConvertedError', {
            max: formatCurrency(accountCurrency, fields.statementAmount),
          })
          : null}
        testId="recon-conversion-converted"
        data-testid="ConversionField__5fa215">
        <MaskedAmountInput
          label={ui('financeReconcileConversionConverted', { currency: accountCurrency })}
          value={fields.converted ?? ''}
          onChange={handlers.onConvertedChange}
          currency={accountCurrency}
          data-testid="recon-conversion-converted-input" />
      </ConversionField>

      <ReferenceBlock fields={fields} data-testid="ReferenceBlock__recon-conversion" />

      {fields.remainder > 0 && (
        <p
          className="text-xs leading-4 text-[hsl(var(--muted-foreground))]"
          data-testid="recon-conversion-remainder">
          {ui('financeReconcileConversionRemainder', {
            amount: formatCurrency(accountCurrency, fields.remainder),
          })}
        </p>
      )}
    </section>
  );
}

/** A field plus its error line, which reads as an alert so screen readers announce it. */
function ConversionField({ error, testId, children }) {
  return (
    <div className="flex flex-col gap-1" data-testid={`${testId}-field`}>
      {children}
      {error && (
        <p role="alert" className="text-xs leading-4 text-[hsl(var(--destructive))]" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Row label per outcome: the difference is named as a gain or a loss, never as a bare sign. */
const FX_ROW_LABEL_KEY = {
  gain: 'financeReconcileConversionFxGain',
  loss: 'financeReconcileConversionFxLoss',
};

/**
 * The invoices' own rate and the resulting exchange difference. Absent when any selected invoice
 * carries no rate: there is then nothing to compare against. The difference row is shown only for
 * a valid form and a non-negligible amount, named as the gain or loss it books (see `fxOutcome`).
 */
function ReferenceBlock({ fields }) {
  const ui = useUI();
  if (fields.reference == null) return null;
  return (
    <div
      className="overflow-hidden rounded-lg border border-[hsl(var(--border-subtle))]"
      data-testid="recon-conversion-reference">
      <ReferenceRow
        label={ui('financeReconcileConversionReferenceRate')}
        value={formatPlainDecimal(roundHalfUp(fields.reference, RATE_DECIMALS))}
        testId="recon-conversion-reference-rate"
        data-testid="ReferenceRow__recon-conversion-rate" />
      {fields.fxOutcome && (
        <ReferenceRow
          label={ui(FX_ROW_LABEL_KEY[fields.fxOutcome.kind])}
          value={formatCurrency(fields.accountCurrency, fields.fxOutcome.amount)}
          testId="recon-conversion-fx-difference"
          emphasis
          data-testid="ReferenceRow__recon-conversion-fx" />
      )}
    </div>
  );
}

function ReferenceRow({ label, value, testId, emphasis = false }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-[hsl(var(--border-subtle))] px-3.5 py-2 last:border-b-0',
        emphasis && 'bg-[hsl(var(--muted))]',
      )}
      data-testid={testId}>
      <span className="text-[13px] leading-[18px] text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="text-[13px] font-bold leading-[18px] tabular-nums text-[hsl(var(--foreground))]">
        {value}
      </span>
    </div>
  );
}
