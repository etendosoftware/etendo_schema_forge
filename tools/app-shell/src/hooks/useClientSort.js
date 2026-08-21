import { useCallback, useMemo, useState } from 'react';
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
 * @param {Array<object>} rows already-filtered rows
 * @param {object} [options]
 * @param {Object<string, function>} [options.accessors] key → (row) => value; see `sortRows`
 * @returns {{ sorted: Array<object>, sortKey: string|null, sortDirection: 'asc'|'desc',
 *   toggleSort: (key: string) => void }}
 */
export function useClientSort(rows, { accessors } = {}) {
  const { locale } = useLocaleSwitch();
  const bcpLocale = (locale || 'es_ES').replace('_', '-');
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  // Reads the current state directly rather than through the updaters, which is both what
  // ListView.handleColumnSort does and the only correct shape here: a setter called from
  // inside another setter's updater is an impure updater, and React may run it twice.
  const toggleSort = useCallback((key) => {
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
  }, [sortKey, sortDirection]);

  const sorted = useMemo(
    () => sortRows(rows, { key: sortKey, direction: sortDirection, accessors, locale: bcpLocale }),
    // `accessors` is rebuilt on every render by callers that close over i18n helpers, so it is
    // deliberately NOT a dependency — including it would defeat the memo entirely. The rows,
    // the key and the direction are what can actually change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sortKey, sortDirection, bcpLocale],
  );

  return { sorted, sortKey, sortDirection, toggleSort };
}
