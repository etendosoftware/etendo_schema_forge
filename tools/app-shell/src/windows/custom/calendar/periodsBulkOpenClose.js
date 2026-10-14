import { parseCalendarDate } from '@/lib/dateOnly.js';

/**
 * Bulk open/close of the Periods tab (ETP-5682): the same per-period action as the
 * "Abrir/Cerrar Periodo" button (AD Process 167, every document type of the period at once),
 * run for several selected periods.
 *
 * Only Open (O) and Close (C) are offered in bulk. "Permanently closed" (P) is irreversible, so
 * it stays a per-period decision; a permanently closed period cannot be selected at all.
 */
export const PERIOD_BULK_ACTIONS = ['O', 'C'];

/** A permanently closed period can never be reopened, so it is never offered for bulk. */
export function isPeriodBulkSelectable(period) {
  return period?.status !== 'P';
}

function startTime(period) {
  return parseCalendarDate(period.startingDate)?.getTime() ?? Number.POSITIVE_INFINITY;
}

/**
 * Runs `action` on each period, ONE AT A TIME, in start-date order. Process 167 touches every
 * C_PeriodControl row of the period, so parallel calls on the same calendar only risk lock
 * contention for a negligible gain (a year is ~12 short calls).
 *
 * A period already in the target state is not posted (reported as `skipped`). A failure never
 * stops the run: every period gets its own outcome, so the user sees exactly which ones failed.
 *
 * @param {object[]} periods the selected periods (any order)
 * @param {'O'|'C'} action
 * @param {(periodId: string, action: string) => Promise<{ok: boolean, message?: string}>} postOne
 * @returns {Promise<{period: object, outcome: 'ok'|'skipped'|'failed', message?: string}[]>}
 */
export async function runPeriodsBulkOpenClose(periods, action, postOne) {
  const ordered = [...periods].sort((a, b) => startTime(a) - startTime(b));
  const results = [];
  for (const period of ordered) {
    if (period.status === action) {
      results.push({ period, outcome: 'skipped' });
      continue;
    }
    try {
      // Sequential on purpose (see above), so the await inside the loop is intended.
      // eslint-disable-next-line no-await-in-loop
      const res = await postOne(period.id, action);
      results.push(res?.ok
        ? { period, outcome: 'ok' }
        : { period, outcome: 'failed', message: res?.message });
    } catch (err) {
      // apiFetch rejects only when there is no HTTP answer; its NetworkError message is
      // already translated.
      results.push({ period, outcome: 'failed', message: err?.message });
    }
  }
  return results;
}

/** `{ok, skipped, failed}` counts of a bulk run. */
export function summarizePeriodsBulkResults(results) {
  const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
  return { ok: count('ok'), skipped: count('skipped'), failed: count('failed') };
}
