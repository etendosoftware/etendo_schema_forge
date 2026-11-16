import { calendarISODaysAgo } from '@/lib/dateOnly.js';

// Shared by the flag-on fields (BankImportSettingsFields) and the flag-off panel
// (LegacyBankImportSettings, EditAccountModal), so neither depends on a flag-owned file.

/**
 * The PSD2 statement groupings (`EM_PSD2_STATEMENT_FREQUENCY`). There is no empty "Default" option:
 * the grouping is required, both when linking a bank account and when the connection's import
 * settings are edited (ETP-6151).
 *
 * The PSD2 module groups by the day the sync RUNS, not by the transaction dates: a sync joins the
 * last imported statement when that statement was imported the same day (1BD), the same Monday-based
 * week (1BW) or the same month (1BM); 1BE opens a new statement on every sync. The help copy of each
 * option says exactly that (`financeAccountsBankConnectionGroupingHelp_*`).
 */
export const GROUPING_OPTIONS = ['1BD', '1BW', '1BM', '1BE'];

/**
 * Grouping a freshly opened bank connect modal starts with (ETP-6151): Classic's own default,
 * `1BD` ("within 1 day"). Still required and selectable among {@link GROUPING_OPTIONS}.
 */
export const DEFAULT_STATEMENT_GROUPING = '1BD';

/**
 * ETP-5181. Whether "Importar desde" reaches further back than the bank will serve, and from
 * which date it actually will.
 *
 * PSD2 providers publish a `max_fetch_interval` (90 days under the regulation's baseline, more
 * for some banks) and the account's provider record carries it; the bridge exposes it on
 * `GET status` and, since ETP-6151, on `GET accounts` as `maxFetchInterval`. A missing or
 * non-positive limit means the provider never published one, and we advise nothing rather than
 * guess.
 *
 * Advisory only, deliberately: it does not block saving or linking. The date stays exactly as
 * typed, because the range is applied as a LOCAL filter over whatever the provider returns (Salt
 * Edge ignores from_date/to_date — see BankIntegrationUtils.buildSaltEdgeTransactionsEndpoint), so
 * an over-long range loses nothing inside the window that IS available. The point is only to stop
 * the user expecting history the bank will never hand over.
 *
 * The comparison is plain string `<` on two `yyyy-MM-dd` values: ISO date-only strings order
 * lexicographically, so no `Date` is built here and there is no timezone to get wrong. The bound
 * itself comes from `calendarISODaysAgo`, which does the local-calendar arithmetic.
 *
 * @param {string} importFromDate `yyyy-MM-dd` or empty
 * @param {number} [maxFetchInterval] days of history the provider serves
 * @returns {{ days: number, earliest: string } | null}
 */
export function importFromBeyondFetchInterval(importFromDate, maxFetchInterval) {
  if (!importFromDate) return null;
  // Finiteness FIRST, then a positive comparison. Do not collapse this into `maxFetchInterval <= 0`
  // (what Sonar's S1940 proposes for the equivalent `!(maxFetchInterval > 0)`): the bridge OMITS
  // the key when the provider declares no limit, and `undefined <= 0` is false, so that rewrite
  // would fall through on the commonest case and build the bound from NaN.
  if (!Number.isFinite(maxFetchInterval) || maxFetchInterval <= 0) return null;
  const earliest = calendarISODaysAgo(maxFetchInterval);
  return importFromDate < earliest ? { days: maxFetchInterval, earliest } : null;
}
