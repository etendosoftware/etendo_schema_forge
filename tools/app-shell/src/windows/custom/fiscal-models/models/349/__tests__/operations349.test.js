// @covers tools/app-shell/src/windows/custom/fiscal-models/models/349/operations349.js
//
// New file — `make find-tests FILE=tools/app-shell/src/windows/custom/fiscal-models/models/349/operations349.js`
// found no existing coverage for this module. It is pure logic (no React, no DOM), so it is
// exercised directly with the Node test runner rather than through a rendered page, per
// docs/testing/test-reuse-policy.md point 7 — this is executed behavior, not source-reading.
// `rectifiedBaseByKey` and `sum349OperationsBase`/`sumRestatedRectifications` are already
// exercised indirectly through FmModel349Page.rectifications.vitest.jsx and
// modelRegistry.vitest.js (via `deriveListResult349`); this file adds direct, unit-level
// coverage of every exported function, including edge cases those integration tests don't
// reach (cross-year rectification origins, mixed string/boolean `rectificative` values).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRectificativeOp,
  sum349OperationsBase,
  sumRestatedRectifications,
  rectifiedBaseByKey,
  collectRectificationOrigins,
  formatRectificationOriginsLabel,
} from '../operations349.js';

describe('isRectificativeOp', () => {
  it('is true for the boolean true', () => {
    assert.equal(isRectificativeOp({ rectificative: true }), true);
  });

  it('is true for the string "true" (NEO can emit a stringified boolean)', () => {
    assert.equal(isRectificativeOp({ rectificative: 'true' }), true);
  });

  it('is true for the string "Y"', () => {
    assert.equal(isRectificativeOp({ rectificative: 'Y' }), true);
  });

  it('is false for the boolean false', () => {
    assert.equal(isRectificativeOp({ rectificative: false }), false);
  });

  it('is false for the string "false"', () => {
    assert.equal(isRectificativeOp({ rectificative: 'false' }), false);
  });

  it('is false when the field is absent or the op is nullish', () => {
    assert.equal(isRectificativeOp({}), false);
    assert.equal(isRectificativeOp(null), false);
    assert.equal(isRectificativeOp(undefined), false);
  });
});

describe('sum349OperationsBase', () => {
  it('sums the base of regular (non-corrective) rows only', () => {
    const operators = [
      { base: '100.00', rectificative: false },
      { base: '50.50', rectificative: false },
      { base: '-30.00', correctedBase: '970.00', rectificative: true },
    ];
    assert.equal(sum349OperationsBase(operators), 150.5);
  });

  it('ignores non-numeric base values as zero', () => {
    assert.equal(sum349OperationsBase([{ base: 'not-a-number', rectificative: false }]), 0);
  });

  it('returns 0 for an empty or nullish list', () => {
    assert.equal(sum349OperationsBase([]), 0);
    assert.equal(sum349OperationsBase(null), 0);
    assert.equal(sum349OperationsBase(undefined), 0);
  });

  it('excludes every corrective row even when it is the only one present', () => {
    assert.equal(sum349OperationsBase([{ base: '500.00', rectificative: true, correctedBase: '470.00' }]), 0);
  });
});

describe('sumRestatedRectifications', () => {
  it('sums correctedBase across corrective rows, ignoring regular rows', () => {
    const operators = [
      { base: '100.00', rectificative: false },
      { base: '-30.00', correctedBase: '970.00', rectificative: true },
      { base: '-50.00', correctedBase: '950.00', rectificative: true },
    ];
    assert.equal(sumRestatedRectifications(operators), 1920);
  });

  it('never reads the signed delta (base) instead of correctedBase', () => {
    // If this summed `base` instead it would read -80, not 1920 — proves the fix from
    // ETP-5725's real-world follow-up (sumAbsRectificativeTotals was removed for exactly
    // this reason: a delta-based sum cannot reproduce the AEAT's own restated total).
    const operators = [
      { base: '-30.00', correctedBase: '970.00', rectificative: true },
      { base: '-50.00', correctedBase: '950.00', rectificative: true },
    ];
    assert.notEqual(sumRestatedRectifications(operators), -80);
    assert.equal(sumRestatedRectifications(operators), 1920);
  });

  it('a corrective row whose correctedBase sums to exactly 0 across the whole set returns 0, not an empty/falsy value', () => {
    const operators = [
      { base: '30.00', correctedBase: '0.00', rectificative: true },
    ];
    assert.strictEqual(sumRestatedRectifications(operators), 0);
  });

  it('treats a missing correctedBase as 0', () => {
    assert.equal(sumRestatedRectifications([{ base: '-30.00', rectificative: true }]), 0);
  });

  it('returns 0 for an empty or nullish list', () => {
    assert.equal(sumRestatedRectifications([]), 0);
    assert.equal(sumRestatedRectifications(null), 0);
  });
});

