import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatDashboardCompact } from '@/lib/dashboardNumberFormat.js';
import { getDashboardValueTypography } from '@/lib/dashboardValueTypography.js';

/**
 * Display rules for the big "Saldo" total in the Financial Accounts sidebar (ETP-5580).
 *
 * The total is ALWAYS shown in the dashboard's compact notation (`formatDashboardCompact`,
 * e.g. "9,92K €"; amounts under 1.000 stay uncompacted, e.g. "-357,99 €"), sized with the
 * same rule as the dashboard's financial summary (`getDashboardValueTypography`). The exact
 * value is in the `title` (shown on hover). The exact per-currency balances are in the
 * breakdown card below the total.
 *
 * The `≈ ` prefix (shown when a currency was converted) is NOT counted when picking the size,
 * as on the dashboard, where only the number is measured. It still fits the ~268px usable
 * width of the 292px column: the widest 30px case, "≈ -999,99K €", is about 200px. A compact
 * string of 12+ characters drops to 20px, which leaves room for the prefix.
 */

/** Prefix shown when the total includes at least one converted currency. */
export const APPROXIMATE_PREFIX = '≈ ';

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
  return {
    text: `${prefix}${compact}`,
    title: `${prefix}${formatCurrency(currencyIso, total)}`,
    style: getDashboardValueTypography(compact),
  };
}
