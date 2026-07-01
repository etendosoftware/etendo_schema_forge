import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDisplayText,
  parseUserFilter,
  resolveBackendSort,
  buildBackendFilter,
  resolveFilterMode,
  buildAdvancedFilterCriteria,
  getFilteredKey,
} from '../gridQuery.js';

// ---------------------------------------------------------------------------
// getDisplayText
// ---------------------------------------------------------------------------

describe('getDisplayText', () => {
  describe('selector / FK columns', () => {
    it('returns $\_identifier when present', () => {
      const row = { businessPartner: 'some-uuid', 'businessPartner$_identifier': 'A. Datum Corp' };
      const col = { key: 'businessPartner', type: 'selector' };
      assert.equal(getDisplayText(row, col), 'A. Datum Corp');
    });

    it('falls back to row[key].name for mock object-shaped data', () => {
      const row = { businessPartner: { id: '1', name: 'Acme' } };
      const col = { key: 'businessPartner', type: 'selector' };
      assert.equal(getDisplayText(row, col), 'Acme');
    });

    it('falls back to raw string when no identifier', () => {
      const row = { businessPartner: 'some-uuid' };
      const col = { key: 'businessPartner', type: 'selector' };
      assert.equal(getDisplayText(row, col), 'some-uuid');
    });
  });

  describe('status / enum columns', () => {
    const col = {
      key: 'documentStatus',
      type: 'status',
      enumLabels: { DR: 'Draft', CO: 'Completed', IP: 'In Process' },
    };
    it('maps raw code to visible label', () => {
      assert.equal(getDisplayText({ documentStatus: 'CO' }, col), 'Completed');
    });
    it('maps another code', () => {
      assert.equal(getDisplayText({ documentStatus: 'DR' }, col), 'Draft');
    });
    it('returns raw code when not in map', () => {
      assert.equal(getDisplayText({ documentStatus: 'XX' }, col), 'XX');
    });
  });

  describe('boolean columns', () => {
    const col = {
      key: 'processed',
      type: 'boolean',
      badgeLabels: { true: 'Complete', false: 'In Process' },
    };
    it('maps true to badge true label', () => {
      assert.equal(getDisplayText({ processed: true }, col), 'Complete');
    });
    it('maps false to badge false label', () => {
      assert.equal(getDisplayText({ processed: false }, col), 'In Process');
    });
    it('maps string "true"', () => {
      assert.equal(getDisplayText({ processed: 'true' }, col), 'Complete');
    });
    it('maps string "Y"', () => {
      assert.equal(getDisplayText({ processed: 'Y' }, col), 'Complete');
    });
  });

  describe('string columns', () => {
    it('returns raw string value', () => {
      const row = { name: 'Sales Order 001' };
      const col = { key: 'name', type: 'string' };
      assert.equal(getDisplayText(row, col), 'Sales Order 001');
    });
    it('returns empty string for null', () => {
      assert.equal(getDisplayText({ name: null }, { key: 'name' }), '');
    });
    it('returns empty string when row is null', () => {
      assert.equal(getDisplayText(null, { key: 'name' }), '');
    });
  });
});

// ---------------------------------------------------------------------------
// parseUserFilter
// ---------------------------------------------------------------------------

