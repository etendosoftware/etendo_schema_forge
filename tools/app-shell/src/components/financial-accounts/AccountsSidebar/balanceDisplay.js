import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardCompact } from '@/lib/dashboardNumberFormat.js';
import { getDashboardValueTypography } from '@/lib/dashboardValueTypography.js';

/**
 * Display rules for the big "Saldo" total in the Financial Accounts sidebar (ETP-5580).
 *
 * The total is ALWAYS shown in the dashboard's compact notation (`formatDashboardCompact`,
 * e.g. "9,92K €"; amounts under 1.000 stay uncompacted, e.g. "-357,99 €"). The exact value is
 * in the `title` (shown on hover). The exact per-currency balances are in the breakdown card
 * below the total.
 *
 * SIZE. It uses the dashboard's size helper (`getDashboardValueTypography`) with the sidebar's
 * OWN cutoffs, `SIDEBAR_BALANCE_THRESHOLDS`. The dashboard's defaults (12 / 10) are tuned for
 * its narrow 3-up KPI cells and dropped an ordinary "≈ 87.542,31B €" to 20px here, with most of
 * the column empty. The dashboard keeps its defaults; only this caller passes other cutoffs.
 *
 * WHAT IS MEASURED: the full displayed string, `≈ ` prefix included, because the prefix takes
 * room in this column. The helper skips a minus sign only when it is the first character, so
 * with the prefix the minus is counted too (one more character, the safe side).
 *
 * THE MATH. Usable width: 292px column minus `px-3` = 268px. The helper counts characters, so
 * the cutoffs assume every character is as wide as the widest common glyph: a tabular digit,
 * ≈0.6em in Inter (`≈`, `€`, `$`, `K`, `B` are about the same; `.`, `,`, the NBSP and the space
 * are ≈0.3em, which only adds slack). Characters that fit in 268px at that worst case:
 *   30px → 18px/char   → 268 / 18   = 14.9 → up to 14 characters
 *   24px → 14.4px/char → 268 / 14.4 = 18.6 → up to 18 characters
 *   20px → 12px/char   → 268 / 12   = 22.3 → up to 22 characters
 * Hence 30px below 15 characters, 24px from 15, 20px from 19. Realistic totals stay at 30px:
 * "≈ 87.542,31B €" (14 chars, ≈7.2em = 216px), "≈ -999,99K €" (12), "-357,99 €" (8, minus not
 * counted), "$14,03M" (7). Only amounts of 10^15 and up step down: "≈ -1.000.000,00B €" is 18
 * characters → 24px (≈9.3em = 223px; it would be ≈279px at 30px). The compact notation stops at
 * B, so 10^18 gives "≈ -1.000.000.000,00B €" (22 characters → 20px, ≈228px), still inside.
 */

/** Prefix shown when the total includes at least one converted currency. */
export const APPROXIMATE_PREFIX = '≈ ';

/** Length cutoffs for the sidebar total (see the math above), passed to
 *  `getDashboardValueTypography` and measured against the full displayed string. */
export const SIDEBAR_BALANCE_THRESHOLDS = Object.freeze({ mediumFrom: 15, smallFrom: 19 });

/**
 * @param {string} currencyIso - ISO code of the total (the organization currency)
 * @param {number} total - the total balance
 * @param {{ approximate?: boolean, locale?: string }} [options]
 *   `locale` is the dashboard number locale (`localeFromUi(useLocaleSwitch().locale)`)
 * @returns {{ text: string, title: string, style: { fontSize: string, lineHeight: string } }}
 */
export function buildBalanceDisplay(currencyIso, total, { approximate = false, locale } = {}) {
  const prefix = approximate ? APPROXIMATE_PREFIX : '';
  const compact = formatDashboardCompact(total, { currencyLabel: currencyIso, locale });
  const text = `${prefix}${compact}`;
  return {
    text,
    title: `${prefix}${formatCurrency(currencyIso, total)}`,
    style: getDashboardValueTypography(text, SIDEBAR_BALANCE_THRESHOLDS),
  };
}
