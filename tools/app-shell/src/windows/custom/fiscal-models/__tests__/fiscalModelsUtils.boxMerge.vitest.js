// Direct unit coverage for the box-merge helpers (ETP-5272 pt.6) — extracted out
// of FmModel303Page.jsx into fiscalModelsUtils.js so FmListPage.jsx's "Resultado"
// column could share the exact same override-merge + derived-box formula (see
// FmModel303Page.jsx's own comment above the leftover local-function stubs: "moved
// to fiscalModelsUtils.js — shared with FmListPage.jsx so the override-merge +
// derived-box formula lives in exactly one place"). Before this file, these 4
// functions were only ever exercised indirectly through FmModel303Page's own
// render tests — nothing imported them from fiscalModelsUtils.js directly.
import { describe, it, expect } from 'vitest';
import {
  toBoxArray,
  applyOverrides,
  recomputeDerivedBoxes,
  getBoxValue,
} from '../fiscalModelsUtils.js';

// ── toBoxArray ────────────────────────────────────────────────────────────────

describe('toBoxArray', () => {
  it('returns an array unchanged', () => {
    const arr = [{ num: 27, value: 100 }];
    expect(toBoxArray(arr)).toBe(arr);
  });

  it('converts a plain object keyed by box number into an array of {num, value}', () => {
    const result = toBoxArray({ 27: 100, 45: 50 });
    expect(result).toEqual(expect.arrayContaining([
      { num: 27, value: 100 },
      { num: 45, value: 50 },
    ]));
    expect(result).toHaveLength(2);
  });

  it('coerces string object keys to numbers', () => {
    const result = toBoxArray({ '27': 100 });
    expect(result[0].num).toBe(27);
    expect(typeof result[0].num).toBe('number');
  });

  it('returns an empty array for null', () => {
    expect(toBoxArray(null)).toEqual([]);
  });

  it('returns an empty array for undefined', () => {
    expect(toBoxArray(undefined)).toEqual([]);
  });

  it('returns an empty array for a non-object primitive', () => {
    expect(toBoxArray(42)).toEqual([]);
    expect(toBoxArray('nope')).toEqual([]);
  });
});

// ── applyOverrides ────────────────────────────────────────────────────────────

describe('applyOverrides', () => {
  it('returns the boxes unchanged (as an array) when overrides is empty', () => {
    const boxes = { 27: 100, 45: 50 };
    const result = applyOverrides(boxes, {});
    expect(result).toEqual(expect.arrayContaining([
      { num: 27, value: 100 },
      { num: 45, value: 50 },
    ]));
  });

  it('returns the boxes unchanged when overrides is undefined', () => {
    const boxes = [{ num: 27, value: 100 }];
    expect(applyOverrides(boxes, undefined)).toEqual([{ num: 27, value: 100 }]);
  });

  it('replaces an existing box value with the override', () => {
    const boxes = { 27: 100, 45: 50 };
    const result = applyOverrides(boxes, { 45: 999 });
    expect(result).toEqual(expect.arrayContaining([
      { num: 27, value: 100 },
      { num: 45, value: 999 },
    ]));
    expect(result).toHaveLength(2);
  });

  it('adds a new box entry when the override key is not present in the original boxes', () => {
    const boxes = { 27: 100 };
    const result = applyOverrides(boxes, { 42: 300 });
    expect(result).toEqual(expect.arrayContaining([
      { num: 27, value: 100 },
      { num: 42, value: 300 },
    ]));
  });

  it('skips an override entry whose value is null (does not add or replace)', () => {
    const boxes = { 27: 100 };
    const result = applyOverrides(boxes, { 42: null });
    expect(result).toEqual([{ num: 27, value: 100 }]);
  });

  it('accepts boxes already in array form', () => {
    const boxes = [{ num: 27, value: 100 }];
    const result = applyOverrides(boxes, { 27: 500 });
    expect(result).toEqual([{ num: 27, value: 500 }]);
  });

  it('applies multiple overrides at once', () => {
    const boxes = { 27: 100, 29: 10, 45: 50 };
    const result = applyOverrides(boxes, { 29: 20, 42: 300 });
    expect(result).toEqual(expect.arrayContaining([
      { num: 27, value: 100 },
      { num: 29, value: 20 },
      { num: 45, value: 50 },
      { num: 42, value: 300 },
    ]));
    expect(result).toHaveLength(4);
  });
});

// ── recomputeDerivedBoxes ─────────────────────────────────────────────────────
// AEAT Modelo 303 formula: box45 = sum(29,31,33,35,37,39,41,42,43,44);
// box46 = box27 - box45; box64 = box46 + box58 + box76;
// box66 = box64 * box65 / 100 (box65 = territorial-split %, defaults to 100);
// box69 = box66 + box77 - box78 + box68 + box108; box71 = box69 - box70 + box109 - box112.

