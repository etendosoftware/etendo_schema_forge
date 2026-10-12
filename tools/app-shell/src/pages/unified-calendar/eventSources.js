/**
 * Event source registry for the Unified Calendar PoC.
 *
 * The side panel and the grid are both driven by this array, so adding a
 * source is adding one entry. Contract of an entry:
 *   { id, labelKey, color: { swatch, pill }, enabled, fetch({ from, to }) => event[] }
 * Event shape:
 *   { id, sourceId, date, endDate?, title, subtitle?, amount?, currency? }
 *
 * `fetch` is synchronous and returns static mock data filtered to the visible
 * range. A real source would become async and hit its backend; the page would
 * then await it — nothing else in the registry contract changes.
 */
import { buildMockHolidays, buildMockInvoices, buildMockVacations } from './mockEvents.js';
import { eventOverlapsRange } from './calendarGrid.js';

function staticSource(events) {
  return ({ from, to }) => events.filter((event) => eventOverlapsRange(event, from, to));
}

export function buildEventSources(today = new Date()) {
  return [
    {
      id: 'purchase-invoices',
      labelKey: 'ucalSourcePurchaseInvoices',
      color: {
        swatch: 'bg-blue-500',
        pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      },
      enabled: true,
      fetch: staticSource(buildMockInvoices(today)),
    },
    {
      id: 'holidays',
      labelKey: 'ucalSourceHolidays',
      color: {
        swatch: 'bg-rose-500',
        pill: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
      },
      enabled: true,
      fetch: staticSource(buildMockHolidays(today)),
    },
    {
      id: 'vacations',
      labelKey: 'ucalSourceVacations',
      color: {
        swatch: 'bg-emerald-500',
        pill: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      },
      enabled: true,
      fetch: staticSource(buildMockVacations(today)),
    },
  ];
}
