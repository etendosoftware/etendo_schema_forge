import { useUI } from '@/i18n';
import { MaskedAmountInput } from '@/components/forms/fields';
import { formatCurrency } from '@/lib/formatCurrency';

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
 * Below them only the remainder hint. Like Classic there is no reference rate, gain/loss row or
 * deviation warning in the modal; the only cue is the panel footer's gain/loss notice, shown before
 * the modal opens. The user lowers the amount (partial payment) or edits the rate.
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
      {/* Read-only, rendered as the app's standard read-only field — the shared Input in its
          disabled state, as EntityForm renders a read-only header field — so it reads as one of
          the block's fields (label on top, same box and symbol placement), just not editable. */}
      <MaskedAmountInput
        label={ui('financeReconcileConversionStatement', { currency: accountCurrency })}
        value={fields.statementAmount}
        currency={accountCurrency}
        disabled
        data-testid="recon-conversion-statement" />

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
