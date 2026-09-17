// Vitest coverage for the currently-unexercised `abs: true` + `treatMissingAsZero: true`
// combination in computeDerivedValue (ETP-5338 pt.2, final audit pass).
//
// No production row combines both flags today: box 87 (cuotas_compensar_post) has
// `treatMissingAsZero: true` alone, and `importe_devolucion` has `abs: true` alone (see
// fm303Layouts.js). This test injects a synthetic row exercising both flags together
// through the real component/real computeDerivedValue code path, rather than asserting
// on the function in isolation — it mocks only `getLayout303` (via importOriginal) so
// `matchesVisibility` and every other export stay real.
//
// The synthetic row mirrors box 87's shape (a real, distinct display cell — 902 — whose
// value falls back to a computed formula over OTHER boxes, 900/901) rather than
// importe_devolucion's shape (cells: [null], routed through renderDerivedCell). This
// matters: renderDerivedCell special-cases a computed 0 and renders it as blank, which
// would make "clamped to 0" indistinguishable from "returned null". Routing through
// renderBoxCell's fallback (like box 87) renders 0 explicitly, so these tests can assert
// the exact numeric outcome instead of just "not negative".
//
// Reasoning about the code path (see FmBoxes303.jsx computeDerivedValue):
//   if (dv.treatMissingAsZero) {
//     const rawMinuend = valueMap[dv.box] ?? null;
//     const rawSubtrahend = dv.subtractBox != null ? (valueMap[dv.subtractBox] ?? null) : null;
//     if (rawMinuend == null && rawSubtrahend == null) return null;
//     let display = dv.abs ? Math.abs(rawMinuend ?? 0) : (rawMinuend ?? 0);
//     if (dv.subtractBox != null) display -= (rawSubtrahend ?? 0);
//     if (dv.clampMin != null) display = Math.max(dv.clampMin, display);
//     return display;
//   }
// `abs` is applied to `(rawMinuend ?? 0)` — since Math.abs(0) === 0, defaulting a missing
// minuend to 0 before or after abs() is equivalent, so the combination is safe: a missing
// minuend never produces a spurious non-zero value just because `abs` is also set.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('lucide-react', () => ({
  TrendingUp: () => null,
  TrendingDown: () => null,
  Pencil: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: () => null,
}));

vi.mock('../fm303Layouts.js', async (importOriginal) => {
  const actual = await importOriginal();
  const SYNTHETIC_SECTION = {
    id: 'synthetic_abs_zero',
    rows: [
      {
        id: 'synthetic_abs_zero_row',
        labelKey: 'fm.box.row.synthetic_abs_zero',
        cells: [902],
        derivedValue: { box: 900, subtractBox: 901, abs: true, treatMissingAsZero: true, clampMin: 0 },
      },
    ],
  };
  return {
    ...actual,
    getLayout303: (year, period) => {
      const real = actual.getLayout303(year, period);
      return { ...real, sections: [...real.sections, SYNTHETIC_SECTION] };
    },
  };
});

import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import FmBoxes303 from '../FmBoxes303.jsx';

const BASE_PROPS = { year: 2026, period: 'T2', sectionIds: ['synthetic_abs_zero'] };

const findCellByNum = (container, num) => {
  const padded = String(num).padStart(2, '0');
  return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
    cell => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded
  );
};

describe('FmBoxes303 — computeDerivedValue: abs + treatMissingAsZero combined', () => {
  it('minuend negative (abs applied), subtrahend missing → abs(minuend) - 0, not blank', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 900: -500 }} />
    );
    // rawMinuend = -500, rawSubtrahend = null (missing, but not both missing).
    // display = abs(-500) = 500; 500 - (null ?? 0) = 500; clampMin(0, 500) = 500.
    const cell = findCellByNum(container, 902);
    expect(cell).toBeTruthy();
    expect(cell.querySelector('.fm-aeat-cell__value').textContent).toContain('500');
  });

  it('minuend missing (treated as 0, abs(0) = 0), subtrahend present → clamped to exactly 0', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 901: 200 }} />
    );
    // rawMinuend = null, rawSubtrahend = 200 (not both missing).
    // display = abs(null ?? 0) = abs(0) = 0; 0 - 200 = -200; clampMin(0, -200) = 0.
    const cell = findCellByNum(container, 902);
    expect(cell).toBeTruthy();
    const value = cell.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('0');
    expect(value).not.toContain('-');
  });

  it('both minuend and subtrahend missing → stays blank regardless of abs', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} />
    );
    const cell = findCellByNum(container, 902);
    expect(cell).toBeTruthy();
    expect(cell.querySelector('.fm-aeat-cell__value').textContent).toBe('');
  });

  it('minuend and subtrahend both negative-and-present → abs applies only to minuend', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 900: -500, 901: -100 }} />
    );
    // abs(-500) = 500; subtractBox is NOT abs'd: 500 - (-100) = 600; clampMin(0, 600) = 600.
    const cell = findCellByNum(container, 902);
    expect(cell).toBeTruthy();
    expect(cell.querySelector('.fm-aeat-cell__value').textContent).toContain('600');
  });
});
