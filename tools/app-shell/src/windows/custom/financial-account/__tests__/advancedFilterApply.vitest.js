// Client-side advanced-filter evaluator (ETP-4956).
//
// The three financial-account tabs (Movimientos, Extractos importados,
// Conciliación) filter 100% in the browser through `applyConditions`, so every
// operator semantic lives here and nowhere else — there is no backend query to
// fall back on. Operators dispatch through THREE tables picked by the filter
// column's declared `type`: DATE_OPERATORS (`date`), NUMBER_OPERATORS
// (`number`) and the historical string-oriented OPERATORS (everything else).
//
// This file is a `.vitest.js` on purpose: `npm test` only globs
// src/{lib,hooks,windows,locales}/__tests__/*.test.js, so the sibling
// `advancedFilterApply.test.js` is picked up by NO runner and could not catch
// any of the regressions below.
import { describe, it, expect } from 'vitest';
import {
  OPERATORS,
  DATE_OPERATORS,
  NUMBER_OPERATORS,
  matchesCondition,
  applyConditions,
} from '../advancedFilterApply';

const DATE_COLS = { d: { type: 'date' } };
const NUM_COLS = { n: { type: 'number' } };
const ENUM_COLS = { e: { type: 'enum' } };
const ZERO_BLANK_COLS = { z: { type: 'number', emptyWhenZero: true } };

/** Runs a single condition through the public entry point. */
const match = (row, field, operator, value, cols = null) =>
  matchesCondition(row, { field, operator, value }, cols);

const f = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });
const ids = (rows) => rows.map((r) => r.id);

// ---------------------------------------------------------------------------
// Table dispatch
// ---------------------------------------------------------------------------