describe('parseUserFilter', () => {
  describe('text mode (default)', () => {
    const col = { key: 'name', type: 'string' };
    it('returns text filter for plain input', () => {
      const result = parseUserFilter(col, 'datum');
      assert.deepEqual(result, { mode: 'text', value: 'datum', originalValue: 'datum' });
    });
    it('returns null for empty string', () => {
      assert.equal(parseUserFilter(col, ''), null);
    });
    it('returns null for whitespace', () => {
      assert.equal(parseUserFilter(col, '   '), null);
    });
  });

  describe('date mode', () => {
    const col = { key: 'orderDate', type: 'date', filterMode: 'date' };

    it('parses dd/mm/yyyy as exact date', () => {
      const result = parseUserFilter(col, '14/04/2026');
      assert.deepEqual(result, { mode: 'date', op: '=', value: '2026-04-14', originalValue: '14/04/2026' });
    });

    it('parses ISO yyyy-mm-dd as exact date', () => {
      const result = parseUserFilter(col, '2026-04-14');
      assert.deepEqual(result, { mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026-04-14' });
    });

    it('parses year-only as year range', () => {
      const result = parseUserFilter(col, '2026');
      assert.deepEqual(result, { mode: 'date', op: 'year', value: '2026', originalValue: '2026' });
    });

    it('parses > operator', () => {
      const result = parseUserFilter(col, '>14/04/2026');
      assert.deepEqual(result, { mode: 'date', op: '>', value: '2026-04-14', originalValue: '>14/04/2026' });
    });

    it('parses < operator', () => {
      const result = parseUserFilter(col, '<01/05/2026');
      assert.deepEqual(result, { mode: 'date', op: '<', value: '2026-05-01', originalValue: '<01/05/2026' });
    });

    it('parses >= operator', () => {
      const result = parseUserFilter(col, '>=14/04/2026');
      assert.deepEqual(result, { mode: 'date', op: '>=', value: '2026-04-14', originalValue: '>=14/04/2026' });
    });

    it('parses date range with ..', () => {
      const result = parseUserFilter(col, '01/04/2026..15/04/2026');
      assert.deepEqual(result, { mode: 'date', op: 'range', value: ['2026-04-01', '2026-04-15'], originalValue: '01/04/2026..15/04/2026' });
    });

    it('parses ISO date range', () => {
      const result = parseUserFilter(col, '2026-04-01..2026-04-15');
      assert.deepEqual(result, { mode: 'date', op: 'range', value: ['2026-04-01', '2026-04-15'], originalValue: '2026-04-01..2026-04-15' });
    });

    it('returns null for range with invalid dates', () => {
      assert.equal(parseUserFilter(col, 'abc..def'), null);
    });
  });

  describe('enumLabel mode', () => {
    const col = {
      key: 'documentStatus',
      type: 'status',
      filterMode: 'enumLabel',
      enumLabels: { DR: 'Draft', CO: 'Completed', IP: 'In Process' },
    };

    it('matches full label (case-insensitive)', () => {
      const result = parseUserFilter(col, 'completed');
      assert.deepEqual(result, { mode: 'enumLabel', value: ['CO'], originalValue: 'completed' });
    });

    it('matches partial label', () => {
      const result = parseUserFilter(col, 'comp');
      assert.deepEqual(result, { mode: 'enumLabel', value: ['CO'], originalValue: 'comp' });
    });

    it('matches multiple labels that share the substring', () => {
      const result = parseUserFilter(col, 'dra');
      assert.deepEqual(result, { mode: 'enumLabel', value: ['DR'], originalValue: 'dra' });
    });

    it('returns null when no label matches', () => {
      assert.equal(parseUserFilter(col, 'zzz'), null);
    });
  });

  describe('booleanLabel mode', () => {
    const col = {
      key: 'processed',
      type: 'boolean',
      filterMode: 'booleanLabel',
      badgeLabels: { true: 'Complete', false: 'In Process' },
    };

    it('matches generic "yes" → true', () => {
      assert.deepEqual(parseUserFilter(col, 'yes'), { mode: 'booleanLabel', value: true, originalValue: 'yes' });
    });

    it('matches generic "no" → false', () => {
      assert.deepEqual(parseUserFilter(col, 'no'), { mode: 'booleanLabel', value: false, originalValue: 'no' });
    });

    it('matches badge true label', () => {
      assert.deepEqual(parseUserFilter(col, 'comp'), { mode: 'booleanLabel', value: true, originalValue: 'comp' });
    });

    it('matches badge false label (partial)', () => {
      assert.deepEqual(parseUserFilter(col, 'in proc'), { mode: 'booleanLabel', value: false, originalValue: 'in proc' });
    });

    it('returns null when no match', () => {
      assert.equal(parseUserFilter(col, 'unknown'), null);
    });
  });

  describe('numeric mode', () => {
    const col = { key: 'grandTotal', type: 'amount', filterMode: 'numeric' };

    it('parses plain number as equality', () => {
      assert.deepEqual(parseUserFilter(col, '1234.5'), { mode: 'numeric', op: '=', value: 1234.5, originalValue: '1234.5' });
    });

    it('parses localized number (comma thousands separator)', () => {
      assert.deepEqual(parseUserFilter(col, '1,234.5'), { mode: 'numeric', op: '=', value: 1234.5, originalValue: '1,234.5' });
    });

    it('parses > operator', () => {
      assert.deepEqual(parseUserFilter(col, '>1000'), { mode: 'numeric', op: '>', value: 1000, originalValue: '>1000' });
    });

    it('parses < operator', () => {
      assert.deepEqual(parseUserFilter(col, '<5000'), { mode: 'numeric', op: '<', value: 5000, originalValue: '<5000' });
    });

    it('returns null for non-numeric input', () => {
      assert.equal(parseUserFilter(col, 'abc'), null);
    });
  });

  describe('identifier mode (selector)', () => {
    const col = { key: 'businessPartner', type: 'selector', filterMode: 'identifier' };

    it('returns identifier filter', () => {
      assert.deepEqual(parseUserFilter(col, 'datum'), { mode: 'identifier', value: 'datum', originalValue: 'datum' });
    });
  });
});

// ---------------------------------------------------------------------------
// resolveBackendSort
// ---------------------------------------------------------------------------

describe('resolveBackendSort', () => {
  it('uses backendSortKey when explicitly defined (identifier uses minus-prefix for desc)', () => {
    const col = { key: 'bp', type: 'selector', backendSortKey: 'bp$_identifier' };
    assert.equal(resolveBackendSort(col, 'asc'), 'bp$_identifier');
    assert.equal(resolveBackendSort(col, 'desc'), '-bp$_identifier');
  });

  it('infers $\_identifier sort for selector type (no backendSortKey)', () => {
    const col = { key: 'businessPartner', type: 'selector' };
    assert.equal(resolveBackendSort(col, 'asc'), 'businessPartner$_identifier');
    assert.equal(resolveBackendSort(col, 'desc'), '-businessPartner$_identifier');
  });

  it('uses raw column for string type', () => {
    const col = { key: 'name', type: 'string' };
    assert.equal(resolveBackendSort(col, 'asc'), 'name asc');
  });

  it('uses raw column for date type', () => {
    const col = { key: 'orderDate', type: 'date' };
    assert.equal(resolveBackendSort(col, 'desc'), 'orderDate desc');
  });

  it('uses raw column for amount type', () => {
    const col = { key: 'grandTotal', type: 'amount' };
    assert.equal(resolveBackendSort(col, 'asc'), 'grandTotal asc');
  });

  it('uses raw column for status type (enum backend sort fallback)', () => {
    const col = {
      key: 'documentStatus',
      type: 'status',
      enumLabels: { DR: 'Draft', CO: 'Completed' },
    };
    assert.equal(resolveBackendSort(col, 'asc'), 'documentStatus asc');
  });

  it('uses raw column for boolean type', () => {
    const col = {
      key: 'processed',
      type: 'boolean',
      badgeLabels: { true: 'Complete', false: 'In Process' },
    };
    assert.equal(resolveBackendSort(col, 'desc'), 'processed desc');
  });

  it('handles null col gracefully (raw fallback)', () => {
    assert.equal(resolveBackendSort(null, 'asc'), ' asc');
  });

  it('handles missing type gracefully (raw fallback)', () => {
    const col = { key: 'someField' };
    assert.equal(resolveBackendSort(col, 'asc'), 'someField asc');
  });

  it('does not depend on sample row presence', () => {
    const col = { key: 'businessPartner', type: 'selector' };
    // No sampleRow involved — pure metadata
    const result = resolveBackendSort(col, 'asc');
    assert.equal(result, 'businessPartner$_identifier');
  });
});

// ---------------------------------------------------------------------------
// buildBackendFilter
// ---------------------------------------------------------------------------

describe('buildBackendFilter', () => {
  it('returns null for null parsed input', () => {
    assert.equal(buildBackendFilter({ key: 'name' }, null), null);
  });

  it('returns null when col is missing key', () => {
    assert.equal(buildBackendFilter({}, { mode: 'text', value: 'x' }), null);
  });

  describe('text mode', () => {
    it('produces iContains criterion', () => {
      const result = buildBackendFilter({ key: 'name' }, { mode: 'text', value: 'datum' });
      assert.deepEqual(result, [{ fieldName: 'name', operator: 'iContains', value: 'datum' }]);
    });
  });

  describe('identifier mode', () => {
    it('appends $\_identifier with iContains by default', () => {
      const col = { key: 'businessPartner', type: 'selector' };
      const parsed = { mode: 'identifier', value: 'datum' };
      assert.deepEqual(buildBackendFilter(col, parsed), [
        { fieldName: 'businessPartner$_identifier', operator: 'iContains', value: 'datum' },
      ]);
    });

    it('respects explicit backendFilterKey', () => {
      const col = { key: 'bp', backendFilterKey: 'bp$name' };
      const parsed = { mode: 'identifier', value: 'acme' };
      assert.deepEqual(buildBackendFilter(col, parsed), [
        { fieldName: 'bp$name', operator: 'iContains', value: 'acme' },
      ]);
    });
  });

  describe('enumLabel mode', () => {
    const col = { key: 'documentStatus' };

    it('produces equals criterion for single code', () => {
      const parsed = { mode: 'enumLabel', value: ['CO'] };
      assert.deepEqual(buildBackendFilter(col, parsed), [
        { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
      ]);
    });

    it('produces inSet criterion for multiple codes', () => {
      const parsed = { mode: 'enumLabel', value: ['CO', 'IP'] };
      assert.deepEqual(buildBackendFilter(col, parsed), [
        { fieldName: 'documentStatus', operator: 'inSet', value: 'CO,IP' },
      ]);
    });
  });

  describe('booleanLabel mode', () => {
    const col = { key: 'processed' };

    it('produces equals true criterion', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'booleanLabel', value: true }), [
        { fieldName: 'processed', operator: 'equals', value: true },
      ]);
    });

    it('produces equals false criterion', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'booleanLabel', value: false }), [
        { fieldName: 'processed', operator: 'equals', value: false },
      ]);
    });
  });

  describe('numeric mode', () => {
    const col = { key: 'grandTotal' };

    it('produces equals criterion', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'numeric', op: '=', value: 1234 }), [
        { fieldName: 'grandTotal', operator: 'equals', value: 1234 },
      ]);
    });

    it('produces greaterThan criterion', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'numeric', op: '>', value: 1000 }), [
        { fieldName: 'grandTotal', operator: 'greaterThan', value: 1000 },
      ]);
    });

    it('produces lessThan criterion', () => {
      assert.deepEqual(buildBackendFilter(col, { mode: 'numeric', op: '<', value: 5000 }), [
        { fieldName: 'grandTotal', operator: 'lessThan', value: 5000 },
      ]);
    });
  });

  describe('date mode', () => {
    const col = { key: 'orderDate' };

    it('produces full-day range criterion for exact date', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: '=', value: '2026-04-14' }),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-14' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-14' },
        ],
      );
    });

    it('produces greaterOrEqual + lessOrEqual criteria for year range', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: 'year', value: '2026' }),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-01-01' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-12-31' },
        ],
      );
    });

    it('produces greaterOrEqual on next day for strict >', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: '>', value: '2026-04-14' }),
        [{ fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-15' }],
      );
    });

    it('produces lessOrEqual on previous day for strict <', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: '<', value: '2026-04-15' }),
        [{ fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-14' }],
      );
    });

    it('produces greaterOrEqual as-is for >=', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: '>=', value: '2026-04-14' }),
        [{ fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-14' }],
      );
    });

    it('produces lessOrEqual as-is for <=', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: '<=', value: '2026-04-15' }),
        [{ fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-15' }],
      );
    });

    it('produces greaterOrEqual + lessOrEqual for date range', () => {
      assert.deepEqual(
        buildBackendFilter(col, { mode: 'date', op: 'range', value: ['2026-04-01', '2026-04-15'] }),
        [
          { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-04-01' },
          { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-04-15' },
        ],
      );
    });

    it('respects explicit backendFilterKey', () => {
      const col2 = { key: 'orderDate', backendFilterKey: 'c_order.dateordered' };
      assert.deepEqual(
        buildBackendFilter(col2, { mode: 'date', op: '=', value: '2026-04-14' }),
        [
          { fieldName: 'c_order.dateordered', operator: 'greaterOrEqual', value: '2026-04-14' },
          { fieldName: 'c_order.dateordered', operator: 'lessOrEqual', value: '2026-04-14' },
        ],
      );
    });
  });
});

