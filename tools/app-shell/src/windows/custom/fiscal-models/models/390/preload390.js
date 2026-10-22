// Modelo 390 — preload from the year's Modelo 303 declarations and the "cuadre" with them
// (ETP-5716). Pure helpers (no React, no network): the request is `fetchPreload390` (fm390Api.js),
// the backend contract and the 303 → 390 mapping are in
// {etendo_root}/modules/com.etendoerp.go/docs/aeat-390-endpoints.md ("GET /fiscal390/preload").
//
// The backend answers the 390 inputs the 303s determine (`preload.inputs`, classic search keys:
// INGRESAR_xx, DEVOLVER_xx, TOTAL_LASTPERIOD [97], TOTAL_LASTPERIOD_DEVOLVER [98],
// LIQANUAL_ENDCOMPENSATION [662], LIQANUAL_COMPENSATION [85] or COMMON_TERRITORY_COMPENSATION
// [93], the territory percentages [87]-[91]) and `expectedResult` = [95] − [96] − [97] − [98] −
// [662] of the 303s. This module applies them to the on-screen inputs WITHOUT overwriting what the
// user changed, and compares the 390 result with the expected one.
import { parseAmount, sanitizeAeatInputs390 } from './fm390Layouts.js';


const cents = (v) => Math.round((parseAmount(v) ?? 0) * 100);
const isBlank = (v) => v == null || String(v).trim() === '';

/**
 * True when the user has not changed `key`: it is absent / blank, or its value still equals the
 * previously preloaded one (`previous[key]`). An input set explicitly — a zero included — with no
 * preloaded entry is the user's edit (same rule as the backend `Fiscal390PreloadAggregator
 * .applyPreload`, review N2). A preloaded value the user cleared is kept cleared only when the
 * preload recorded it (`previous[key]` non-zero).
 */
export function isUnmodified(key, inputs, previous) {
  const current = inputs?.[key];
  const wasPreloaded = Boolean(previous && Object.hasOwn(previous, key));
  if (isBlank(current)) return !wasPreloaded || cents(previous[key]) === 0;
  return wasPreloaded && cents(current) === cents(previous[key]);
}

/**
 * Applies the 303 preload to the inputs. For every key the preload determines (`preloadInputs`)
 * or determined before (`previous`, i.e. `manualData.aeatPreloaded`):
 *   - unmodified by the user (`isUnmodified`) → takes the new value (a zero clears the input);
 *   - modified → kept as the user left it (the origin legend then shows "Modificado" and offers
 *     Restaurar to the new preloaded value);
 *   - no longer determined (absent from the new preload, e.g. the last 303 is now missing) → the
 *     input is left as it is and stops being "preloaded".
 * Returns `{ inputs, preloaded, applied }` — new objects; `applied` lists the keys whose input
 * changed. The inputs go through `sanitizeAeatInputs390` (e.g. DEVOLVER_xx without the monthly
 * register is dropped).
 */
export function applyPreload390(inputs, previous, preloadInputs) {
  const next = { ...(inputs ?? {}) };
  const preloaded = {};
  const fresh = preloadInputs ?? {};
  const keys = new Set([...Object.keys(previous ?? {}), ...Object.keys(fresh)]);
  const applied = [];
  keys.forEach(key => {
    if (!Object.hasOwn(fresh, key) || isBlank(fresh[key])) return;
    const value = String(fresh[key]);
    preloaded[key] = value;
    if (!isUnmodified(key, inputs, previous)) return;
    const before = next[key];
    if (cents(value) === 0) delete next[key]; else next[key] = value;
    if ((before ?? null) !== (next[key] ?? null)) applied.push(key);
  });
  return { inputs: sanitizeAeatInputs390(next), preloaded, applied };
}

/**
 * True when `aeatPreloaded` holds at least one value. An empty object — recorded by a save while
 * the year had no 303 yet — does NOT count as preloaded: the draft must still take the 303s once
 * they exist (ETP-5716: otherwise its stored block 9 stays empty and the AEAT rejects it, PAR016).
 */
export function hasPreloadedValues(preloaded) {
  return preloaded != null && typeof preloaded === 'object' && Object.keys(preloaded).length > 0;
}

/** "Restaurar": the input back to its preloaded value (a preloaded zero clears it). */
export function restorePreloaded390(inputs, preloaded, key) {
  if (!preloaded || !Object.hasOwn(preloaded, key)) return inputs;
  const next = { ...(inputs ?? {}) };
  if (cents(preloaded[key]) === 0) delete next[key]; else next[key] = preloaded[key];
  return sanitizeAeatInputs390(next);
}

/**
 * The cuadre of the 390 `annualResult` ([86], or [94] in territory mode) with the 303s:
 *   `{ status: 'no303' }`                    no 303 of the year to compare with;
 *   `{ status: 'ok' | 'difference', expected, difference }` with `difference = annualResult −
 *   expected`: any difference at cent precision — no tolerance, the AEAT publishes none (as
 *   `Fiscal390PreloadAggregator.reconcile` in com.etendoerp.go). Amounts are numbers rounded to cents.
 */
export function reconcile390(annualResult, preload) {
  const expected = parseAmount(preload?.expectedResult);
  if (expected == null || !Array.isArray(preload?.declarations) || preload.declarations.length === 0) {
    return { status: 'no303' };
  }
  const difference = (cents(annualResult) - cents(expected)) / 100;
  return {
    status: difference !== 0 ? 'difference' : 'ok',
    expected: cents(expected) / 100,
    difference,
  };
}

/** The 303 periods of the year with no declaration (`preload.missingPeriods`), display form. */
export function missingPeriodsLabel(preload) {
  const periods = Array.isArray(preload?.missingPeriods) ? preload.missingPeriods : [];
  return periods.map(p => (/^\d{2}$/.test(p) ? String(Number(p)) : p)).join(', ');
}

/**
 * The preload/cuadre findings as incident candidates, for the incidents phase: warnings
 * "Faltan 303 del ejercicio" (`MISSING_303`, `params.periods`) and "Diferencia con los 303"
 * (`DIFF_303`, `params.difference`). Both non-blocking (`severity: 'warn'`). `[]` when neither.
 */
export function preloadIncidents390(preload, reconciliation) {
  const out = [];
  if (preload && Array.isArray(preload.missingPeriods) && preload.missingPeriods.length > 0) {
    out.push({ code: 'MISSING_303', severity: 'warn', params: { periods: missingPeriodsLabel(preload), year: preload.year } });
  }
  if (reconciliation?.status === 'difference') {
    out.push({ code: 'DIFF_303', severity: 'warn', params: { difference: reconciliation.difference, expected: reconciliation.expected } });
  }
  return out;
}

/** i18n key of a 303 row's result kind (`pay` / `compensate` / `refund` / `zero`). */
export const SETTLEMENT_KIND_KEY_390 = Object.freeze({
  pay: 'fm.m390.preload.kind.pay',
  compensate: 'fm.m390.preload.kind.compensate',
  refund: 'fm.m390.preload.kind.refund',
  zero: 'fm.m390.preload.kind.zero',
});
