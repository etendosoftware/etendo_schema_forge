import { APPROXIMATE_PREFIX, buildBalanceDisplay } from './balanceDisplay.js';

/**
 * An amount in a single currency, with the "≈ " prefix muted when it is approximate (the figure
 * includes at least one currency converted at today's rate). The one implementation shared by the
 * Cuentas "Saldo" and the Receipts / Payments summary panel (ETP-5778).
 *
 * The text content is exactly `buildBalanceDisplay(...).text`; only the prefix gets its own
 * span. The amount inherits colour, weight and size from the parent.
 *
 * @param {object} props
 * @param {string} props.iso - ISO code of the amount
 * @param {number} [props.amount]
 * @param {boolean} [props.approximate] - prefix with a muted "≈ "
 * @param {string} [props.testId]
 */
export function AmountText({ iso, amount, approximate = false, testId }) {
  const { text } = buildBalanceDisplay(iso, amount ?? 0, { approximate });
  const hasPrefix = approximate === true && text.startsWith(APPROXIMATE_PREFIX);
  return (
    <span data-testid={testId} data-approximate={hasPrefix ? 'true' : 'false'}>
      {hasPrefix ? (
        <span style={{ color: 'hsl(var(--muted-foreground))' }}>{APPROXIMATE_PREFIX}</span>
      ) : null}
      {hasPrefix ? text.slice(APPROXIMATE_PREFIX.length) : text}
    </span>
  );
}
