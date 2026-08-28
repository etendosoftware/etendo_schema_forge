/**
 * Client-side sorting for the hand-rolled grids.
 *
 * WHY THIS EXISTS AT ALL. The generic `DataTable` sorts server-side: `ListView` owns the sort
 * state and `useEntity` turns it into NEO's `_sortBy`. Three financial-account detail tabs —
 * Movimientos, Reconciliaciones, Extractos — cannot use that path. They are not DataTable
 * grids; each is a hand-rolled `<table>` or CSS-grid `div role="table"` fed by a single
 * unpaged `useNeoResource` fetch, and two of the three go through bespoke Java handlers that
 * accept no sort parameter at all. Their whole dataset is already in memory and their filtering
 * is already a client-side `useMemo`, so sorting belongs in the same place.
 *
 * This module is the pure half — no React, no i18n — so the comparator can be unit-tested on
 * its own. `useClientSort` (hooks/) holds the state, `SortableHeaderLabel`
 * (components/financial-accounts/) draws the affordance.
 *
 * ON DATES: rows carry ISO-8601 strings, and lexicographic order on those IS chronological
 * order. That makes a plain string compare timezone-independent here, so this deliberately
 * does NOT reach for `parseCalendarDate`. That helper exists to stop a date-only value from
 * shifting a calendar DAY when read back through local-time getters or bucketed — neither of
 * which happens in a comparator that only ever orders two instants against each other. See
 * the date-only section of CLAUDE.md, which calls out exactly this non-case.
 */

/**
 * Three-way compare of two cell values, ascending.
 *
 * Blank values (null / undefined / '') always sort LAST, in both directions: they carry no
 * ordering information, and flipping them to the top on a descending sort would bury the rows
 * the user asked to see. Numbers compare numerically, everything else as locale-aware strings
 * so translated labels ("Cobro" / "Pago", "Conciliado" / "Sin conciliar") order the way the
 * reader expects rather than by code point.
 *
 * @param {*} a first value
 * @param {*} b second value
 * @param {string} [locale] BCP-47 locale for string comparison (e.g. 'es-ES')
 * @returns {number} negative, zero or positive
 */
export function compareCellValues(a, b, locale) {
  const aBlank = a === null || a === undefined || a === '';
  const bBlank = b === null || b === undefined || b === '';
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;

  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);

  return String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: 'base' });
}

/**
 * A stably sorted copy of `rows`.
 *
 * Non-mutating: callers hold the fetched array and re-render from it, so sorting in place
 * would make the result depend on how many times the memo happened to run. `Array.prototype
 * .sort` has been stable since ES2019, which is what keeps rows equal on the sort key in their
 * original (backend) order instead of shuffling between renders.
 *
 * @param {Array<object>} rows the rows to sort
 * @param {object} sort
 * @param {string|null} sort.key the sort key, or null/undefined to return the rows untouched
 * @param {'asc'|'desc'} [sort.direction] defaults to ascending
 * @param {Object<string, function>} [sort.accessors] key → (row) => value. A key with no entry
 *   reads `row[key]`, which is only correct when the row property happens to match the column
 *   name — often it does not (the movements grid renders `transactionDate` from `row.date`),
 *   hence the map.
 * @param {string} [sort.locale] BCP-47 locale handed to the string comparison
 * @returns {Array<object>} a new array, or the original reference when there is nothing to do
 */
export function sortRows(rows, { key, direction = 'asc', accessors = {}, locale } = {}) {
  if (!key || !Array.isArray(rows) || rows.length < 2) return rows ?? [];
  const read = accessors[key] ?? ((row) => row?.[key]);
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * compareCellValues(read(a), read(b), locale));
}
