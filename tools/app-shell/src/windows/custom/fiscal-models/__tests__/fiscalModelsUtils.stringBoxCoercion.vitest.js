// ETP-5393 Bug B — Fiscal303BoxesHandler.buildResponse serializes every box value as a JSON
// STRING (`e.getValue().toString()` on a BigDecimal). Before this fix, `toBoxArray` passed that
// string through unchanged, so `recomputeDerivedBoxes`'s numeric accumulation
// (`s + get(n)`) silently degraded into string concatenation the first time any of boxes
// [29,31,33,35,37,39,41,42,43,44] carried a non-zero string value — e.g. `0 + "-0.63"` ->
// `"0-0.63"` -> `Math.round(Number("0-0.63") * 100)` -> `NaN` — which then cascaded through
// every box the AEAT 303 formula derives (45, 46, 64, 66, 69, 71). This is exactly the shape
// GET /fiscal303/boxes returns in production, so this test feeds `toBoxArray` a plain object
// of STRING values (not the numeric fixtures the pre-existing boxMerge tests use) to reproduce
// the real backend payload shape.
import { describe, it, expect } from 'vitest';
import { toBoxArray, recomputeDerivedBoxes, getBoxValue } from '../fiscalModelsUtils.js';

describe('toBoxArray — coerces string box values to Number (ETP-5393 Bug B)', () => {
  it('coerces a numeric-looking string value to a Number', () => {
    const result = toBoxArray({ 27: '1000.50' });
    expect(result[0].value).toBe(1000.5);
    expect(typeof result[0].value).toBe('number');
  });

  it('coerces a negative decimal string (the exact reported case)', () => {
    const result = toBoxArray({ 33: '-0.63' });
    expect(result[0].value).toBe(-0.63);
  });

  it('preserves null (a box with no value) instead of coercing it to 0', () => {
    const result = toBoxArray({ 27: null });
    expect(result[0].value).toBeNull();
  });
});

describe('recomputeDerivedBoxes — does not produce NaN from backend string box values (ETP-5393 Bug B)', () => {
  it('box45/46 stay numeric when boxes arrive as strings from the backend (the reported reproduction)', () => {
    // Reproduces the live reproduction: box27 (devengado) and box33 (deducible, ISP import
    // corrective) both arrive as JSON strings, as Fiscal303BoxesHandler.buildResponse actually
    // serializes them. Before the fix, box45 = 0 + "-0.63" (string concat) -> NaN -> box46 NaN.
    const backendBoxes = { 27: '1000.00', 33: '-0.63' };
    const merged = recomputeDerivedBoxes(toBoxArray(backendBoxes));

    const box45 = getBoxValue(merged, 45);
    const box46 = getBoxValue(merged, 46);

    expect(Number.isFinite(box45)).toBe(true);
    expect(Number.isFinite(box46)).toBe(true);
    expect(box45).toBe(-0.63);
    expect(box46).toBe(1000.63);
  });

  it('cascades correctly into box64/66/69/71 with string box inputs', () => {
    const backendBoxes = { 27: '2000', 29: '100.5', 58: '0', 76: '0', 65: '100', 77: '0', 78: '0', 68: '0', 108: '0', 70: '0', 109: '0', 112: '0' };
    const merged = recomputeDerivedBoxes(toBoxArray(backendBoxes));

    for (const num of [45, 46, 64, 66, 69, 71]) {
      expect(Number.isFinite(getBoxValue(merged, num))).toBe(true);
    }
    expect(getBoxValue(merged, 71)).toBe(1899.5);
  });
});