// ---------------------------------------------------------------------------
// resolveFilterMode
// ---------------------------------------------------------------------------

describe('resolveFilterMode', () => {
  it('maps percent type to numeric mode', () => {
    assert.equal(resolveFilterMode({ key: 'deliveryStatus', type: 'percent' }), 'numeric');
  });

  it('maps number type to numeric mode', () => {
    assert.equal(resolveFilterMode({ key: 'qty', type: 'number' }), 'numeric');
  });

  it('maps amount type to numeric mode', () => {
    assert.equal(resolveFilterMode({ key: 'total', type: 'amount' }), 'numeric');
  });

  it('maps status type to enumLabel mode', () => {
    assert.equal(resolveFilterMode({ key: 'docStatus', type: 'status' }), 'enumLabel');
  });

  it('maps date type to date mode', () => {
    assert.equal(resolveFilterMode({ key: 'orderDate', type: 'date' }), 'date');
  });

  it('maps selector type to identifier mode', () => {
    assert.equal(resolveFilterMode({ key: 'bp', type: 'selector' }), 'identifier');
  });

  it('defaults to text for unknown type', () => {
    assert.equal(resolveFilterMode({ key: 'field', type: 'custom' }), 'text');
  });

  it('returns text when col is null', () => {
    assert.equal(resolveFilterMode(null), 'text');
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria', () => {
  const columns = [
    { key: 'documentStatus', column: 'DocStatus', type: 'status' },
    { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'percent' },
    { key: 'businessPartner', column: 'C_BPartner_ID', type: 'selector' },
    { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  ];

  it('returns null when advancedFilter is null', () => {
    assert.equal(buildAdvancedFilterCriteria(null, columns), null);
  });

  it('returns null when conditions array is empty', () => {
    assert.equal(buildAdvancedFilterCriteria({ rowOperator: 'and', conditions: [] }, columns), null);
  });

  it('returns null when tableColumns is empty (no column definitions resolved)', () => {
    const filter = { rowOperator: 'and', conditions: [{ field: 'documentStatus', operator: 'equals', value: 'CO' }] };
    assert.equal(buildAdvancedFilterCriteria(filter, []), null);
  });

  it('serializes equals condition on status column', () => {
    const filter = { rowOperator: 'and', conditions: [{ field: 'documentStatus', operator: 'equals', value: 'CO' }] };
    assert.deepEqual(buildAdvancedFilterCriteria(filter, columns), [
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
    ]);
  });

  it('serializes lessThan condition on percent column as numeric', () => {
    const filter = { rowOperator: 'and', conditions: [{ field: 'deliveryStatusPurchase', operator: 'lessThan', value: 100 }] };
    assert.deepEqual(buildAdvancedFilterCriteria(filter, columns), [
      { fieldName: 'deliveryStatusPurchase', operator: 'lessThan', value: 100 },
    ]);
  });

  it('uses notEqual operator (no trailing s) for negation on status column', () => {
    const filter = { rowOperator: 'and', conditions: [{ field: 'documentStatus', operator: 'notEqual', value: 'DR' }] };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'documentStatus', operator: 'notEqual', value: 'DR' }]);
  });

  it('combines two AND conditions into a flat array (pendingDelivery filter shape)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'deliveryStatusPurchase', operator: 'lessThan', value: 100 },
      ],
    };
    assert.deepEqual(buildAdvancedFilterCriteria(filter, columns), [
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
      { fieldName: 'deliveryStatusPurchase', operator: 'lessThan', value: 100 },
    ]);
  });

  it('wraps OR conditions in an AdvancedCriteria envelope', () => {
    const filter = {
      rowOperator: 'or',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'documentStatus', operator: 'equals', value: 'DR' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.equal(result.length, 1);
    assert.equal(result[0]._constructor, 'AdvancedCriteria');
    assert.equal(result[0].operator, 'or');
    assert.equal(result[0].criteria.length, 2);
  });

  it('skips conditions whose field key is not in columns', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'documentStatus', operator: 'equals', value: 'CO' },
        { field: 'unknownField', operator: 'equals', value: 'X' },
      ],
    };
    assert.deepEqual(buildAdvancedFilterCriteria(filter, columns), [
      { fieldName: 'documentStatus', operator: 'equals', value: 'CO' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria — buildCriteria hook
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — buildCriteria hook (ETP-3660)', () => {
  // The __contactType virtual column uses buildCriteria to map enum values
  // to real backend boolean fields. Test that buildAdvancedFilterCriteria
  // calls col.buildCriteria(row) and uses its result instead of the default logic.

  const virtualCol = {
    key: '__contactType',
    type: 'enum',
    filterable: true,
    buildCriteria: (condition) => {
      const { operator, value } = condition;
      if (operator === 'equals') {
        if (value === 'customer') return [{ fieldName: 'customer', operator: 'equals', value: true }];
        if (value === 'vendor')   return [{ fieldName: 'vendor',   operator: 'equals', value: true }];
      }
      if (operator === 'notEqual') {
        if (value === 'customer') return [{ fieldName: 'customer', operator: 'equals', value: false }];
        if (value === 'vendor')   return [{ fieldName: 'vendor',   operator: 'equals', value: false }];
      }
      return null;
    },
  };

  it('operator=equals, value=customer → customer=true', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: '__contactType', operator: 'equals', value: 'customer' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol]);
    assert.deepEqual(result, [{ fieldName: 'customer', operator: 'equals', value: true }]);
  });

  it('operator=equals, value=vendor → vendor=true', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: '__contactType', operator: 'equals', value: 'vendor' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol]);
    assert.deepEqual(result, [{ fieldName: 'vendor', operator: 'equals', value: true }]);
  });

  it('operator=notEqual, value=customer → customer=false', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: '__contactType', operator: 'notEqual', value: 'customer' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol]);
    assert.deepEqual(result, [{ fieldName: 'customer', operator: 'equals', value: false }]);
  });

  it('operator=notEqual, value=vendor → vendor=false', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: '__contactType', operator: 'notEqual', value: 'vendor' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol]);
    assert.deepEqual(result, [{ fieldName: 'vendor', operator: 'equals', value: false }]);
  });

  it('buildCriteria returning null causes the condition to be skipped', () => {
    // operator 'iContains' is not handled by the virtual col's buildCriteria → returns null
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: '__contactType', operator: 'iContains', value: 'cust' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol]);
    // All conditions skipped → null
    assert.equal(result, null);
  });

  it('buildCriteria is preferred over default logic for string-type columns with buildCriteria', () => {
    // A column declared as type='string' but with buildCriteria should still use buildCriteria
    const customStringCol = {
      key: 'myField',
      type: 'string',
      buildCriteria: () => [{ fieldName: 'overridden', operator: 'equals', value: 'custom' }],
    };
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'myField', operator: 'iContains', value: 'anything' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [customStringCol]);
    // Default string logic would produce iContains on 'myField'; buildCriteria overrides it
    assert.deepEqual(result, [{ fieldName: 'overridden', operator: 'equals', value: 'custom' }]);
  });

  it('mixes virtual col result with a regular column in the same AND filter', () => {
    const regularCol = { key: 'documentNo', type: 'string' };
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: '__contactType', operator: 'equals', value: 'customer' },
        { field: 'documentNo', operator: 'iContains', value: 'ORD' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, [virtualCol, regularCol]);
    assert.deepEqual(result, [
      { fieldName: 'customer', operator: 'equals', value: true },
      { fieldName: 'documentNo', operator: 'iContains', value: 'ORD' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: parseDateString — yyyy/mm/dd branch (lines 68-73)
// ---------------------------------------------------------------------------

describe('parseUserFilter — parseDateString yyyy/mm/dd (slash/dot) branch', () => {
  const col = { key: 'orderDate', type: 'date', filterMode: 'date' };

  it('parses yyyy/mm/dd format', () => {
    const result = parseUserFilter(col, '2026/04/14');
    assert.deepEqual(result, { mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026/04/14' });
  });

  it('parses yyyy.mm.dd format', () => {
    const result = parseUserFilter(col, '2026.04.14');
    assert.deepEqual(result, { mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026.04.14' });
  });

  it('pads single-digit month and day in yyyy/mm/dd', () => {
    const result = parseUserFilter(col, '2026/1/5');
    assert.deepEqual(result, { mode: 'date', op: '=', value: '2026-01-05', originalValue: '2026/1/5' });
  });

  it('returns null for three-part date where no part > 999 (e.g. 12/04/99)', () => {
    assert.equal(parseUserFilter(col, '12/04/99'), null);
  });

  it('returns null for three-part date with NaN parts', () => {
    assert.equal(parseUserFilter(col, 'ab/cd/ef'), null);
  });
});

// ---------------------------------------------------------------------------
// Coverage: parseEnumLabelFilter — direct code match (line 227-228)
// ---------------------------------------------------------------------------

describe('parseUserFilter — enumLabel direct code match', () => {
  const col = {
    key: 'documentStatus',
    type: 'status',
    filterMode: 'enumLabel',
    enumLabels: { DR: 'Draft', CO: 'Completed', IP: 'In Process' },
  };

  it('returns direct code match when input is an exact raw key', () => {
    const result = parseUserFilter(col, 'DR');
    assert.deepEqual(result, { mode: 'enumLabel', value: ['DR'], originalValue: 'DR' });
  });

  it('returns direct code match for CO', () => {
    const result = parseUserFilter(col, 'CO');
    assert.deepEqual(result, { mode: 'enumLabel', value: ['CO'], originalValue: 'CO' });
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — isNull / isNotNull (lines 461-462, 504-506)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — isNull / isNotNull', () => {
  const columns = [
    { key: 'name', type: 'string' },
    { key: 'businessPartner', type: 'selector' },
  ];

  it('generates isNull criterion', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNull', value: null }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'isNull' }]);
  });

  it('generates notNull criterion for isNotNull', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNotNull', value: null }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'notNull' }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — between (lines 467-478)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — between operator', () => {
  const columns = [
    { key: 'grandTotal', type: 'amount' },
    { key: 'orderDate', type: 'date' },
    { key: 'name', type: 'string' },
  ];

  it('produces greaterOrEqual + lessOrEqual for numeric between', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['100', '500'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'grandTotal', operator: 'greaterOrEqual', value: 100 },
      { fieldName: 'grandTotal', operator: 'lessOrEqual', value: 500 },
    ]);
  });

  it('produces greaterOrEqual + lessOrEqual for date between (no numeric coercion)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'orderDate', operator: 'between', value: ['2026-01-01', '2026-12-31'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-01-01' },
      { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-12-31' },
    ]);
  });

  it('returns null for between with non-array value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: '100' }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for between with empty from', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['', '500'] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for between with null from', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: [null, '500'] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for between with null to', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['100', null] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for between with empty to', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['100', ''] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null when numeric coercion fails on from', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['abc', '500'] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null when numeric coercion fails on to', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: ['100', 'xyz'] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('handles between with number values directly', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'grandTotal', operator: 'between', value: [10, 50] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'grandTotal', operator: 'greaterOrEqual', value: 10 },
      { fieldName: 'grandTotal', operator: 'lessOrEqual', value: 50 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — inSet (lines 481-483, 508-520)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — inSet operator', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('produces inSet criterion for array with multiple values', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: ['a', 'b', 'c'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'inSet', value: 'a,b,c' }]);
  });

  it('produces equals criterion for array with single value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: ['only'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'equals', value: 'only' }]);
  });

  it('returns null for inSet with empty array', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('handles inSet with string value (comma-separated)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: 'a, b, c' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'inSet', value: 'a,b,c' }]);
  });

  it('handles inSet with single string value (no comma)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: 'solo' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'equals', value: 'solo' }]);
  });

  it('filters out null and empty values from inSet array', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [null, '', 'valid'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'equals', value: 'valid' }]);
  });

  it('returns null for inSet array with only null/empty values', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [null, '', undefined] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — multi-value array OR (lines 487-488, 522-535)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — multi-value array OR composition', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('wraps multiple values in AdvancedCriteria OR', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: ['x', 'y'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.equal(result.length, 1);
    assert.equal(result[0]._constructor, 'AdvancedCriteria');
    assert.equal(result[0].operator, 'or');
    assert.equal(result[0].criteria.length, 2);
    assert.deepEqual(result[0].criteria[0], { fieldName: 'name', operator: 'equals', value: 'x' });
    assert.deepEqual(result[0].criteria[1], { fieldName: 'name', operator: 'equals', value: 'y' });
  });

  it('produces single criterion for array with one value (no OR wrap)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: ['only'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'equals', value: 'only' }]);
  });

  it('returns null for array with only empty/null values', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: ['', null] }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — numeric mode in buildRowCriteria (lines 492-498)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — numeric mode (buildRowCriteria)', () => {
  const columns = [{ key: 'qty', type: 'number' }];

  it('coerces string value to number for numeric column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'greaterThan', value: '42.5' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'qty', operator: 'greaterThan', value: 42.5 }]);
  });

  it('handles actual number value for numeric column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'equals', value: 100 }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'qty', operator: 'equals', value: 100 }]);
  });

  it('returns null for non-numeric string value in numeric column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'equals', value: 'abc' }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('coerces comma-formatted string to number', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'equals', value: '1,234' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'qty', operator: 'equals', value: 1234 }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — booleanLabel mode (line 497-499)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — booleanLabel mode (buildRowCriteria)', () => {
  const columns = [{ key: 'active', type: 'boolean' }];

  it('maps string "true" to boolean true', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'active', operator: 'equals', value: 'true' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'active', operator: 'equals', value: true }]);
  });

  it('maps boolean true to true', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'active', operator: 'equals', value: true }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'active', operator: 'equals', value: true }]);
  });

  it('maps false to false', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'active', operator: 'equals', value: false }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'active', operator: 'equals', value: false }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — empty/null/undefined value (line 490)
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — empty/null/undefined value edge cases', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('returns null for empty string value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: '' }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for null value with non-null operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: null }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null for undefined value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: undefined }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });

  it('returns null when operator is missing', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: null, value: 'x' }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, columns), null);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — identifier column textual vs discrete ops
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — identifier column ops', () => {
  const columns = [{ key: 'businessPartner', type: 'selector' }];

  it('uses $_identifier for iContains on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'iContains', value: 'acme' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner$_identifier', operator: 'iContains', value: 'acme' },
    ]);
  });

  it('uses $_identifier for iNotContains on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'iNotContains', value: 'acme' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner$_identifier', operator: 'iNotContains', value: 'acme' },
    ]);
  });

  it('uses $_identifier for iEquals on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'iEquals', value: 'Acme Corp' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner$_identifier', operator: 'iEquals', value: 'Acme Corp' },
    ]);
  });

  it('uses $_identifier for iNotEqual on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'iNotEqual', value: 'Acme' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner$_identifier', operator: 'iNotEqual', value: 'Acme' },
    ]);
  });

  it('uses raw key for equals (discrete op) on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'equals', value: 'uuid-1' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner', operator: 'equals', value: 'uuid-1' },
    ]);
  });

  it('uses raw key for notEqual (discrete op) on selector column', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'businessPartner', operator: 'notEqual', value: 'uuid-1' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [
      { fieldName: 'businessPartner', operator: 'notEqual', value: 'uuid-1' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — buildCriteria returning null
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — buildCriteria hook coverage', () => {
  it('skips condition when buildCriteria returns null', () => {
    const col = { key: 'virtual', type: 'string', buildCriteria: () => null };
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'virtual', operator: 'equals', value: 'test' }],
    };
    assert.equal(buildAdvancedFilterCriteria(filter, [col]), null);
  });

  it('uses buildCriteria result instead of default logic', () => {
    const col = {
      key: 'custom',
      type: 'string',
      buildCriteria: (row) => [{ fieldName: 'overridden', operator: 'equals', value: row.value }],
    };
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'custom', operator: 'iContains', value: 'anything' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [col]);
    assert.deepEqual(result, [{ fieldName: 'overridden', operator: 'equals', value: 'anything' }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — OR with single criterion
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — OR single criterion', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('does not wrap OR when only one criterion exists', () => {
    const filter = {
      rowOperator: 'or',
      conditions: [{ field: 'name', operator: 'iContains', value: 'single' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    assert.deepEqual(result, [{ fieldName: 'name', operator: 'iContains', value: 'single' }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — invalid columns parameter
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — invalid columns', () => {
  it('returns null when columns is null', () => {
    const filter = { conditions: [{ field: 'x', operator: 'equals', value: 'y' }] };
    assert.equal(buildAdvancedFilterCriteria(filter, null), null);
  });

  it('returns null when columns is not an array', () => {
    const filter = { conditions: [{ field: 'x', operator: 'equals', value: 'y' }] };
    assert.equal(buildAdvancedFilterCriteria(filter, 'not-array'), null);
  });
});

// ---------------------------------------------------------------------------
// Coverage: getFilteredKey (lines 543-548)
// ---------------------------------------------------------------------------

describe('getFilteredKey', () => {
  it('returns backendFilterKey when provided', () => {
    const col = { key: 'bp', backendFilterKey: 'bp$name' };
    assert.equal(getFilteredKey(col, 'identifier', 'iContains'), 'bp$name');
  });

  it('returns $_identifier for identifier mode with iContains', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'iContains'), 'bp$_identifier');
  });

  it('returns $_identifier for identifier mode with iNotContains', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'iNotContains'), 'bp$_identifier');
  });

  it('returns $_identifier for identifier mode with iEquals', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'iEquals'), 'bp$_identifier');
  });

  it('returns $_identifier for identifier mode with iNotEqual', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'iNotEqual'), 'bp$_identifier');
  });

  it('returns raw key for identifier mode with discrete op equals', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'equals'), 'bp');
  });

  it('returns raw key for identifier mode with discrete op notEqual', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'notEqual'), 'bp');
  });

  it('returns raw key for identifier mode with inSet op', () => {
    assert.equal(getFilteredKey({ key: 'bp' }, 'identifier', 'inSet'), 'bp');
  });

  it('returns raw key for non-identifier modes', () => {
    assert.equal(getFilteredKey({ key: 'name' }, 'text', 'iContains'), 'name');
    assert.equal(getFilteredKey({ key: 'n' }, 'numeric', 'equals'), 'n');
    assert.equal(getFilteredKey({ key: 'd' }, 'date', 'greaterThan'), 'd');
  });
});
