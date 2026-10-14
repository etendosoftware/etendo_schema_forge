/**
 * ETP-5577 — the way out of a "period not open" refusal (`messageKeys` `PeriodNotAvailable`).
 *
 * A productive tenant starts with every accounting period never-opened, so its first completion,
 * payment or posting is refused until someone opens the period. While the calendar review is
 * pending, the refusal toast sends the owner to "Revisar calendario contable" (First Steps) and
 * tells anyone else to ask the owner; afterwards it offers "Ir al calendario".
 *
 * The toasts are raised from hooks that may run outside the router, so the app layout, which is
 * inside it, registers the action here.
 */

import { parseCalendarDate } from './dateOnly.js';

export const PERIOD_NOT_AVAILABLE_KEY = 'PeriodNotAvailable';

/** The Calendar window; `/calendar/<yearId>` opens a fiscal year on its Periods tab. */
const CALENDAR_PATH = '/calendar';

let recovery = null;

/**
 * @param {{ labelKey: string, go: () => void } | { descriptionKey: string } | null} next an action,
 *   a hint, or null to clear it
 */
export function setPeriodRecovery(next) {
  recovery = next;
}

/**
 * Recovery for the current tenant, from its calendar review state (`GET calendar-review`):
 * `pending` and `isOwner`, plus whether the account dismissed First Steps. Dismissal is per
 * account and the review per environment, so a dismissed owner (e.g. one who finished the
 * checklist on a demo, then upgraded) cannot reach the review row and goes to Calendar instead.
 */
export function periodRecoveryFor(review, navigate, loadPeriods) {
  if (review?.pending && !review.isOwner) return { descriptionKey: 'periodNotAvailableAskOwner' };
  if (review?.pending && !review.firstStepsDismissed) {
    return { labelKey: 'periodNotAvailableReviewCalendar', go: () => navigate('/first-steps') };
  }
  return {
    labelKey: 'periodNotAvailableOpenCalendar',
    go: async (date) => navigate(await calendarPathFor(date, loadPeriods)),
  };
}

/**
 * The fiscal year to open for a refused document dated `date`: the year of the PERIOD that
 * contains it, never a year label. With a July-June calendar, January 2027 belongs to the year
 * that started in July 2026. Calendar when there is no date, no matching period, or the periods
 * cannot be read.
 *
 * @param {Array<{year: string, startingDate: string, endingDate: string}>} periods
 * @param {string|null|undefined} date the document's accounting date (`yyyy-MM-dd...`)
 */
export function calendarPathForDate(periods, date) {
  const day = parseCalendarDate(date);
  if (!day || !Array.isArray(periods)) return CALENDAR_PATH;
  const period = periods.find((candidate) => {
    const start = parseCalendarDate(candidate?.startingDate);
    const end = parseCalendarDate(candidate?.endingDate);
    return start && end && start <= day && day <= end;
  });
  return period?.year ? `${CALENDAR_PATH}/${period.year}` : CALENDAR_PATH;
}

async function calendarPathFor(date, loadPeriods) {
  if (!date || !loadPeriods) return CALENDAR_PATH;
  try {
    return calendarPathForDate(await loadPeriods(), date);
  } catch {
    return CALENDAR_PATH;
  }
}

/**
 * The date the period check of a document reads: the accounting date of invoices and goods
 * movements, the movement date of inventories and internal movements, the date of payments.
 */
export function documentPeriodDate(record) {
  return record?.accountingDate ?? record?.movementDate ?? record?.paymentDate ?? null;
}

/**
 * Extra sonner options for a refusal toast: the recovery action (or the hint) when the refusal is
 * keyed `PeriodNotAvailable`, nothing otherwise.
 *
 * @param {string[]|undefined} messageKeys the refusal's identity (`extractBackendMessageKeys`)
 * @param {(key: string) => string} ui the UI translator
 * @param {{ date?: string|null }} [context] the refused document's date (`documentPeriodDate`),
 *   so "Ir al calendario" opens the fiscal year it belongs to
 */
export function periodNotAvailableToastOptions(messageKeys, ui, context = {}) {
  if (!recovery || !messageKeys?.includes(PERIOD_NOT_AVAILABLE_KEY)) return {};
  if (recovery.descriptionKey) return { description: ui(recovery.descriptionKey) };
  const { go } = recovery;
  return { action: { label: ui(recovery.labelKey), onClick: () => go(context.date) } };
}
