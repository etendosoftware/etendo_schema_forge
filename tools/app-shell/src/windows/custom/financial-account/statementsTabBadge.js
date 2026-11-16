/**
 * ETP-6151 — count shown on the "Imported statements" tab badge.
 *
 * It is the TOTAL number of statement headers of the account (the unfiltered
 * `/sws/neo/bank-statements?FIN_Financial_Account_ID=` payload, not the date/status-filtered grid
 * the tab renders). Gated by the flag `psd2-statement-import-settings`: flag off, no badge at all
 * (the tab stays exactly as it was). While the first load is still running there is no count yet,
 * so no badge rather than a misleading "0".
 *
 * @param {boolean} enabled value of `usePsd2ImportSettingsFlag()`
 * @param {Array<object>} statements every statement header of the account
 * @param {boolean} loading whether the statements are still being fetched
 * @returns {number|undefined} the count, or `undefined` for "no badge"
 */
export function statementsTabBadge(enabled, statements, loading) {
  if (!enabled) return undefined;
  const count = Array.isArray(statements) ? statements.length : 0;
  if (loading && count === 0) return undefined;
  return count;
}
