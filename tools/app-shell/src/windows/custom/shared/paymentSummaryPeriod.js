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

// Noun keys per direction: singular for exactly one payment, plural otherwise (0, 2, …) — the
// explicit key-pair convention of InvoicePaymentHistoryModal's cobroRegistrado/cobrosRegistrados.
const NOUN_KEYS = {
  in: { one: 'cobroNoun', other: 'cobrosNoun' },
  out: { one: 'pagoNoun', other: 'pagosNoun' },
};

/**
 * `${period} · ${rowCount} ${cobro(s)|pago(s)}` — "Hoy · 1 cobro", "Hoy · 2 cobros".
 *
 * @param {object|null|undefined} dateFilter
 * @param {number} rowCount - non-voided payments in the filtered set
 * @param {'in'|'out'} dir
 * @param {(key: string) => string} ui
 */
export function buildPeriodSubtitle(dateFilter, rowCount, dir, ui) {
  const keys = NOUN_KEYS[dir === 'in' ? 'in' : 'out'];
  const noun = ui(rowCount === 1 ? keys.one : keys.other);
  return `${buildPeriodLabel(dateFilter, ui)} · ${rowCount} ${noun}`;
}