describe('recomputeDerivedBoxes', () => {
  it('derives 45/46/64/66/69/71 from a minimal box set, defaulting box65 to 100', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }]);
    const get = (num) => result.find(b => b.num === num)?.value;
    expect(get(45)).toBe(0);
    expect(get(46)).toBe(1000);
    expect(get(64)).toBe(1000);
    expect(get(66)).toBe(1000);
    expect(get(69)).toBe(1000);
    expect(get(71)).toBe(1000);
  });

  it('sums every box45 input (29,31,33,35,37,39,41,42,43,44)', () => {
    const boxes = [27, 29, 31, 33, 35, 37, 39, 41, 42, 43, 44].map(num => ({ num, value: num === 27 ? 1000 : 10 }));
    const result = recomputeDerivedBoxes(boxes);
    // 10 non-27 boxes at 10 each = 100
    expect(result.find(b => b.num === 45).value).toBe(100);
    expect(result.find(b => b.num === 46).value).toBe(900);
  });

  it('honors an explicit box65 (territorial split) instead of the 100 default', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }, { num: 65, value: 60 }]);
    // box46=1000, box64=1000, box66 = 1000*60/100 = 600, propagates through 69/71.
    expect(result.find(b => b.num === 66).value).toBe(600);
    expect(result.find(b => b.num === 69).value).toBe(600);
    expect(result.find(b => b.num === 71).value).toBe(600);
  });

  it('keeps box65 in the output untouched (it is not itself a derived box)', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }, { num: 65, value: 60 }]);
    expect(result.find(b => b.num === 65).value).toBe(60);
  });

  it('flows box108 (otros ajustes) into box69/71', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }, { num: 108, value: 50 }]);
    expect(result.find(b => b.num === 69).value).toBe(1050);
    expect(result.find(b => b.num === 71).value).toBe(1050);
  });

  it('flows box109 (devoluciones AT) and box112 (deduction) into box71 only', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }, { num: 109, value: 20 }, { num: 112, value: 5 }]);
    // box69 unaffected by 109/112 (they only apply at the box71 step).
    expect(result.find(b => b.num === 69).value).toBe(1000);
    expect(result.find(b => b.num === 71).value).toBe(1015); // 1000 - 0 + 20 - 5
  });

  it('leaves non-derived boxes (e.g. box9, box27) unchanged in the output', () => {
    const result = recomputeDerivedBoxes([{ num: 9, value: 21 }, { num: 27, value: 1000 }]);
    expect(result.find(b => b.num === 9).value).toBe(21);
    expect(result.find(b => b.num === 27).value).toBe(1000);
  });

  it('overwrites any pre-existing (now-stale) value for a derived box number', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 1000 }, { num: 46, value: 999999 }]);
    expect(result.find(b => b.num === 46).value).toBe(1000);
  });

  it('rounds to 2 decimal places', () => {
    const result = recomputeDerivedBoxes([{ num: 27, value: 10.005 }, { num: 29, value: 0.001 }]);
    // box45 = round(0.001, 2) = 0; box46 = round(10.005-0, 2) = 10 or 10.01
    // depending on float rounding — assert it's a 2-decimals-max number either way.
    const box46 = result.find(b => b.num === 46).value;
    expect(Math.round(box46 * 100) / 100).toBe(box46);
  });

  it('handles a completely empty box array (everything defaults to 0, box65 to 100)', () => {
    const result = recomputeDerivedBoxes([]);
    [45, 46, 64, 66, 69, 71].forEach(num => {
      expect(result.find(b => b.num === num).value).toBe(0);
    });
  });
});

// ── getBoxValue ───────────────────────────────────────────────────────────────

describe('getBoxValue', () => {
  it('returns the value of a present box', () => {
    expect(getBoxValue([{ num: 71, value: 500 }], 71)).toBe(500);
  });

  it('returns 0 for a present box whose value is explicitly 0', () => {
    expect(getBoxValue([{ num: 71, value: 0 }], 71)).toBe(0);
  });

  it('returns 0 for a present box whose value is null/undefined (nullish-coalesced)', () => {
    expect(getBoxValue([{ num: 71, value: null }], 71)).toBe(0);
    expect(getBoxValue([{ num: 71, value: undefined }], 71)).toBe(0);
  });

  it('returns null when the box is entirely absent, distinct from a present box valued 0', () => {
    expect(getBoxValue([{ num: 27, value: 100 }], 71)).toBeNull();
  });

  it('returns null for an empty box collection', () => {
    expect(getBoxValue([], 71)).toBeNull();
  });

  it('accepts a plain object (converts internally via toBoxArray)', () => {
    expect(getBoxValue({ 71: 500 }, 71)).toBe(500);
  });

  it('works directly on recomputeDerivedBoxes output', () => {
    const merged = recomputeDerivedBoxes(applyOverrides({ 27: 1000, 29: 100 }, { 42: 300 }));
    // box45 = 100+300 = 400; box46 = 1000-400 = 600; propagates to box71.
    expect(getBoxValue(merged, 45)).toBe(400);
    expect(getBoxValue(merged, 71)).toBe(600);
  });
});
