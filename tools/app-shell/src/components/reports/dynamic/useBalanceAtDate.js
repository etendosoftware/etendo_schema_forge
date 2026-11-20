import { useCallback, useMemo } from 'react';
import { compareDates, compareRulesOf, endShortcutDate, fiscalYearStart, ledgerStartFor, matchingEndShortcut } from './dynamicDates.js';

const COMPARE_LABEL_KEYS = { sameDateLastYear: 'dynamicReportSameDateLastYear', previousFiscalYearClose: 'dynamicReportPreviousFiscalYearClose' };

/**
 * ETP-6083 — everything a report that is a balance AT A DATE adds to the view, all from its contract (`dateFrom.role = 'ledgerStart'`,
 * `dateTo.shortcuts`, `compareTo.compareModes`); a report with none of them (the P&L) gets inert values.
 *
 *  - `queryFrom`: the start the request asks for: the fiscal year of Hasta (Desde never changes the amounts), so editing Desde sends no request;
 *  - `rules`: the one-day comparisons (`comparedRanges`); `compareOptions`: their panel labels, each naming its date;
 *  - `withLedgerStart(patch)`: keeps Desde inside the fiscal year of Hasta; moving Hasta to another year brings it to that year's start;
 *  - `drillRange(drill)`: the ledger's range for the clicked cell: from Desde (current bucket) or the year start (compared one) to the cell's date;
 *  - `shortcut` / `endShortcutDates` / `onEndShortcut`: the end-date shortcuts.
 */
export function useBalanceAtDate({ ledgerStart, endShortcuts, compareModes, years, state, today, fmt, ui }) {
  const rules = useMemo(() => compareRulesOf(compareModes, years), [compareModes, years]);
  const queryFrom = ledgerStart && state.dateTo ? fiscalYearStart(years, state.dateTo) : state.dateFrom;

  const withLedgerStart = useCallback((patch) => {
    if (!ledgerStart || !('dateTo' in patch || 'dateFrom' in patch)) return patch;
    const dateTo = patch.dateTo ?? state.dateTo;
    const yearChanged = fiscalYearStart(years, dateTo) !== fiscalYearStart(years, state.dateTo);
    let wanted = yearChanged ? '' : state.dateFrom;
    if ('dateFrom' in patch) wanted = patch.dateFrom;
    return { ...patch, dateFrom: ledgerStartFor(years, wanted, dateTo) };
  }, [ledgerStart, years, state.dateFrom, state.dateTo]);

  const drillRange = useCallback((drill) => {
    if (!drill || !ledgerStart) return drill?.range ?? null;
    const to = drill.range?.to ?? state.dateTo;
    // The view's own date (the name click, or the current bucket's cell) honours Desde; a compared date is another fiscal year.
    const own = !drill.range || drill.range.to === state.dateTo;
    return { from: ledgerStartFor(years, own ? state.dateFrom : '', to), to };
  }, [ledgerStart, years, state.dateFrom, state.dateTo]);

  // A mode whose date does not exist (no earlier fiscal year) is not offered.
  const compareOptions = useMemo(() => {
    if (!rules) return null;
    const dates = state.dateTo ? compareDates(rules, state.dateTo) : {};
    return [
      ['', ui('dynamicReportNoComparison')],
      ...[['sly', 'same-last-year'], ['prev', 'previous']].flatMap(([mode, value]) => {
        const key = COMPARE_LABEL_KEYS[rules.modes[mode]];
        return key && dates[mode] ? [[value, ui(key, { date: fmt(dates[mode]) })]] : [];
      }),
    ];
  }, [rules, state.dateTo, ui, fmt]);

  const shortcut = endShortcuts ? matchingEndShortcut(state.dateTo, endShortcuts, today, years) : null;
  const endShortcutDates = useMemo(
    () => Object.fromEntries((endShortcuts ?? []).map((k) => [k, endShortcutDate(k, today, years)])),
    [endShortcuts, today, years],
  );
  return { rules, queryFrom, withLedgerStart, drillRange, compareOptions, shortcut, endShortcutDates };
}
