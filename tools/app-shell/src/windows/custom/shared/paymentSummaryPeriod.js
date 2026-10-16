import { computeTriggerLabel } from '@/components/ui/date-range-popover.jsx';
import { formatCalendarDate } from '@/lib/dateOnly.js';

/**
 * Period label + subtitle of the Receipts / Payments list summary panel (ETP-5778).
 *
 * Input is the active `paymentDate` list filter, as emitted by ListFilterBar:
 *   { mode: 'date', op: 'range', value: [from, to], originalValue: 'preset:<id>' | 'custom:A:B' }
 * No filter (or the `allTime` preset) means "all time".
 */

const PRESET_PREFIX = 'preset:';

/**
 * @param {object|null|undefined} dateFilter - `columnFilters.paymentDate`
 * @param {(key: string) => string} ui - translator from `useUI()`
 * @returns {string}
 */
export function buildPeriodLabel(dateFilter, ui) {
  if (!dateFilter) return ui('dateRangeAllTime');
  const original = dateFilter.originalValue;
  if (typeof original === 'string' && original.startsWith(PRESET_PREFIX)) {
    const presetId = original.slice(PRESET_PREFIX.length);
    if (presetId === 'allTime') return ui('dateRangeAllTime');
    // The preset branch of computeTriggerLabel does not use the locale.
    return computeTriggerLabel({ presetId }, ui('dateRangeAllTime'), ui, 'en-GB');
  }
  const range = Array.isArray(dateFilter.value) ? dateFilter.value : [];
  if (range[0] && range[1]) {
    // dd/mm/yyyy regardless of the UI locale, as in the design handoff.
    return `${formatCalendarDate(range[0], 'en-GB')} – ${formatCalendarDate(range[1], 'en-GB')}`;
  }
  return ui('dateRangeAllTime');
}

/**
 * `${period} · ${rowCount} ${cobros|pagos}`.
 *
 * @param {object|null|undefined} dateFilter
 * @param {number} rowCount - non-voided payments in the filtered set
 * @param {'in'|'out'} dir
 * @param {(key: string) => string} ui
 */
export function buildPeriodSubtitle(dateFilter, rowCount, dir, ui) {
  const noun = ui(dir === 'in' ? 'cobrosNoun' : 'pagosNoun');
  return `${buildPeriodLabel(dateFilter, ui)} · ${rowCount} ${noun}`;
}
