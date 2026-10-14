// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/fm390Layouts.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/deadline390.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/newDeclWarning390.js
//
// ETP-5716 — Modelo 390 "Casillas" layout: the 11 blocks, the box search, the client-side
// derivation of the input-dependent boxes (mirror of Fiscal390DerivedBoxes) and the manualData
// built by "Guardar" (inputs + classic substitute flags).
import { describe, it, expect } from 'vitest';
import {
  getLayout390, buildBoxIndex, findBox, deriveInputBoxes, annualResultOf, normalizeInputValue,
  parseAmount, isTerritoryMode, territoryPercentSum, inputOrigin, substitutiveFlags,
  buildManualData390, blockRows, cellBox, INPUT,
} from '../fm390Layouts.js';
import { annualDeadline390 } from '../deadline390.js';
import { missing303Periods } from '../newDeclWarning390.js';

describe('getLayout390 — blocks', () => {
  it('has the 11 blocks of the AEAT form, in order', () => {
    expect(getLayout390(2025).map(b => b.id)).toEqual([
      'identificacion', 'devengo', 'datos_estadisticos', 'representante', 'iva_devengado',
      'iva_deducible', 'resultado_liquidacion', 'territorio', 'resultado_liquidaciones',
      'volumen_operaciones', 'operaciones_especificas',
    ]);
  });

  it('every box appears once in the whole layout', () => {
    const boxes = getLayout390().filter(b => b.kind === 'boxes')
      .flatMap(b => blockRows(b).flatMap(r => r.cells.map(cellBox))).filter(n => n != null);
    expect(new Set(boxes).size).toBe(boxes.length);
  });

  it('shows the KPI boxes [47], [64], [86] and the out-of-scope boxes are left out', () => {
    const index = buildBoxIndex();
    const shown = new Set(index.map(e => e.box));
    [47, 64, 65, 84, 85, 86, 92, 94, 95, 96, 108, 662].forEach(b => expect(shown.has(b), String(b)).toBe(true));
    // recargo de equivalencia, criterio de caja, REAGYP, bienes usados, agencias, prorrata
    [35, 36, 643, 653, 60, 61, 101, 227, 228, 7, 13, 522].forEach(b => expect(shown.has(b), String(b)).toBe(false));
  });
});

describe('findBox — "Buscar casilla"', () => {
  const index = buildBoxIndex();
  const t = (k) => ({ 'fm.m390.box.86': 'Resultado de la liquidación', 'fm.m390.box.659': 'IVA a la importación' }[k] ?? k);

  it('finds a box by number, with or without brackets / leading zeros', () => {
    expect(findBox('86', index).blockId).toBe('resultado_liquidacion');
    expect(findBox('[86]', index).box).toBe(86);
    expect(findBox('01', index)).toMatchObject({ box: 1, blockId: 'iva_devengado' });
    expect(findBox('49', index).blockId).toBe('iva_deducible');
  });

  it('finds a box by concept, accent- and case-insensitive', () => {
    expect(findBox('liquidacion', index, t).box).toBe(86);
    expect(findBox('IMPORTACIÓN', index, t).box).toBe(659);
  });

  it('returns null for an unknown box or an empty query', () => {
    expect(findBox('9999', index)).toBeNull();
    expect(findBox('  ', index)).toBeNull();
  });
});

