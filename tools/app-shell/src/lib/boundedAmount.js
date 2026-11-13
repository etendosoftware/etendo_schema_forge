// ETP-6148 — validation of an amount the user types against a bound taken from another value
// (e.g. «A remesar» against the due's outstanding). Pure: shared by the in-place amount cell of
// InlineLinesPanel (column `editInPlace`) and the document picker modal, so both refuse exactly
// the same values, which are also the values the backend refuses (0 < |amount| <= |bound|, same
// sign as the bound).

import { parseLocaleNumber } from './parseLocaleNumber.js';

// Half a cent: a typed 100,00 must not exceed a stored 99.999999… produced by a float sum.
const HALF_CENT = 0.005;

/** i18n keys of the refusals (genericLabels). `exceedsMax` takes `{ max }`. */
export const BOUNDED_AMOUNT_ERRORS = Object.freeze({
  required: 'boundedAmountRequired',
  zero: 'boundedAmountZero',
  signMismatch: 'boundedAmountSignMismatch',
  exceedsMax: 'boundedAmountExceedsMax',
});

function toNumberOrNull(raw) {
  const { value, isValid } = parseLocaleNumber(raw);
  return isValid ? value : null;
}

/**
 * Validates a typed amount against an optional bound.
 *
 * - empty or unparseable → `required`;
 * - 0 → `zero`;
 * - with a bound: a sign different from the bound's → `signMismatch` (a positive bound, the
 *   usual case, so a negative amount); a magnitude over the bound's → `exceedsMax`;
 * - without a bound: any non-zero amount is accepted.
 *
 * @param {string|number|null|undefined} raw - the clean value (`MaskedAmountInput`'s `clean`) or a number
 * @param {string|number|null} [max] - the bound, whose magnitude is the inclusive maximum
 * @returns {{ value: number|null, error: string|null }} `error` is a key of {@link BOUNDED_AMOUNT_ERRORS}, or null
 */
export function validateBoundedAmount(raw, max) {
  const value = toNumberOrNull(raw);
  if (value == null) return { value: null, error: BOUNDED_AMOUNT_ERRORS.required };
  if (Math.abs(value) < HALF_CENT) return { value, error: BOUNDED_AMOUNT_ERRORS.zero };
  const limit = toNumberOrNull(max);
  if (limit == null || Math.abs(limit) < HALF_CENT) return { value, error: null };
  if (Math.sign(value) !== Math.sign(limit)) return { value, error: BOUNDED_AMOUNT_ERRORS.signMismatch };
  if (Math.abs(value) - Math.abs(limit) >= HALF_CENT) return { value, error: BOUNDED_AMOUNT_ERRORS.exceedsMax };
  return { value, error: null };
}

/** Whether two amounts are equal to the cent. Two missing values are equal; one missing one is not. */
export function sameAmount(a, b) {
  const x = toNumberOrNull(a);
  const y = toNumberOrNull(b);
  if (x == null || y == null) return x === y;
  return Math.abs(x - y) < HALF_CENT;
}
