/**
 * Font size for a headline amount that is already formatted in the dashboard's compact
 * notation (`formatDashboardCompact`, e.g. "9,92K €"). The size steps down as the string
 * grows so it never overflows its card. A leading minus sign is not counted, so a
 * negative amount keeps the size of its positive counterpart.
 *
 *   length >= 12 → 20px / 24px
 *   length >= 10 → 24px / 28px
 *   otherwise    → 30px / 32px
 *
 * Used by the dashboard's financial summary (`FinancialSummaryCard`). The Financial Accounts
 * "Saldo" total (`AccountsSidebar`, ETP-5580) does NOT use it: that total is the full amount
 * at a fixed 30px and ellipsises instead of shrinking (see `AccountsSidebar/balanceDisplay.js`).
 * It lives in its own module, not in `dashboardNumberFormat.js`, so the tests that mock that
 * formatter module keep getting the real typography rule.
 *
 * @param {string|null|undefined} value - the formatted amount as displayed
 * @returns {{ fontSize: string, lineHeight: string }} inline style for the amount
 */
export function getDashboardValueTypography(value) {
  const length = String(value ?? '').replace(/^-/, '').length;

  if (length >= 12) {
    return { fontSize: '20px', lineHeight: '24px' };
  }

  if (length >= 10) {
    return { fontSize: '24px', lineHeight: '28px' };
  }

  return { fontSize: '30px', lineHeight: '32px' };
}
