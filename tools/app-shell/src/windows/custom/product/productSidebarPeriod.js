import { formatCalendarDate } from '@/lib/dateOnly';

// Stock-movement period options shared by the side panel and its Expand modal.
export const SIDEBAR_PERIOD_OPTIONS = [
  { value: '3M', key: 'last3Months', months: 3 },
  { value: '6M', key: 'last6Months', months: 6 },
  { value: '12M', key: 'last12Months', months: 12 },
];

// The panel opens on the last 12 months (ETP-5908 RF-01).
export const DEFAULT_SIDEBAR_PERIOD = '12M';

/**
 * Exact date range covered by a period: end = `today`, start = `today` minus N months.
 * Built with the local-time constructor (no `new Date(string)`), clamping the day when the
 * target month is shorter (31 May - 3 months -> 28/29 Feb).
 * @param {number} months
 * @param {Date} today calendar day to count from (injected for testability)
 * @returns {{start: Date, end: Date}}
 */
export function computePeriodRange(months, today) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastDayOfTarget = new Date(end.getFullYear(), end.getMonth() - months + 1, 0).getDate();
  const start = new Date(
    end.getFullYear(),
    end.getMonth() - months,
    Math.min(end.getDate(), lastDayOfTarget),
  );
  return { start, end };
}

/**
 * "DD/MM/AAAA – DD/MM/AAAA" label for a period option value ('3M' | '6M' | '12M').
 * Unknown values fall back to the first option, like the selector does. Format is locale-independent.
 */
export function formatPeriodRange(periodValue, today = new Date()) {
  const option = SIDEBAR_PERIOD_OPTIONS.find(o => o.value === periodValue) ?? SIDEBAR_PERIOD_OPTIONS[0];
  const { start, end } = computePeriodRange(option.months, today);
  // dd/mm/yyyy regardless of the UI locale (ETP-5908 RF-05, as in the design handoff). Pinning
  // 'en-GB' with explicit 2-digit parts keeps day/month zero-padded; same approach as
  // shared/paymentSummaryPeriod.js.
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return `${formatCalendarDate(start, 'en-GB', opts)} – ${formatCalendarDate(end, 'en-GB', opts)}`;
}
