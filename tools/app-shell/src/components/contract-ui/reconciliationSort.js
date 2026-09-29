import { parseCalendarDate } from '@/lib/dateOnly';

/**
 * Sort accessors for the two tables of the manual reconciliation split panel.
 *
 * Both panels sort in memory: `usePendingStatementLines` and `useCandidateOperations` fetch the
 * whole result set with no paging and no `_sortBy`, so ordering the loaded array IS ordering the
 * dataset. The state lives in `useClientSort` and the comparator in `lib/clientSort.js`; this
 * module only maps each column key to the value it must be ordered by — which is rarely the
 * rendered text.
 *
 * Pure and React-free so the rules below can be unit-tested on their own.
 */

/**
 * Epoch millis of a date-only business date, read as a LOCAL calendar day.
 *
 * `parseCalendarDate`, never `new Date(str)`: the latter parses `yyyy-MM-dd` as UTC midnight,
 * which is the previous day under a negative UTC offset (ETP-4031, ETP-4850).
 *
 * @param {string|null|undefined} raw
 * @returns {number|null} null for a missing/unparseable date, so it sorts last
 */
export function calendarDateSortValue(raw) {
  const d = parseCalendarDate(raw);
  return d ? d.getTime() : null;
}

/**
 * A finite number, or null so a missing figure sorts last instead of as zero.
 *
 * @param {*} raw
 * @returns {number|null}
 */
function toSortNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * A candidate's amount in the ACCOUNT currency.
 *
 * Same-currency rows already are; a foreign-currency invoice carries `amountBase`, its equivalent
 * at the rate reconciling it would use (ReconciliationHandlerSupport.appendAccountEquivalent).
 * Returns null when that rate is unknown — the running total skips such a row, and a sort must
 * not order it against a figure in another currency either.
 *
 * @param {object} cand
 * @param {string} currency the financial account's ISO code
 * @returns {number|null}
 */
export function candidateBaseAmount(cand, currency) {
  const isForeign = !!cand?.currency && cand.currency !== currency;
  if (!isForeign) return Number(cand?.amount) || 0;
  return cand?.amountBase != null ? Number(cand.amountBase) : null;
}

/**
 * A candidate's pending balance in the ACCOUNT currency.
 *
 * The backend emits no base-currency pending balance, so a foreign row scales `amountBase` by the
 * pending share of the amount. For invoice candidates the two figures are equal (both are the
 * schedule's outstanding amount), so this reduces to `amountBase`.
 *
 * @param {object} cand
 * @param {string} currency
 * @returns {number|null}
 */
export function candidateBasePendingBalance(cand, currency) {
  const pending = toSortNumber(cand?.pendingBalance);
  const isForeign = !!cand?.currency && cand.currency !== currency;
  if (!isForeign || pending === null) return pending;
  const base = toSortNumber(cand?.amountBase);
  if (base === null) return null;
  const amount = toSortNumber(cand?.amount);
  return amount ? base * (pending / amount) : base;
}

/** Left panel (pending statement lines): column key → value to order by. */
export const LINE_SORT_ACCESSORS = {
  date: (line) => calendarDateSortValue(line?.date),
  // The same fallback chain the cell renders, so the order matches what the user reads.
  description: (line) => line?.description || line?.partnerName || line?.referenceNo || '',
  // The reconciled ratio behind the progress bar, not the bar itself. An unreconciled line
  // renders an empty cell and counts as 0 %.
  progress: (line) => Number(line?.reconciledPct) || 0,
  amount: (line) => toSortNumber(line?.amount),
};

/**
 * Right panel (candidate operations): column key → value to order by.
 *
 * @param {string} currency the financial account's ISO code
 * @returns {Object<string, function>}
 */
export function buildCandidateSortAccessors(currency) {
  return {
    date: (cand) => calendarDateSortValue(cand?.date),
    // The bold leading text of the Información cell.
    info: (cand) => cand?.documentNo || cand?.description || '',
    pendingBalance: (cand) => candidateBasePendingBalance(cand, currency),
    amount: (cand) => candidateBaseAmount(cand, currency),
  };
}
