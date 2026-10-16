// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/preload390.js
//
// ETP-5716 — Modelo 390 preload from the year's 303s: apply only to the inputs the user did not
// change, Restaurar, the cuadre threshold and the incident candidates.
import { describe, it, expect } from 'vitest';
import {
  RECONCILIATION_TOLERANCE_390, isUnmodified, applyPreload390, restorePreloaded390, reconcile390,
  missingPeriodsLabel, preloadIncidents390,
} from '../preload390.js';

const PRELOAD = { year: 2026, declarations: [{ id: 'a', period: 'T1' }], missingPeriods: [], expectedResult: '100.00' };

describe('isUnmodified', () => {
  it('compares with the previous preloaded value, zero and empty being equal', () => {
    expect(isUnmodified('K', { K: '100.00' }, { K: '100' })).toBe(true);
    expect(isUnmodified('K', { K: '120' }, { K: '100' })).toBe(false);
    expect(isUnmodified('K', {}, { K: '0.00' })).toBe(true);
    expect(isUnmodified('K', {}, { K: '50' })).toBe(false); // cleared by the user
  });
  it('without a previous preload, only an empty or zero input is unmodified', () => {
    expect(isUnmodified('K', {}, null)).toBe(true);
    expect(isUnmodified('K', { K: '0' }, {})).toBe(true);
    expect(isUnmodified('K', { K: '5' }, {})).toBe(false);
  });
});

describe('applyPreload390', () => {
  it('fills empty inputs on a first preload, a zero clears, and records every value', () => {
    const r = applyPreload390({}, null, { INGRESAR_03: '100.00', INGRESAR_06: '0.00', TOTAL_LASTPERIOD: '20.00' });
    expect(r.inputs).toEqual({ INGRESAR_03: '100.00', TOTAL_LASTPERIOD: '20.00' });
    expect(r.preloaded).toEqual({ INGRESAR_03: '100.00', INGRESAR_06: '0.00', TOTAL_LASTPERIOD: '20.00' });
    expect(r.applied.sort()).toEqual(['INGRESAR_03', 'TOTAL_LASTPERIOD']);
  });

  it('never overwrites a value the user changed, but records the new preload for Restaurar', () => {
    const r = applyPreload390(
      { INGRESAR_03: '150.00', INGRESAR_06: '50.00', LIQANUAL_COMPENSATION: '7' },
      { INGRESAR_03: '100.00', INGRESAR_06: '50.00' },
      { INGRESAR_03: '110.00', INGRESAR_06: '60.00', LIQANUAL_COMPENSATION: '0.00' },
    );
    expect(r.inputs.INGRESAR_03).toBe('150.00');
    expect(r.inputs.INGRESAR_06).toBe('60.00');
    expect(r.inputs.LIQANUAL_COMPENSATION).toBe('7'); // typed before any preload: kept
    expect(r.preloaded).toEqual({ INGRESAR_03: '110.00', INGRESAR_06: '60.00', LIQANUAL_COMPENSATION: '0.00' });
    expect(r.applied).toEqual(['INGRESAR_06']);
  });

  it('a key the 303s no longer determine keeps its input and stops being preloaded', () => {
    const r = applyPreload390({ TOTAL_LASTPERIOD: '20.00' }, { TOTAL_LASTPERIOD: '20.00' }, {});
    expect(r.inputs).toEqual({ TOTAL_LASTPERIOD: '20.00' });
    expect(r.preloaded).toEqual({});
  });

  it('sanitizes the result (DEVOLVER_xx needs the monthly register)', () => {
    const r = applyPreload390({}, null, { DEVOLVER_12: '30.00' });
    expect(r.inputs.DEVOLVER_12).toBeUndefined();
    const monthly = applyPreload390({ ISMONTHLYRETURN: 'Y' }, null, { DEVOLVER_12: '30.00' });
    expect(monthly.inputs.DEVOLVER_12).toBe('30.00');
  });
});

describe('restorePreloaded390', () => {
  it('puts the preloaded value back; a preloaded zero clears the input', () => {
    expect(restorePreloaded390({ K: '9' }, { K: '5.00' }, 'K')).toEqual({ K: '5.00' });
    expect(restorePreloaded390({ INGRESAR_03: '9' }, { INGRESAR_03: '0.00' }, 'INGRESAR_03')).toEqual({});
    const same = { K: '9' };
    expect(restorePreloaded390(same, {}, 'K')).toBe(same);
  });
});

describe('reconcile390', () => {
  it('is ok within the 1,00 € tolerance and a difference beyond it', () => {
    expect(RECONCILIATION_TOLERANCE_390).toBe(1);
    expect(reconcile390(101, PRELOAD)).toEqual({ status: 'ok', expected: 100, difference: 1 });
    expect(reconcile390(98.99, PRELOAD)).toEqual({ status: 'difference', expected: 100, difference: -1.01 });
  });
  it('has nothing to compare with when the year has no 303', () => {
    expect(reconcile390(10, null)).toEqual({ status: 'no303' });
    expect(reconcile390(10, { ...PRELOAD, declarations: [] })).toEqual({ status: 'no303' });
    expect(reconcile390(10, { ...PRELOAD, expectedResult: null })).toEqual({ status: 'no303' });
  });
});

describe('missing 303s and incident candidates', () => {
  it('labels months without the leading zero', () => {
    expect(missingPeriodsLabel({ missingPeriods: ['T4'] })).toBe('T4');
    expect(missingPeriodsLabel({ missingPeriods: ['09', '12'] })).toBe('9, 12');
    expect(missingPeriodsLabel(null)).toBe('');
  });
  it('raises "faltan 303" and "diferencia con los 303" as warnings', () => {
    const preload = { ...PRELOAD, missingPeriods: ['T4'] };
    expect(preloadIncidents390(preload, reconcile390(50, preload))).toEqual([
      { code: 'MISSING_303', severity: 'warn', params: { periods: 'T4', year: 2026 } },
      { code: 'DIFF_303', severity: 'warn', params: { difference: -50, expected: 100 } },
    ]);
    expect(preloadIncidents390(PRELOAD, reconcile390(100, PRELOAD))).toEqual([]);
  });
});
