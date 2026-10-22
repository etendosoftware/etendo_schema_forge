// Modelo 390 — "the exercise has no periods in the fiscal calendar" (ETP-5716). Pure helpers.
//
// The backend answers an annual computation over a fiscal year without one period per month with
// the structured `422 INCOMPLETE_FISCAL_YEAR` `{ error: { code, year, missingPeriods } }`
// (`IncompleteFiscalYearException`, com.etendoerp.go docs/aeat-390-endpoints.md "Annual period"),
// and the incidents carry the same case as the blocking `INCOMPLETE_FISCAL_YEAR`. The page never
// shows the backend text for it: it explains it in the UI language and offers the fiscal calendar.

/** `error.code` / incident code of an exercise without its calendar periods. */
export const INCOMPLETE_FISCAL_YEAR_390 = 'INCOMPLETE_FISCAL_YEAR';

/**
 * Route of the fiscal calendar window. The `fiscal-calendar` artifact was merged into the unified
 * Calendar window (ETP-4478; its `/fiscal-calendar` route only redirects there), so the link goes
 * straight to `/calendar`, the window name of menu.json.
 */
export const FISCAL_CALENDAR_ROUTE = '/calendar';

/** Label key of the "Ir a Calendario fiscal" action. */
export const GO_TO_FISCAL_CALENDAR_KEY = 'fm.m390.incomplete_year.go_to_calendar';

/** `[1..12]` from an array of numbers / strings or a "1,2,12" string; out-of-range dropped. */
export function parseMissingPeriods(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(',');
  return [...new Set(list.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12))]
    .sort((a, b) => a - b);
}

/**
 * `{ year, missingPeriods }` when `error` (a parsed `error` body, a thrown error carrying `code`,
 * or an incident with `origin`) is an INCOMPLETE_FISCAL_YEAR, else `null`.
 */
export function incompleteFiscalYearOf(error) {
  if (!error) return null;
  const code = error.code ?? error.errorCode ?? error.origin;
  if (code !== INCOMPLETE_FISCAL_YEAR_390) return null;
  const source = error.params ?? error;
  return { year: Number(source.year) || null, missingPeriods: parseMissingPeriods(source.missingPeriods) };
}

/**
 * The translated explanation: the missing months by name, or "todos los meses" when the 12 are
 * missing (or the list is unknown).
 */
export function incompleteFiscalYearText(info, t) {
  const months = info?.missingPeriods ?? [];
  const year = info?.year ?? '';
  if (months.length === 0 || months.length === 12) {
    return t('fm.m390.incomplete_year.all', { year });
  }
  const names = months.map(m => t(`fm.m390.month.${String(m).padStart(2, '0')}`)).join(', ');
  return t('fm.m390.incomplete_year.months', { year, months: names });
}
