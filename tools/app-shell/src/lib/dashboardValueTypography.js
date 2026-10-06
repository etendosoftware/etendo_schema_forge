/**
 * The length cutoffs the dashboard uses: tuned for the narrow 3-up KPI cells of the
 * dashboard's financial summary (`FinancialSummaryCard`), which always calls the helper
 * without thresholds and therefore keeps exactly these values.
 */
export const DASHBOARD_VALUE_THRESHOLDS = Object.freeze({ mediumFrom: 10, smallFrom: 12 });

/**
 * Font size for a headline amount that is already formatted in the dashboard's compact
 * notation (`formatDashboardCompact`, e.g. "9,92K €"). The size steps down as the string
 * grows so it never overflows its container. A leading minus sign is not counted, so a
 * negative amount keeps the size of its positive counterpart.
 *
 *   length >= smallFrom  → 20px / 24px
 *   length >= mediumFrom → 24px / 28px
 *   otherwise            → 30px / 32px
 *
 * The cutoffs default to {@link DASHBOARD_VALUE_THRESHOLDS} (12 / 10). A container with a
 * different width passes its own — the Financial Accounts "Saldo" total (`AccountsSidebar`,
 * ETP-5580) is far wider than a dashboard KPI cell, so it uses `SIDEBAR_BALANCE_THRESHOLDS`
 * (see `AccountsSidebar/balanceDisplay.js`, which documents the glyph-width math). Only the
 * cutoffs differ; the three sizes are shared. It lives in its own module, not in
 * `dashboardNumberFormat.js`, so the tests that mock that formatter module keep getting the
 * real typography rule.
 *
 * @param {string|null|undefined} value - the formatted amount as displayed
 * @param {{ mediumFrom?: number, smallFrom?: number }} [thresholds] - length cutoffs; a missing
 *   key falls back to its dashboard default
 * @returns {{ fontSize: string, lineHeight: string }} inline style for the amount
 */
export function getDashboardValueTypography(value, thresholds = {}) {
  const {
    mediumFrom = DASHBOARD_VALUE_THRESHOLDS.mediumFrom,
    smallFrom = DASHBOARD_VALUE_THRESHOLDS.smallFrom,
  } = thresholds ?? {};
  const length = String(value ?? '').replace(/^-/, '').length;

  if (length >= smallFrom) {
    return { fontSize: '20px', lineHeight: '24px' };
  }

  if (length >= mediumFrom) {
    return { fontSize: '24px', lineHeight: '28px' };
  }

  return { fontSize: '30px', lineHeight: '32px' };
}