describe('rectifiedBaseByKey', () => {
  it('groups correctedBase by AEAT349 key, always returning all four keys', () => {
    const operators = [
      { key: 'E', correctedBase: '970.00', rectificative: true },
      { key: 'A', correctedBase: '30.00', rectificative: true },
    ];
    assert.deepEqual(rectifiedBaseByKey(operators), { E: 970, S: 0, A: 30, I: 0 });
  });

  it('its per-key total always sums back to sumRestatedRectifications (no separate reconciliation possible)', () => {
    const operators = [
      { key: 'E', correctedBase: '970.00', rectificative: true },
      { key: 'E', correctedBase: '50.00', rectificative: true },
      { key: 'A', correctedBase: '30.00', rectificative: true },
      { key: 'E', correctedBase: '1000.00', rectificative: false }, // regular row, excluded
    ];
    const byKey = rectifiedBaseByKey(operators);
    const total = Object.values(byKey).reduce((s, v) => s + v, 0);
    assert.equal(total, sumRestatedRectifications(operators));
  });

  it('ignores a corrective row whose key is not one of the four AEAT349 keys', () => {
    const operators = [{ key: 'Z', correctedBase: '100.00', rectificative: true }];
    assert.deepEqual(rectifiedBaseByKey(operators), { E: 0, S: 0, A: 0, I: 0 });
  });

  it('returns all-zero rows for an empty or nullish list', () => {
    assert.deepEqual(rectifiedBaseByKey([]), { E: 0, S: 0, A: 0, I: 0 });
    assert.deepEqual(rectifiedBaseByKey(null), { E: 0, S: 0, A: 0, I: 0 });
  });
});

describe('collectRectificationOrigins', () => {
  it('collects distinct (year, period) origins, sorted ascending by year then period', () => {
    const operators = [
      { declaredYear: '2026', declaredPeriod: '11', rectificative: true },
      { declaredYear: '2026', declaredPeriod: '09', rectificative: true },
      { declaredYear: '2026', declaredPeriod: '10', rectificative: true },
    ];
    assert.deepEqual(collectRectificationOrigins(operators, 2026), [
      { year: '2026', period: '09', crossYear: false },
      { year: '2026', period: '10', crossYear: false },
      { year: '2026', period: '11', crossYear: false },
    ]);
  });

  it('deduplicates repeated (year, period) origins', () => {
    const operators = [
      { declaredYear: '2026', declaredPeriod: '09', rectificative: true },
      { declaredYear: '2026', declaredPeriod: '09', rectificative: true },
    ];
    assert.equal(collectRectificationOrigins(operators, 2026).length, 1);
  });

  it('sorts quarterly periods (T1-T4) correctly alongside monthly ones', () => {
    const operators = [
      { declaredYear: '2026', declaredPeriod: 'T4', rectificative: true },
      { declaredYear: '2026', declaredPeriod: 'T1', rectificative: true },
    ];
    assert.deepEqual(
      collectRectificationOrigins(operators, 2026).map(o => o.period),
      ['T1', 'T4']
    );
  });

  it('marks crossYear=true when a row\'s declaredYear differs from the declaration\'s own year', () => {
    const operators = [{ declaredYear: '2025', declaredPeriod: '12', rectificative: true }];
    assert.deepEqual(collectRectificationOrigins(operators, 2026), [
      { year: '2025', period: '12', crossYear: true },
    ]);
  });

  it('sorts a cross-year origin before a same-year one when its year is earlier', () => {
    const operators = [
      { declaredYear: '2026', declaredPeriod: '01', rectificative: true },
      { declaredYear: '2025', declaredPeriod: '12', rectificative: true },
    ];
    assert.deepEqual(
      collectRectificationOrigins(operators, 2026).map(o => `${o.year}/${o.period}`),
      ['2025/12', '2026/01']
    );
  });

  it('falls back to the declaration\'s own year when a row carries no declaredYear', () => {
    const operators = [{ declaredPeriod: '09', rectificative: true }];
    assert.deepEqual(collectRectificationOrigins(operators, 2026), [
      { year: '2026', period: '09', crossYear: false },
    ]);
  });

  it('skips a corrective row with no declaredPeriod at all', () => {
    const operators = [{ declaredYear: '2026', rectificative: true }];
    assert.deepEqual(collectRectificationOrigins(operators, 2026), []);
  });

  it('ignores regular (non-corrective) rows entirely', () => {
    const operators = [{ declaredYear: '2026', declaredPeriod: '09', rectificative: false }];
    assert.deepEqual(collectRectificationOrigins(operators, 2026), []);
  });

  it('returns an empty array for an empty or nullish list', () => {
    assert.deepEqual(collectRectificationOrigins([], 2026), []);
    assert.deepEqual(collectRectificationOrigins(null, 2026), []);
  });
});

describe('formatRectificationOriginsLabel', () => {
  it('joins same-year origins by their bare period code', () => {
    const origins = [
      { year: '2026', period: '09', crossYear: false },
      { year: '2026', period: '10', crossYear: false },
    ];
    assert.equal(formatRectificationOriginsLabel(origins), '09, 10');
  });

  it('qualifies a cross-year origin with its full year', () => {
    const origins = [
      { year: '2025', period: '12', crossYear: true },
      { year: '2026', period: '01', crossYear: false },
    ];
    assert.equal(formatRectificationOriginsLabel(origins), '12 2025, 01');
  });

  it('returns an empty string for an empty or nullish origins list', () => {
    assert.equal(formatRectificationOriginsLabel([]), '');
    assert.equal(formatRectificationOriginsLabel(null), '');
    assert.equal(formatRectificationOriginsLabel(undefined), '');
  });
});