describe('amount helpers', () => {
  it('parses dot or comma decimals; rejects text', () => {
    expect(parseAmount('1500.00')).toBe(1500);
    expect(parseAmount('40,5')).toBe(40.5);
    expect(parseAmount(-3)).toBe(-3);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('normalizes what the user typed to a 2-decimal string', () => {
    expect(normalizeInputValue('40,5')).toBe('40.50');
    expect(normalizeInputValue(' 7 ')).toBe('7.00');
    expect(normalizeInputValue('')).toBeNull();
    expect(normalizeInputValue('x')).toBeNull();
  });
});

describe('deriveInputBoxes — mirror of Fiscal390DerivedBoxes', () => {
  const computed = { 47: '500.00', 64: '200.00', 65: '300.00', 84: '300.00', 86: '300.00', 108: '1000.00' };

  it('liquidation: [84] = [65] + [658] − [661], [86] = [84] + [659] − [85]', () => {
    const { boxes, mode } = deriveInputBoxes(computed, {}, {
      [INPUT.REGULARIZATION]: '10.00', [INPUT.NO_CURRENT_TYPE_AMOUNT]: '5.00',
      [INPUT.VAT_IMPORT]: '20.00', [INPUT.COMPENSATION]: '15.00',
    });
    expect(mode).toBe('liquidation');
    expect(boxes[84]).toBe(305);
    expect(boxes[85]).toBe(15);
    expect(boxes[86]).toBe(310);
    expect(boxes[658]).toBe(10);
    expect(boxes[92]).toBeUndefined();
  });

  it('territory (any of [87]-[91] > 0): [92] = round2([84] × [87] / 100), [94] = [92] + [659] − [93]', () => {
    const { boxes, mode } = deriveInputBoxes(computed, {}, {
      [INPUT.COMMON_TERRITORY]: '33.33', [INPUT.NAVARRA]: '66.67',
      [INPUT.REGULARIZATION]: '1.00', [INPUT.NO_CURRENT_TYPE_AMOUNT]: '100.00',
      [INPUT.VAT_IMPORT]: '2.00', [INPUT.COMMON_TERRITORY_COMPENSATION]: '3.00',
    });
    expect(mode).toBe('territory');
    expect(boxes[84]).toBe(301); // classic does not subtract [661] here
    expect(boxes[92]).toBe(100.32); // 301 × 33.33 % = 100.3233 → 100.32
    expect(boxes[94]).toBe(99.32);
    expect(boxes[87]).toBe(33.33);
    expect(boxes[85]).toBeUndefined();
    expect(boxes[86]).toBeUndefined();
    expect(annualResultOf(boxes, mode)).toBe(99.32);
  });

  it('[95] / [96] sum the monthly INGRESAR / DEVOLVER inputs', () => {
    const { boxes } = deriveInputBoxes(computed, {}, { INGRESAR_03: '100.10', INGRESAR_06: '50.20', DEVOLVER_12: '7.00' });
    expect(boxes[95]).toBe(150.3);
    expect(boxes[96]).toBe(7);
  });

  it('[108] replaces the inputs it was computed with by the current ones', () => {
    const { boxes } = deriveInputBoxes({ ...computed, 108: '1050.00' }, { [INPUT.OPS_SUJETAS_OSS]: '50.00' }, {
      [INPUT.OPS_INTRAGRUPO]: '20.00',
    });
    expect(boxes[108]).toBe(1020);
    expect(boxes[127]).toBeUndefined();
    expect(boxes[128]).toBe(20);
  });

  it('isTerritoryMode / territoryPercentSum', () => {
    expect(isTerritoryMode({})).toBe(false);
    expect(isTerritoryMode({ [INPUT.ALAVA]: '0.00' })).toBe(false);
    expect(isTerritoryMode({ [INPUT.ALAVA]: '10' })).toBe(true);
    expect(territoryPercentSum({ [INPUT.COMMON_TERRITORY]: '33.33', [INPUT.NAVARRA]: '66.67' })).toBe(100);
  });
});

describe('inputOrigin — legend', () => {
  it('manual without a preload; preloaded while equal; modified once changed', () => {
    expect(inputOrigin('TOTAL_LASTPERIOD', { TOTAL_LASTPERIOD: '1' }, null)).toBe('manual');
    expect(inputOrigin('TOTAL_LASTPERIOD', { TOTAL_LASTPERIOD: '1.00' }, { TOTAL_LASTPERIOD: '1' })).toBe('preloaded');
    expect(inputOrigin('TOTAL_LASTPERIOD', { TOTAL_LASTPERIOD: '2' }, { TOTAL_LASTPERIOD: '1' })).toBe('modified');
  });
});

describe('substitute flags and the saved manualData', () => {
  it('ordinary → no substitute flags', () => {
    expect(substitutiveFlags({})).toEqual({ ISSUPPLEMENTARY: 'N', ISRECTIFICATION: 'N', SUPPLEMENTARYNO: null });
  });

  it('substitute → ISSUPPLEMENTARY; by quota rectification → ISRECTIFICATION (exclusive in classic)', () => {
    expect(substitutiveFlags({ sustitutiva: true, formerStatement: '3901234567890' }))
      .toEqual({ ISSUPPLEMENTARY: 'Y', ISRECTIFICATION: 'N', SUPPLEMENTARYNO: '3901234567890' });
    expect(substitutiveFlags({ sustitutiva: true, rectificacionCuotas: true, formerStatement: '3901234567890' }))
      .toEqual({ ISSUPPLEMENTARY: 'N', ISRECTIFICATION: 'Y', SUPPLEMENTARYNO: '3901234567890' });
  });

  it('buildManualData390 keeps unknown keys, writes identification + inputs, drops blanks', () => {
    const md = buildManualData390(
      { aeatPreloaded: { TOTAL_LASTPERIOD: '1' }, aeatInputs: { OLD: '1' } },
      { sustitutiva: false },
      { LIQANUAL_VAT_IMPORT: '40.00', EMPTY: '' },
    );
    expect(md).toEqual({
      aeatPreloaded: { TOTAL_LASTPERIOD: '1' },
      identification: { sustitutiva: false },
      aeatInputs: { LIQANUAL_VAT_IMPORT: '40.00', ISSUPPLEMENTARY: 'N', ISRECTIFICATION: 'N' },
    });
  });
});

describe('deadline and missing 303s', () => {
  it('the 390 of year N is due on January 30 of N+1', () => {
    expect(annualDeadline390(2026)).toEqual(new Date(2027, 0, 30));
  });

  it('missing303Periods: quarterly by default, monthly once the year has a monthly 303', () => {
    expect(missing303Periods([{ model: '303', year: 2026, period: 'T2' }], 2026)).toEqual(['T1', 'T3', 'T4']);
    expect(missing303Periods([{ model: '303', year: '2026', period: '01' }], 2026)).toHaveLength(11);
    expect(missing303Periods(null, 2026)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });
});
