import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * Display rules for the big "Saldo" total in the Financial Accounts sidebar (ETP-5580).
 *
 * TEXT. The FULL amount, formatted with the canonical `formatCurrency` (e.g. "46.108.698,41 €",
 * "$14.028.905,17"), with `≈ ` in front when the total includes at least one converted currency.
 * No compact K/M/B notation here: that stays on the dashboard (`FinancialSummaryCard`).
 *
 * SIZE. Fixed 30px / 32px, the original size of this total. It never shrinks with the length of
 * the amount: a smaller font loses visibility. When the amount does not fit, the sidebar renders
 * it through `TruncatedText`, which ellipsises it and shows the exact value (this same `text`,
 * `≈ ` included) in a tooltip, only when it was actually clipped.
 *
 * WHAT FITS. Usable width: 292px column minus `px-3` = 268px, i.e. 268 / 30 = 8.93em. Inter glyph
 * advances (approximate): tabular digit 0.63em; `.` `,` NBSP and space 0.28em; `-` 0.4em;
 * `≈` 0.6em; `€` 0.62em; `$` 0.6em. So:
 *   "99.999.999,99 €"      8.04em = 241px → fits
 *   "-99.999.999,99 €"     8.44em = 253px → fits
 *   "≈ 99.999.999,99 €"    8.92em = 268px → fits (at the limit)
 *   "≈ -99.999.999,99 €"   9.32em = 280px → ellipsised
 *   "≈ -100.000.000,00 €"  9.95em = 299px → ellipsised
 * Every amount below 100 million fits in full except an approximate AND negative one from
 * roughly 10 million up; the browser decides on the real glyphs, so an amount right at the limit
 * may go either way.
 */

/** Prefix shown when the total includes at least one converted currency. */
export const APPROXIMATE_PREFIX = '≈ ';

/** Fixed typography of the sidebar total (the original `text-[30px] leading-8`). */
export const BALANCE_TYPOGRAPHY = Object.freeze({ fontSize: '30px', lineHeight: '32px' });

/**
 * @param {string} currencyIso - ISO code of the total (the organization currency)
 * @param {number} total - the total balance
 * @param {{ approximate?: boolean }} [options]
 * @returns {{ text: string, style: { fontSize: string, lineHeight: string } }}
 *   `text` is both what is displayed and what the overflow tooltip shows
 */
export function buildBalanceDisplay(currencyIso, total, { approximate = false } = {}) {
  const prefix = approximate ? APPROXIMATE_PREFIX : '';
  return {
    text: `${prefix}${formatCurrency(currencyIso, total)}`,
    style: BALANCE_TYPOGRAPHY,
  };
}