describe('operator table dispatch', () => {
  it('routes a `date` column through the calendar-day table', () => {
    // String comparison (the generic table) would say false: the stored value
    // carries a time part the picker never emits.
    expect(match({ d: '2026-09-01T00:00:00Z' }, 'd', 'equals', '2026-09-01', DATE_COLS)).toBe(true);
    expect(OPERATORS.equals('2026-09-01T00:00:00Z', '2026-09-01')).toBe(false);
  });

  it('routes a `number` column through the numeric-equality table', () => {
    expect(match({ n: 1646.4867 }, 'n', 'equals', '1646.49', NUM_COLS)).toBe(true);
    expect(OPERATORS.equals(1646.4867, '1646.49')).toBe(false);
  });

  it('falls back to the generic table for any other declared type', () => {
    expect(match({ e: 'DRAFT' }, 'e', 'iEquals', 'draft', ENUM_COLS)).toBe(true);
  });

  it('falls back to the generic table when no column metadata is supplied', () => {
    // Historical behaviour: `applyConditions(rows, filter)` with 2 args keeps
    // the pre-ETP-4956 generic-string semantics for every column.
    expect(match({ d: '2026-09-01T00:00:00Z' }, 'd', 'equals', '2026-09-01')).toBe(false);
    expect(match({ d: '2026-09-01' }, 'd', 'equals', '2026-09-01')).toBe(true);
  });

  it('falls back to the generic table for an operator the typed table lacks', () => {
    // The date/number tables only carry comparison operators; a text operator
    // aimed at a numeric column still has to evaluate.
    expect(match({ n: 1646.4867 }, 'n', 'iContains', '646', NUM_COLS)).toBe(true);
    expect(match({ d: '2026-09-01T00:00:00Z' }, 'd', 'iContains', '2026-09', DATE_COLS)).toBe(true);
  });

  it('keeps the row when the operator is unknown everywhere', () => {
    expect(match({ n: 1 }, 'n', 'mysteryOp', 1, NUM_COLS)).toBe(true);
    expect(match({ n: 1 }, 'n', 'mysteryOp', 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Date operators
// ---------------------------------------------------------------------------

describe('DATE_OPERATORS', () => {
  // Both forms of the same calendar day: the backend sends a civil date with a
  // fake UTC-midnight time part, the picker sends the bare day. They must be
  // equal, and `parseCalendarDate` makes that hold in every timezone because it
  // reads the leading yyyy-MM-dd and rebuilds the Date with the LOCAL
  // constructor (the ETP-4850 class of bug).
  const STORED = '2026-09-01T00:00:00Z';
  const TYPED = '2026-09-01';

  it('equals matches the same calendar day across both value shapes', () => {
    expect(DATE_OPERATORS.equals(STORED, TYPED)).toBe(true);
    expect(DATE_OPERATORS.equals(TYPED, STORED)).toBe(true);
    expect(DATE_OPERATORS.equals(TYPED, TYPED)).toBe(true);
    expect(DATE_OPERATORS.equals(STORED, STORED)).toBe(true);
  });

  it('equals rejects a neighbouring day', () => {
    expect(DATE_OPERATORS.equals(STORED, '2026-08-31')).toBe(false);
    expect(DATE_OPERATORS.equals(STORED, '2026-09-02')).toBe(false);
  });

  it('discriminates days inside the same year (the parseFloat-year bug)', () => {
    // The pre-fix code ran both sides through parseFloat, where
    // parseFloat('2026-09-01') === 2026 — so every date in a year collapsed to
    // that year and Before/After could not tell them apart. The generic table
    // still behaves that way, which is exactly why `type: 'date'` must dispatch
    // elsewhere.
    expect(DATE_OPERATORS.lessThan('2026-08-21', '2026-08-31')).toBe(true);
    expect(DATE_OPERATORS.greaterThan('2026-09-01', '2026-08-31')).toBe(true);
    expect(OPERATORS.lessThan('2026-08-21', '2026-08-31')).toBe(false);
    expect(OPERATORS.greaterThan('2026-09-01', '2026-08-31')).toBe(false);
  });

  it('lessThan / greaterThan are strict and mutually exclusive', () => {
    expect(DATE_OPERATORS.lessThan(STORED, TYPED)).toBe(false);
    expect(DATE_OPERATORS.greaterThan(STORED, TYPED)).toBe(false);
  });

  it('lessOrEqual / greaterOrEqual include the boundary day', () => {
    expect(DATE_OPERATORS.lessOrEqual(STORED, TYPED)).toBe(true);
    expect(DATE_OPERATORS.greaterOrEqual(STORED, TYPED)).toBe(true);
    expect(DATE_OPERATORS.lessOrEqual('2026-09-02', TYPED)).toBe(false);
    expect(DATE_OPERATORS.greaterOrEqual('2026-08-31', TYPED)).toBe(false);
  });

  it('notEqual is the exact complement of equals', () => {
    expect(DATE_OPERATORS.notEqual(STORED, '2026-08-31')).toBe(true);
    expect(DATE_OPERATORS.notEqual(STORED, TYPED)).toBe(false);
  });

  it('notEqual keeps a row with no date (permissive, unlike the ordering operators)', () => {
    // A row with no date genuinely "is not" the given day, so notEqual matches
    // it — while lessThan/greaterThan cannot place an absent value at all and
    // therefore drop it. Asserted together so the asymmetry stays deliberate.
    expect(DATE_OPERATORS.notEqual(null, TYPED)).toBe(true);
    expect(DATE_OPERATORS.notEqual('', TYPED)).toBe(true);
    expect(DATE_OPERATORS.lessThan(null, TYPED)).toBe(false);
    expect(DATE_OPERATORS.greaterThan(null, TYPED)).toBe(false);
  });

  it('notEqual filters nothing out while the typed date is unusable', () => {
    // Same "don't filter out on an incomplete condition" rule matchesCondition
    // applies to an unknown operator.
    expect(DATE_OPERATORS.notEqual(STORED, 'not-a-date')).toBe(true);
    expect(DATE_OPERATORS.notEqual(STORED, '')).toBe(true);
  });

  it('between is inclusive on both bounds', () => {
    expect(DATE_OPERATORS.between(STORED, ['2026-09-01', '2026-09-30'])).toBe(true);
    expect(DATE_OPERATORS.between(STORED, ['2026-08-01', '2026-09-01'])).toBe(true);
    expect(DATE_OPERATORS.between(STORED, ['2026-09-02', '2026-09-30'])).toBe(false);
  });

  it('between does not match when a bound is missing or unparseable', () => {
    expect(DATE_OPERATORS.between(STORED, ['2026-09-01'])).toBe(false);
    expect(DATE_OPERATORS.between(STORED, null)).toBe(false);
    expect(DATE_OPERATORS.between(STORED, ['nope', '2026-09-30'])).toBe(false);
  });

  it('does not match when the stored value is absent or not a date', () => {
    for (const raw of [null, undefined, '', '   ', 'pending']) {
      expect(DATE_OPERATORS.equals(raw, TYPED)).toBe(false);
      expect(DATE_OPERATORS.lessThan(raw, TYPED)).toBe(false);
      expect(DATE_OPERATORS.greaterThan(raw, TYPED)).toBe(false);
    }
  });

  it('does not match when the typed value is empty (an unfinished condition)', () => {
    expect(DATE_OPERATORS.equals(STORED, '')).toBe(false);
    expect(DATE_OPERATORS.equals(STORED, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Number operators
// ---------------------------------------------------------------------------

describe('NUMBER_OPERATORS', () => {
  // The grid renders 1646.4867 as "1.646,49 €". Filtering for what is on
  // screen must therefore match, which string equality never did.
  const STORED = 1646.4867;

  it('equals compares numerically at the precision the user typed', () => {
    expect(NUMBER_OPERATORS.equals(STORED, '1646.49')).toBe(true);
    expect(NUMBER_OPERATORS.equals(STORED, 1646.49)).toBe(true);
    expect(NUMBER_OPERATORS.equals(STORED, '1646.4867')).toBe(true);
  });

  it('equals does not over-match at a coarser precision than the display scale', () => {
    // Scale is floored at 2 decimals, so "1646" is compared as 1646.00.
    expect(NUMBER_OPERATORS.equals(STORED, '1646')).toBe(false);
    expect(NUMBER_OPERATORS.equals(STORED, '1646.4')).toBe(false);
    expect(NUMBER_OPERATORS.equals(1646, '1646')).toBe(true);
  });

  it('equals caps the comparison scale at 6 decimals', () => {
    // Typed with 7 decimals, compared at 6 → both sides round to 1.000000.
    expect(NUMBER_OPERATORS.equals(1.0000001, '1.0000002')).toBe(true);
    expect(NUMBER_OPERATORS.equals(1.0000001, '1.001')).toBe(false);
  });

  it('equals accepts both decimal separators (presets saved before normalization)', () => {
    expect(NUMBER_OPERATORS.equals(STORED, '1646,49')).toBe(true);
    expect(NUMBER_OPERATORS.equals(STORED, '1.646,49')).toBe(true);
    expect(NUMBER_OPERATORS.equals(STORED, '1,646.49')).toBe(true);
  });

  it('reads a lone 3-digit trailing group as thousands, not decimals', () => {
    expect(NUMBER_OPERATORS.equals(1646, '1,646')).toBe(true);
    expect(NUMBER_OPERATORS.equals(1646, '1.646')).toBe(true);
    expect(NUMBER_OPERATORS.equals(1.646, '1.646')).toBe(false);
  });

  it('equals does not match when either side is not a number', () => {
    expect(NUMBER_OPERATORS.equals(null, '1646.49')).toBe(false);
    expect(NUMBER_OPERATORS.equals('', '1646.49')).toBe(false);
    expect(NUMBER_OPERATORS.equals(STORED, 'abc')).toBe(false);
    expect(NUMBER_OPERATORS.equals(STORED, '')).toBe(false);
  });

  it('treats 0 as a real number, not as absent', () => {
    expect(NUMBER_OPERATORS.equals(0, '0')).toBe(true);
    expect(NUMBER_OPERATORS.greaterOrEqual(0, 0)).toBe(true);
  });

  it('notEqual is the exact complement of equals at the typed precision', () => {
    expect(NUMBER_OPERATORS.notEqual(STORED, '1646.49')).toBe(false);
    expect(NUMBER_OPERATORS.notEqual(STORED, '1646.4867')).toBe(false);
    expect(NUMBER_OPERATORS.notEqual(STORED, '1646')).toBe(true);
  });

  it('notEqual keeps a row with no amount (permissive, unlike the comparisons)', () => {
    // An absent amount is not equal to any number, so notEqual matches it;
    // greaterThan/lessThan cannot rank it and drop it instead.
    expect(NUMBER_OPERATORS.notEqual(null, '1646')).toBe(true);
    expect(NUMBER_OPERATORS.notEqual('n/a', '1646')).toBe(true);
    expect(NUMBER_OPERATORS.greaterThan(null, '1646')).toBe(false);
    expect(NUMBER_OPERATORS.lessThan(null, '1646')).toBe(false);
  });

  it('comparisons are numeric and guard non-numeric sides', () => {
    expect(NUMBER_OPERATORS.greaterThan(250, 100)).toBe(true);
    expect(NUMBER_OPERATORS.lessThan(-200, 0)).toBe(true);
    expect(NUMBER_OPERATORS.lessOrEqual(100, 100)).toBe(true);
    expect(NUMBER_OPERATORS.greaterThan('abc', 0)).toBe(false);
    expect(NUMBER_OPERATORS.greaterThan(0, 'abc')).toBe(false);
  });

  it('between is inclusive and requires both bounds', () => {
    expect(NUMBER_OPERATORS.between(100, [100, 200])).toBe(true);
    expect(NUMBER_OPERATORS.between(200, [100, 200])).toBe(true);
    expect(NUMBER_OPERATORS.between(250, [100, 200])).toBe(false);
    expect(NUMBER_OPERATORS.between(150, [100])).toBe(false);
    expect(NUMBER_OPERATORS.between(150, null)).toBe(false);
  });

  it('between accepts locale-formatted bounds', () => {
    expect(NUMBER_OPERATORS.between(1646.4867, ['1.000,00', '2.000,00'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// String operators — trimming
// ---------------------------------------------------------------------------

describe('OPERATORS — text projection trims both sides', () => {
  it('iContains ignores leading/trailing whitespace in the typed value', () => {
    expect(OPERATORS.iContains('Ivan Abedul', '  Ivan  ')).toBe(true);
    expect(OPERATORS.iContains('Ivan Abedul', 'ivan')).toBe(true);
    expect(OPERATORS.iContains('Ivan Abedul', 'Juan')).toBe(false);
  });

  it('iContains ignores whitespace padding in the stored value', () => {
    expect(OPERATORS.iContains('  Ivan Abedul  ', 'Ivan Abedul')).toBe(true);
  });

  it('iEquals / iNotEqual / iStartsWith trim too', () => {
    expect(OPERATORS.iEquals(' DOC-001 ', 'doc-001')).toBe(true);
    expect(OPERATORS.iNotEqual(' DOC-001 ', 'doc-001')).toBe(false);
    expect(OPERATORS.iStartsWith('  Ivan Abedul', ' ivan')).toBe(true);
  });

  it('equals / notEqual trim, in both the scalar and the array form', () => {
    expect(OPERATORS.equals(' DRAFT ', 'draft')).toBe(true);
    expect(OPERATORS.equals(' DRAFT ', [' draft ', 'pending'])).toBe(true);
    expect(OPERATORS.notEqual(' DRAFT ', [' draft ', 'pending'])).toBe(false);
    expect(OPERATORS.notEqual('PARTIAL', ['draft', 'pending'])).toBe(true);
  });

  it('an empty typed value keeps every row on iContains (no filtering)', () => {
    expect(OPERATORS.iContains('anything', '   ')).toBe(true);
  });
});

describe('OPERATORS — set membership', () => {
  it('equals with an array behaves as "is any of" (multi-select emits arrays)', () => {
    expect(OPERATORS.equals('BPD', ['BPD', 'BPW'])).toBe(true);
    expect(OPERATORS.equals('BF', ['BPD', 'BPW'])).toBe(false);
    expect(OPERATORS.equals('BPD', [])).toBe(false);
  });

  it('inSet still accepts a comma-separated string (presets saved earlier)', () => {
    expect(OPERATORS.inSet('RECONCILED', 'DRAFT, RECONCILED')).toBe(true);
    expect(OPERATORS.inSet('PARTIAL', 'DRAFT, RECONCILED')).toBe(false);
    expect(OPERATORS.inSet('BPW', ['BPD', 'BPW'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Empty / not-empty
// ---------------------------------------------------------------------------

describe('isNull / isNotNull', () => {
  it('treats null, undefined and empty string as empty', () => {
    for (const raw of [null, undefined, '']) {
      expect(match({ v: raw }, 'v', 'isNull')).toBe(true);
      expect(match({ v: raw }, 'v', 'isNotNull')).toBe(false);
    }
  });

  it('treats a whitespace-only value as empty', () => {
    expect(match({ v: '   ' }, 'v', 'isNull')).toBe(true);
    expect(match({ v: '\t\n' }, 'v', 'isNull')).toBe(true);
    expect(match({ v: 'x' }, 'v', 'isNull')).toBe(false);
  });

  it('treats a stored 0 as present on a plain column', () => {
    expect(match({ n: 0 }, 'n', 'isNull', null, NUM_COLS)).toBe(false);
    expect(match({ n: 0 }, 'n', 'isNotNull', null, NUM_COLS)).toBe(true);
  });

  it('treats a stored 0 as empty on an `emptyWhenZero` column', () => {
    // Mirrors StatementsTable: `Number(totalOut) > 0 ? amount : '—'`, so 0 and
    // null render identically and "Is empty" must match both.
    expect(match({ z: 0 }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(true);
    expect(match({ z: '0.00' }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(true);
    expect(match({ z: null }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(true);
    expect(match({ z: 50 }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(false);
  });

  it('counts anything the grid renders as "—" as empty, negatives included', () => {
    // Deliberate: the flag reproduces the grid predicate exactly, and the grid
    // shows "—" for a non-positive amount.
    expect(match({ z: -5 }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(true);
    expect(match({ z: 'n/a' }, 'z', 'isNull', null, ZERO_BLANK_COLS)).toBe(true);
  });

  it('isNotNull is the exact complement of isNull on every column shape', () => {
    const cases = [
      [{ z: 0 }, 'z', ZERO_BLANK_COLS],
      [{ z: 50 }, 'z', ZERO_BLANK_COLS],
      [{ n: 0 }, 'n', NUM_COLS],
      [{ v: '  ' }, 'v', null],
      [{ v: 'x' }, 'v', null],
      [{ d: '2026-09-01' }, 'd', DATE_COLS],
      [{ d: null }, 'd', DATE_COLS],
    ];
    for (const [row, field, cols] of cases) {
      expect(match(row, field, 'isNotNull', null, cols))
        .toBe(!match(row, field, 'isNull', null, cols));
    }
  });

  it('applies the same blank check on a date column (no table dispatch)', () => {
    expect(match({ d: '' }, 'd', 'isNull', null, DATE_COLS)).toBe(true);
    expect(match({ d: '2026-09-01T00:00:00Z' }, 'd', 'isNull', null, DATE_COLS)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyConditions
// ---------------------------------------------------------------------------

describe('applyConditions', () => {
  const ROWS = [
    { id: 'a', d: '2026-09-01T00:00:00Z', n: 1661.01, s: 'Ivan Abedul' },
    { id: 'b', d: '2026-08-31T00:00:00Z', n: 1646.4867, s: 'Ivan Abedul' },
    { id: 'c', d: '2026-08-21T00:00:00Z', n: 1652.54, s: 'Juan Perez' },
  ];
  const COLS = { d: { type: 'date' }, n: { type: 'number' }, s: { type: 'string' } };

  it('returns the SAME array reference for a no-op filter', () => {
    expect(applyConditions(ROWS, null, undefined, COLS)).toBe(ROWS);
    expect(applyConditions(ROWS, {}, undefined, COLS)).toBe(ROWS);
    expect(applyConditions(ROWS, f([]), undefined, COLS)).toBe(ROWS);
    expect(applyConditions(ROWS, { conditions: 'nope' }, undefined, COLS)).toBe(ROWS);
  });

  it('ignores conditions missing a field or an operator', () => {
    expect(applyConditions(ROWS, f([{ field: 'n', value: 1 }]), undefined, COLS)).toBe(ROWS);
    expect(applyConditions(ROWS, f([{ operator: 'equals', value: 1 }]), undefined, COLS)).toBe(ROWS);
    expect(applyConditions(ROWS, f([null, undefined]), undefined, COLS)).toBe(ROWS);
  });

  it('keeps evaluating the complete conditions when one is incomplete', () => {
    const out = applyConditions(ROWS, f([
      { field: 's' },
      { field: 'd', operator: 'equals', value: '2026-09-01' },
    ]), undefined, COLS);
    expect(ids(out)).toEqual(['a']);
  });

  it('AND requires every condition to match', () => {
    const out = applyConditions(ROWS, f([
      { field: 's', operator: 'iContains', value: ' ivan ' },
      { field: 'n', operator: 'equals', value: '1646.49' },
    ]), undefined, COLS);
    expect(ids(out)).toEqual(['b']);
  });

  it('OR requires at least one condition to match', () => {
    const out = applyConditions(ROWS, f([
      { field: 'd', operator: 'greaterThan', value: '2026-08-31' },
      { field: 's', operator: 'iEquals', value: 'Juan Perez' },
    ], 'or'), undefined, COLS);
    expect(ids(out)).toEqual(['a', 'c']);
  });

  it('Before / After around the same day are disjoint and cover the rest', () => {
    const before = ids(applyConditions(ROWS, f([{ field: 'd', operator: 'lessThan', value: '2026-08-31' }]), undefined, COLS));
    const after = ids(applyConditions(ROWS, f([{ field: 'd', operator: 'greaterThan', value: '2026-08-31' }]), undefined, COLS));
    const on = ids(applyConditions(ROWS, f([{ field: 'd', operator: 'equals', value: '2026-08-31' }]), undefined, COLS));
    expect(before).toEqual(['c']);
    expect(after).toEqual(['a']);
    expect(on).toEqual(['b']);
    expect([...before, ...on, ...after].sort()).toEqual(['a', 'b', 'c']);
  });

  it('applies the optional deriveRow projection before evaluating', () => {
    const out = applyConditions(
      ROWS,
      f([{ field: 'derived', operator: 'equals', value: 'HIGH' }]),
      (r) => ({ ...r, derived: r.n > 1650 ? 'HIGH' : 'LOW' }),
      COLS,
    );
    expect(ids(out)).toEqual(['a', 'c']);
  });

  it('does not mutate the input rows', () => {
    const snapshot = JSON.stringify(ROWS);
    applyConditions(ROWS, f([{ field: 'n', operator: 'greaterThan', value: 0 }]), (r) => ({ ...r, x: 1 }), COLS);
    expect(JSON.stringify(ROWS)).toBe(snapshot);
  });

  it('handles an empty rows array', () => {
    expect(applyConditions([], f([{ field: 'n', operator: 'equals', value: 1 }]), undefined, COLS)).toEqual([]);
  });

  it('is tolerant of rows missing the filtered field entirely', () => {
    const sparse = [{ id: 'x' }, { id: 'y', n: 5 }];
    expect(ids(applyConditions(sparse, f([{ field: 'n', operator: 'greaterThan', value: 1 }]), undefined, COLS))).toEqual(['y']);
    expect(ids(applyConditions(sparse, f([{ field: 'n', operator: 'isNull' }]), undefined, COLS))).toEqual(['x']);
  });
});
