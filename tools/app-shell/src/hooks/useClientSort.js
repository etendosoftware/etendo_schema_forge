import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocaleSwitch } from '@/i18n';
import { sortRows } from '@/lib/clientSort.js';

/**
 * Sort state + sorted rows for a hand-rolled grid.
 *
 * The cycle mirrors `ListView.handleColumnSort` exactly — none → asc → desc → none — so the
 * three financial-account detail tabs behave like every DataTable grid in the app even though
 * they sort in memory rather than through NEO's `_sortBy`. See `lib/clientSort.js` for why
 * these three tabs cannot sort server-side.
 *
 * Returning to "none" (rather than to a hardcoded default column) is what keeps the backend's
 * own order reachable: the movements list arrives newest-first and the reconciliations list
 * arrives `transactionDate desc` from the handler, and a third click restores exactly that.
 *
 * `initialSort` (optional) seeds the sort-indicator state for a caller that has ALREADY
 * pre-sorted `rows` itself before handing them to this hook (e.g. warehouse transactions,
 * pre-sorted `movementDate` desc) — it makes the header show the correct arrow on first render
 * without the hook re-sorting rows that are already in the right order. Omitting it keeps
 * today's behavior for every existing caller (`MovementsTab`, `ImportedStatementsTab`,
 * `ReconciliationList`, `ListModalWindow`): `sortKey` starts `null`, `sortDirection` starts
 * `'asc'`, no indicator shown, first click on any column behaves exactly as before.
 *
 * ONE-SHOT FIRST-CLICK OVERRIDE: when `initialSort` is set, the very first `toggleSort` call
 * skips the normal none→asc→desc→none cycle IF it lands on the seeded column. Landing on the
 * seeded column and going to "none" would put the rows back in the exact order they already
 * started in (their natural/default order IS the seeded sort), which reads as the click did
 * nothing. So the first click on that column jumps straight to the opposite direction instead —
 * a real, visible reorder. This override fires at most once per hook instance (tracked by
 * `seedUntouchedRef`) and is consumed (without effect on the cycle) the first time a click
 * lands on any OTHER column. Every click after that first one — on any column, including the
 * seeded one — follows the original, unmodified none→asc→desc→none cycle below.
 *
 * @param {Array<object>} rows already-filtered rows
 * @param {object} [options]
 * @param {Object<string, function>} [options.accessors] key → (row) => value; see `sortRows`
 * @param {{key: string, direction: 'asc'|'desc'}} [options.initialSort] seeds the sort
 *   indicator for rows the caller pre-sorted itself; see above. Omit to keep default behavior.
 * @returns {{ sorted: Array<object>, sortKey: string|null, sortDirection: 'asc'|'desc',
 *   toggleSort: (key: string) => void, selectSort: (key: string) => void,
 *   clearSort: () => void, isDefaultSort: boolean }}
 */
export function useClientSort(rows, { accessors, initialSort } = {}) {
  const { locale } = useLocaleSwitch();
  const bcpLocale = (locale || 'es_ES').replace('_', '-');
  const [sortKey, setSortKey] = useState(initialSort?.key ?? null);
  const [sortDirection, setSortDirection] = useState(initialSort?.direction ?? 'asc');
  const seedUntouchedRef = useRef(Boolean(initialSort));

  // Reads the current state directly rather than through the updaters, which is both what
  // ListView.handleColumnSort does and the only correct shape here: a setter called from
  // inside another setter's updater is an impure updater, and React may run it twice.
  const toggleSort = useCallback((key) => {
    if (seedUntouchedRef.current) {
      seedUntouchedRef.current = false;
      if (key === initialSort.key) {
        setSortDirection(initialSort.direction === 'asc' ? 'desc' : 'asc');
        return;
      }
      // click landed on a different column — grace period consumed, fall through normally
    }
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
      return;
    }
    if (sortDirection === 'asc') {
      setSortDirection('desc');
      return;
    }
    setSortKey(null);
    setSortDirection('asc');
  }, [sortKey, sortDirection, initialSort?.key, initialSort?.direction]);

  // For the toolbar popover, which needs pick-a-column and back-to-default rather than the
  // header's cycle: a menu entry that can silently clear the sort reads as a no-op. Mirrors
  // ListView's own split between handleColumnSort and handleSortSelect / handleClearSort.
  const selectSort = useCallback((key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  }, [sortKey]);

  const clearSort = useCallback(() => {
    setSortKey(null);
    setSortDirection('asc');
  }, []);

  const sorted = useMemo(
    () => sortRows(rows, { key: sortKey, direction: sortDirection, accessors, locale: bcpLocale }),
    // `accessors` is rebuilt on every render by callers that close over i18n helpers, so it is
    // deliberately NOT a dependency — including it would defeat the memo entirely. The rows,
    // the key and the direction are what can actually change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sortKey, sortDirection, bcpLocale],
  );

  // "Default" here is the backend's own order, i.e. no client sort applied — unlike a
  // DataTable list, whose default is a declared listSortBy column.
  return {
    sorted, sortKey, sortDirection, toggleSort, selectSort, clearSort,
    isDefaultSort: sortKey === null,
  };
}
