/**
 * CANONICAL locale-aware number PARSER — the inverse of `formatCurrency()`
 * (see `formatCurrency.js`'s own banner comment). This is the ONLY approved
 * way to turn user-typed numeric text (a price, amount, quantity, discount…)
 * back into a real JS `Number`. Do not write a new bare `Number()`/
 * `parseFloat()` call on raw input text anywhere in `tools/app-shell/src` —
 * import `parseLocaleNumber` from here instead.
 *
 * ETP-5107 — the display direction (`formatCurrency`) was fixed under
 * ETP-4314, but nothing symmetric existed for the parse direction: typing a
 * comma (`10,4`, the Spanish decimal separator) into a price field was
 * rejected outright or silently corrupted the value. See
 * docs/plans/2026-09-08-etp5107-price-input-locale-fix.md §6.1.
 *
 * Reads the SAME `getCurrencyFormatConfig()` `formatCurrency()` already reads
 * (`./currencyFormatConfig.js`), so if the instance's configured decimal
 * separator ever changes, display and parsing move together.
 */
import { getCurrencyFormatConfig } from './currencyFormatConfig.js';

/**
 * Parses a user-typed (or programmatically supplied) numeric string into a
 * plain `Number`, accepting BOTH the instance-configured decimal separator
 * AND `.` (many keyboards/numpads emit a period regardless of locale — see
 * plan §6.1). Does NOT understand thousands-grouping separators; callers
 * that may receive a grouped display string (e.g. `MaskedAmountInput`'s own
 * internal masking) must strip grouping before calling this — every other
 * caller in the app only ever hands it an unmasked value.
 *
 * Distinguishes "still typing" (empty string, a lone `-`, a trailing
 * separator with no digits yet) from a genuinely invalid string, so a
 * live keystroke filter can call this without flashing an error on every
 * partial input.
 *
 * @param {string|number|null|undefined} raw
 * @returns {{ value: number|null, isValid: boolean }}
 *   `value` is `null` while the input is empty/partial-but-plausible or when
 *   `isValid` is `false`. `isValid` is `false` only for text that could never
 *   become a valid number by typing more characters (a letter, a second
 *   decimal separator, a misplaced `-`, etc.).
 *
 * @example
 * parseLocaleNumber('10,4')   // { value: 10.4, isValid: true }
 * parseLocaleNumber('10.4')   // { value: 10.4, isValid: true } (period always accepted too)
 * parseLocaleNumber('-5')     // { value: -5, isValid: true }
 * parseLocaleNumber('')       // { value: null, isValid: true }  (still typing)
 * parseLocaleNumber('-')      // { value: null, isValid: true }  (still typing)
 * parseLocaleNumber('1,')     // { value: 1, isValid: true }     (still typing, but already parseable)
 * parseLocaleNumber('12a')    // { value: null, isValid: false } (never becomes valid)
 * parseLocaleNumber('1,2,3')  // { value: null, isValid: false } (two decimal separators)
 */
export function parseLocaleNumber(raw) {
  if (raw == null) return { value: null, isValid: true };

  if (typeof raw === 'number') {
    return { value: Number.isFinite(raw) ? raw : null, isValid: Number.isFinite(raw) };
  }

  const str = String(raw).trim();
  if (str === '') return { value: null, isValid: true };

  const { decimalSeparator } = getCurrencyFormatConfig();
  // Accept the configured decimal separator AND '.' as equivalent — but only
  // ONE decimal-separator occurrence total, whichever character it is.
  const decimalChars = decimalSeparator === '.' ? ['.'] : [decimalSeparator, '.'];
  const decimalCharClass = decimalChars.join('');
  const pattern = new RegExp(`^-?\\d*(?:[${decimalCharClass}]\\d*)?$`);

  if (!pattern.test(str)) return { value: null, isValid: false };

  // No digits at all ('-', a lone separator, '-,'…) — still typing, not invalid.
  if (!/\d/.test(str)) return { value: null, isValid: true };

  const normalized = decimalChars.reduce(
    (acc, ch) => (ch === '.' ? acc : acc.split(ch).join('.')),
    str,
  );
  const num = Number(normalized);
  if (!Number.isFinite(num)) return { value: null, isValid: false };
  return { value: num, isValid: true };
}
