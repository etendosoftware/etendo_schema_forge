import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildAdvancedFilterCriteria } from '../gridQuery.js';

// buildAdvancedFilterCriteria is the single entry point into a chain of private helpers
// (buildRowCriteria, createNullCriteria, generateInSetCriteria, buildOrCriteria,
// processInput, buildNumericCriteria, coerceNumeric). Driving it through its public
// signature is the only way to cover them, which is why every case below asserts on the
// emitted SmartClient criteria rather than on an internal call.
//
// Companion of gridQuery.test.js — kept in its own file so the two suites can evolve
// independently.

const TEXT_COL = { key: 'documentNo', type: 'string' };
const NUM_COL = { key: 'grandTotalAmount', type: 'amount' };
const BOOL_COL = { key: 'posted', type: 'boolean' };
const FK_COL = { key: 'businessPartner', type: 'selector' };

const cond = (field, operator, value) => ({ field, operator, value });
const filter = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });

describe('buildAdvancedFilterCriteria', () => {
  describe('guards', () => {
    it('returns null for a missing or empty filter', () => {
      assert.equal(buildAdvancedFilterCriteria(null, [TEXT_COL]), null);
      assert.equal(buildAdvancedFilterCriteria(undefined, [TEXT_COL]), null);
      assert.equal(buildAdvancedFilterCriteria(filter([]), [TEXT_COL]), null);
    });

    it('returns null when columns is not an array', () => {
      const f = filter([cond('documentNo', 'iContains', 'INV')]);
      assert.equal(buildAdvancedFilterCriteria(f, null), null);
      assert.equal(buildAdvancedFilterCriteria(f, undefined), null);
    });

    it('skips conditions whose field matches no column', () => {
      const f = filter([cond('ghostField', 'iContains', 'x')]);
      assert.equal(buildAdvancedFilterCriteria(f, [TEXT_COL]), null);
    });

    it('skips a condition with no operator', () => {
      const f = filter([cond('documentNo', undefined, 'INV')]);
      assert.equal(buildAdvancedFilterCriteria(f, [TEXT_COL]), null);
    });

    it('skips a condition whose value is empty, null or undefined', () => {
      for (const value of ['', null, undefined]) {
        const f = filter([cond('documentNo', 'iContains', value)]);
        assert.equal(buildAdvancedFilterCriteria(f, [TEXT_COL]), null, `value: ${value}`);
      }
    });
  });

  describe('row composition', () => {
    it('emits AND rows flat so they compose with the surrounding AND layer', () => {
      const f = filter([
        cond('documentNo', 'iContains', 'INV'),
        cond('grandTotalAmount', 'greaterThan', 100),
      ]);
      const out = buildAdvancedFilterCriteria(f, [TEXT_COL, NUM_COL]);
      assert.deepEqual(out, [
        { fieldName: 'documentNo', operator: 'iContains', value: 'INV' },
        { fieldName: 'grandTotalAmount', operator: 'greaterThan', value: 100 },
      ]);
    });

    it('wraps multiple OR rows in a single AdvancedCriteria block', () => {
      const f = filter([
        cond('documentNo', 'iContains', 'INV'),
        cond('grandTotalAmount', 'greaterThan', 100),
      ], 'or');
      const out = buildAdvancedFilterCriteria(f, [TEXT_COL, NUM_COL]);
      assert.equal(out.length, 1);
      assert.equal(out[0]._constructor, 'AdvancedCriteria');
      assert.equal(out[0].operator, 'or');
      assert.equal(out[0].criteria.length, 2);
    });

    it('leaves a single OR row unwrapped', () => {
      const f = filter([cond('documentNo', 'iContains', 'INV')], 'or');
      const out = buildAdvancedFilterCriteria(f, [TEXT_COL]);
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'iContains', value: 'INV' }]);
    });

    it('drops invalid rows while keeping the valid ones', () => {
      const f = filter([
        cond('ghost', 'iContains', 'x'),
        cond('documentNo', 'iContains', 'INV'),
        cond('grandTotalAmount', 'greaterThan', 'not-a-number'),
      ]);
      const out = buildAdvancedFilterCriteria(f, [TEXT_COL, NUM_COL]);
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'iContains', value: 'INV' }]);
    });
  });

  describe('column-supplied buildCriteria', () => {
    it('delegates entirely to the column when it provides buildCriteria', () => {
      const col = {
        key: 'custom',
        buildCriteria: (row) => [{ fieldName: 'mapped', operator: 'equals', value: row.value }],
      };
      const out = buildAdvancedFilterCriteria(filter([cond('custom', 'equals', 7)]), [col]);
      assert.deepEqual(out, [{ fieldName: 'mapped', operator: 'equals', value: 7 }]);
    });

    it('treats a nullish buildCriteria result as no criteria', () => {
      const col = { key: 'custom', buildCriteria: () => undefined };
      const out = buildAdvancedFilterCriteria(filter([cond('custom', 'equals', 7)]), [col]);
      assert.equal(out, null);
    });
  });

  describe('null operators', () => {
    it('maps isNull straight through', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'isNull')]), [TEXT_COL],
      );
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'isNull' }]);
    });

    it('maps isNotNull to the backend notNull operator', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'isNotNull')]), [TEXT_COL],
      );
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'notNull' }]);
    });
  });

  describe('between', () => {
    it('expands to greaterOrEqual + lessOrEqual', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'between', [10, 20])]), [NUM_COL],
      );
      assert.deepEqual(out, [
        { fieldName: 'grandTotalAmount', operator: 'greaterOrEqual', value: 10 },
        { fieldName: 'grandTotalAmount', operator: 'lessOrEqual', value: 20 },
      ]);
    });

    it('coerces thousands-separated numeric bounds', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'between', ['1,500', '2,500'])]), [NUM_COL],
      );
      assert.deepEqual(out.map((c) => c.value), [1500, 2500]);
    });

    it('passes bounds through unchanged for non-numeric modes', () => {
      const dateCol = { key: 'invoiceDate', type: 'date' };
      const out = buildAdvancedFilterCriteria(
        filter([cond('invoiceDate', 'between', ['2026-01-01', '2026-01-31'])]), [dateCol],
      );
      assert.deepEqual(out.map((c) => c.value), ['2026-01-01', '2026-01-31']);
    });

    it('returns null when the value is not a pair', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'between', 10)]), [NUM_COL],
      );
      assert.equal(out, null);
    });

    it('returns null when either bound is missing', () => {
      for (const pair of [['', 20], [10, ''], [null, 20], [10, null]]) {
        const out = buildAdvancedFilterCriteria(
          filter([cond('grandTotalAmount', 'between', pair)]), [NUM_COL],
        );
        assert.equal(out, null, `pair: ${JSON.stringify(pair)}`);
      }
    });

    it('returns null when a numeric bound cannot be coerced', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'between', ['abc', 20])]), [NUM_COL],
      );
      assert.equal(out, null);
    });
  });

  describe('inSet', () => {
    it('splits a comma-separated string and OR-composes iEquals', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'inSet', 'INV-1, INV-2')]), [TEXT_COL],
      );
      assert.equal(out.length, 1);
      assert.equal(out[0].operator, 'or');
      assert.deepEqual(out[0].criteria, [
        { fieldName: 'documentNo', operator: 'iEquals', value: 'INV-1' },
        { fieldName: 'documentNo', operator: 'iEquals', value: 'INV-2' },
      ]);
    });

    it('emits a flat criterion for a single-item set', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'inSet', 'INV-1')]), [TEXT_COL],
      );
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'iEquals', value: 'INV-1' }]);
    });

    it('accepts an array and drops empty entries', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'inSet', ['INV-1', '', null, 'INV-2'])]), [TEXT_COL],
      );
      assert.deepEqual(out[0].criteria.map((c) => c.value), ['INV-1', 'INV-2']);
    });

    it('returns null when the set has no usable entry', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'inSet', ['', null])]), [TEXT_COL],
      );
      assert.equal(out, null);
    });
  });

  describe('multi-value pickers', () => {
    it('OR-composes the same operator across array values', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'iEquals', ['A', 'B'])]), [TEXT_COL],
      );
      assert.equal(out[0]._constructor, 'AdvancedCriteria');
      assert.deepEqual(out[0].criteria.map((c) => c.value), ['A', 'B']);
    });

    it('emits a flat criterion for a single-element array', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('documentNo', 'iEquals', ['A'])]), [TEXT_COL],
      );
      assert.deepEqual(out, [{ fieldName: 'documentNo', operator: 'iEquals', value: 'A' }]);
    });
  });

  describe('mode-specific coercion', () => {
    it('coerces numeric values, stripping thousands separators', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'greaterThan', '1,234.50')]), [NUM_COL],
      );
      assert.deepEqual(out, [
        { fieldName: 'grandTotalAmount', operator: 'greaterThan', value: 1234.5 },
      ]);
    });

    it('keeps a real number as-is', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('grandTotalAmount', 'lessThan', 42)]), [NUM_COL],
      );
      assert.equal(out[0].value, 42);
    });

    it('maps boolean-label columns onto the backend Y/N equals', () => {
      for (const [input, expected] of [[true, 'Y'], ['true', 'Y'], ['Y', 'Y'], [false, 'N'], ['whatever', 'N']]) {
        const out = buildAdvancedFilterCriteria(
          filter([cond('posted', 'equals', input)]), [BOOL_COL],
        );
        assert.deepEqual(out, [{ fieldName: 'posted', operator: 'equals', value: expected }],
          `input: ${input}`);
      }
    });
  });

  describe('field-name resolution', () => {
    it('targets the $_identifier for a textual op on an identifier column', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('businessPartner', 'iContains', 'Acme')]), [FK_COL],
      );
      assert.equal(out[0].fieldName, 'businessPartner$_identifier');
    });

    it('targets the raw key for a discrete op on an identifier column', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('businessPartner', 'equals', 'BP-1')]), [FK_COL],
      );
      assert.equal(out[0].fieldName, 'businessPartner');
    });

    it('honours an explicit backendFilterKey over both', () => {
      const col = { ...FK_COL, backendFilterKey: 'bp.searchKey' };
      const out = buildAdvancedFilterCriteria(
        filter([cond('businessPartner', 'iContains', 'Acme')]), [col],
      );
      assert.equal(out[0].fieldName, 'bp.searchKey');
    });

    it('uses a declared filterMode over the inferred one', () => {
      // type 'custom' carries no filter semantics — the explicit filterMode is what makes
      // this column numeric (the ETP-4681 case).
      const col = { key: 'outstandingAmount', type: 'custom', filterMode: 'numeric' };
      const out = buildAdvancedFilterCriteria(
        filter([cond('outstandingAmount', 'greaterThan', '0')]), [col],
      );
      assert.deepEqual(out, [
        { fieldName: 'outstandingAmount', operator: 'greaterThan', value: 0 },
      ]);
    });
  });

  // ETP-4770: "Antes de" (Before) on a date column must exclude the entered
  // day itself, regardless of whether the column also happens to be the
  // window's `dateFilterKey` (the separate quick date-range picker). A prior
  // regression: this exact fix landed only in the schema_forge_core package
  // copy of gridQuery.js and never in this repo's own local copy (the one
  // ListView.jsx actually imports via '@/lib/gridQuery'), so it silently had
  // zero effect in the running app for every window.
  describe('date "Before" excludes the boundary day (ETP-4770)', () => {
    const DATE_COL = { key: 'orderDate', type: 'date' };
    // Mirrors a real window config where the same field is ALSO wired as the
    // quick "date range" filter (decisions.json `dateFilterKey`) — that must
    // not change how the advanced filter builds its own criteria.
    const DATE_COL_WITH_FILTER_KEY = { key: 'orderDate', type: 'date', dateFilterKey: true };

    it('shifts lessThan back a day and uses lessOrEqual', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('orderDate', 'lessThan', '2026-08-06')]), [DATE_COL],
      );
      assert.deepEqual(out, [
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-08-05' },
      ]);
    });

    it('still shifts when the column is also the dateFilterKey target', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('orderDate', 'lessThan', '2026-08-06')]), [DATE_COL_WITH_FILTER_KEY],
      );
      assert.deepEqual(out, [
        { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-08-05' },
      ]);
    });

    it('does not affect greaterThan (After stays untouched)', () => {
      const out = buildAdvancedFilterCriteria(
        filter([cond('orderDate', 'greaterThan', '2026-08-06')]), [DATE_COL],
      );
      assert.deepEqual(out, [
        { fieldName: 'orderDate', operator: 'greaterThan', value: '2026-08-06' },
      ]);
    });

    it('does not affect greaterOrEqual, equals, or between', () => {
      assert.deepEqual(
        buildAdvancedFilterCriteria(filter([cond('orderDate', 'greaterOrEqual', '2026-08-06')]), [DATE_COL]),
        [{ fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-08-06' }],
      );
      assert.deepEqual(
        buildAdvancedFilterCriteria(filter([cond('orderDate', 'equals', '2026-08-06')]), [DATE_COL]),
        [{ fieldName: 'orderDate', operator: 'equals', value: '2026-08-06' }],
      );
      assert.deepEqual(
        buildAdvancedFilterCriteria(
          filter([cond('orderDate', 'between', ['2026-08-01', '2026-08-06'])]), [DATE_COL],
        ),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-08-01' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-08-06' },
        ],
      );
    });
  });
});
