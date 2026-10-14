// Modelo 390 — "Nueva declaración" non-blocking notice (ETP-5716), bound to the model through
// `modelRegistry.js` (`newDeclWarning`). Plain `.js`, no imports (loaded by the leaf registry).
//
// The annual summary must add up to the Modelo 303 self-assessments of the same exercise, so the
// modal warns when some of them are not in the declarations list yet. It never blocks: the 390 is
// computed from the posted invoices either way, only the reconciliation could be off.
//
// Which periods are expected: a taxpayer files the 303 either monthly or quarterly for a whole
// year. When the year already has a monthly 303 the filer is monthly (every month 01-12 is
// expected); otherwise quarterly (T1-T4). A declaration in any status counts — a draft is not
// "missing", it is just not presented yet (that is the incidents phase's business).

const COMPANION_MODEL = '303';
const QUARTERS = ['T1', 'T2', 'T3', 'T4'];
const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

/**
 * The periods of `year` that have no Modelo 303 in `decls`, in calendar order. Empty when none is
 * missing.
 */
export function missing303Periods(decls, year) {
  const periods = new Set(
    (Array.isArray(decls) ? decls : [])
      .filter(d => String(d?.model) === COMPANION_MODEL && Number(d?.year) === Number(year))
      .map(d => String(d.period)),
  );
  const monthly = MONTHS.some(m => periods.has(m));
  return (monthly ? MONTHS : QUARTERS).filter(p => !periods.has(p));
}

/**
 * Registry hook (`newDeclWarning`): `{ key, params }` of the notice to show for `year`, or `null`.
 * Monthly periods are shown without the leading zero ("10, 11"), quarters as-is ("T4").
 */
export function newDeclWarning390(decls, year) {
  const missing = missing303Periods(decls, year);
  if (missing.length === 0) return null;
  const periods = missing.map(p => (/^\d{2}$/.test(p) ? String(Number(p)) : p)).join(', ');
  return { key: 'fm.m390.new_decl.missing_303', params: { year, periods } };
}
