/**
 * ETP-5245 — resolve the ISO 4217 currency code that an `amount` cell of a grid
 * row should be formatted with.
 *
 * Why this exists: `renderAmountCell` used to read `row['currency$_identifier']`
 * and nothing else. That property name is the DAL name of the `currency`
 * association, so it only exists on entities whose currency field is literally
 * called `currency`. NEO derives the payload key from the field's own name, so a
 * tab whose AD column is `C_Currency_ID` (field name `cCurrencyID`) emits
 * `cCurrencyID$_identifier` instead — and the amount rendered with no symbol at
 * all. Three entities are in that situation today: `product/costing`,
 * `product/transactionAdjustments` and `warehouse/productTransactions`.
 *
 * The session currency is only the LAST resort on purpose. A grid such as
 * `M_Costing` legitimately mixes currencies row by row (real tenant data: 1663
 * rows in USD next to 1545 in EUR), so stamping the session currency on every
 * row would print a confident lie. It is used only when the row carries no
 * currency of its own.
 *
 * Returning `undefined` is a supported outcome, not a failure: `formatAmount`
 * then renders a grouped, 2-decimal number with no symbol — exactly what the
 * grid did before this ticket, which is what keeps symbol-less mock data and
 * currency-less entities rendering unchanged.
 *
 * @param {object|null|undefined} row - The grid row (a NEO record).
 * @param {object|null|undefined} col - The column definition; `col.currencyField`
 *   (from decisions.json) names the sibling field carrying the currency.
 * @param {string|null|undefined} sessionCurrency - `useCurrency()`, the org's
 *   currency; `null` while it is still resolving.
 * @returns {string|undefined} ISO 4217 code, or undefined when none is known.
 */
export function resolveRowCurrency(row, col, sessionCurrency) {
  const declared = col?.currencyField;
  if (declared) {
    const value = row?.[`${declared}$_identifier`];
    if (value) return value;
  }
  // Historical default: entities whose currency association is named `currency`.
  if (row?.['currency$_identifier']) return row['currency$_identifier'];
  // Entities whose currency field kept its AD-derived name (`C_Currency_ID` →
  // `cCurrencyID`). Covered without a per-window declaration because the payload
  // key is fully determined by the AD column, not by the window.
  if (row?.['cCurrencyID$_identifier']) return row['cCurrencyID$_identifier'];
  return sessionCurrency || undefined;
}
