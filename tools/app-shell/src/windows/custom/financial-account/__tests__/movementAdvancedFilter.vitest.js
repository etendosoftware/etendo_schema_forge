import { describe, it, expect } from 'vitest';
import {
  movementStatusLabelKey,
  buildMovementFilterColumns,
  applyAdvancedFilter,
} from '../movementAdvancedFilter';
import { MOVEMENT_STATUS_CONFIG } from '../movementStatusConfig';

// Pure-logic tests for the Movements tab "by conditions" advanced filter.
// matchesCondition / OPERATORS are tested through the public applyAdvancedFilter.

const ROWS = [
  {
    id: 'a',
    documentNo: 'DOC-001',
    contact: 'ACME Corp',
    description: 'office supplies',
    glItem: 'EXPENSES',
    amount: 100,
    balance: 1000,
    date: '2026-05-10',
    trxType: 'BPD',
    paymentStatus: 'RPR', // non-cleared → financeAccountMovementsStatusUnreconciled
  },
  {
    id: 'b',
    documentNo: 'DOC-002',
    contact: 'Globex',
    description: 'consulting',
    glItem: '',
    amount: 250,
    balance: 1250,
    date: '2026-06-20',
    trxType: 'BPW',
    paymentStatus: 'RPPC', // cleared → financeAccountMovementsStatusReconciled
  },
];

const ids = (rows) => rows.map((r) => r.id);

// Helper that wraps a single condition into a filter object.
const one = (field, operator, value, rowOperator = 'and') => ({
  rowOperator,
  conditions: [{ field, operator, value }],
});

describe('movementStatusLabelKey', () => {
  it('maps a known payment status code to its label key', () => {
    expect(movementStatusLabelKey('RPPC')).toBe('financeAccountMovementsStatusReconciled');
    expect(movementStatusLabelKey('RPR')).toBe('financeAccountMovementsStatusUnreconciled');
  });

  it('returns null for an unknown code', () => {
    expect(movementStatusLabelKey('NOPE')).toBeNull();
    expect(movementStatusLabelKey(undefined)).toBeNull();
  });
});

describe('applyAdvancedFilter — pass-through / incomplete filters', () => {
  it('returns input unchanged for a null filter', () => {
    expect(applyAdvancedFilter(ROWS, null)).toBe(ROWS);
  });

  it('returns input unchanged for an empty conditions array', () => {
    expect(applyAdvancedFilter(ROWS, { conditions: [] })).toBe(ROWS);
  });

  it('returns input unchanged when every condition is missing field or operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { operator: 'iEquals', value: 'x' }, // no field
        { field: 'contact', value: 'x' }, // no operator
      ],
    };
    expect(applyAdvancedFilter(ROWS, filter)).toBe(ROWS);
  });

  it('ignores incomplete conditions but still applies the complete ones', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'contact' }, // incomplete → dropped
        { field: 'documentNo', operator: 'iEquals', value: 'DOC-001' },
      ],
    };
    expect(ids(applyAdvancedFilter(ROWS, filter))).toEqual(['a']);
  });
});

describe('applyAdvancedFilter — rowOperator and/or', () => {
  it("'and' requires every condition to match", () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'trxType', operator: 'iEquals', value: 'BPD' },
        { field: 'contact', operator: 'iContains', value: 'acme' },
      ],
    };
    expect(ids(applyAdvancedFilter(ROWS, filter))).toEqual(['a']);
  });

  it("'or' requires at least one condition to match", () => {
    const filter = {
      rowOperator: 'or',
      conditions: [
        { field: 'documentNo', operator: 'iEquals', value: 'DOC-001' },
        { field: 'documentNo', operator: 'iEquals', value: 'DOC-002' },
      ],
    };
    expect(ids(applyAdvancedFilter(ROWS, filter))).toEqual(['a', 'b']);
  });
});

describe('applyAdvancedFilter — string operators', () => {
  it('iContains (case-insensitive)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('contact', 'iContains', 'acme')))).toEqual(['a']);
    expect(applyAdvancedFilter(ROWS, one('contact', 'iContains', 'zzz'))).toEqual([]);
  });

  it('iNotContains', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('contact', 'iNotContains', 'acme')))).toEqual(['b']);
    expect(ids(applyAdvancedFilter(ROWS, one('contact', 'iNotContains', 'zzz')))).toEqual(['a', 'b']);
  });

  it('iEquals (case-insensitive)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('documentNo', 'iEquals', 'doc-001')))).toEqual(['a']);
    expect(applyAdvancedFilter(ROWS, one('documentNo', 'iEquals', 'doc-999'))).toEqual([]);
  });

  it('iNotEqual', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('documentNo', 'iNotEqual', 'DOC-001')))).toEqual(['b']);
  });

  it('isNull (null or empty string)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('glItem', 'isNull')))).toEqual(['b']);
  });

  it('isNotNull', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('glItem', 'isNotNull')))).toEqual(['a']);
  });

  it('equals — scalar form', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'equals', 'BPD')))).toEqual(['a']);
    expect(applyAdvancedFilter(ROWS, one('trxType', 'equals', 'BFX'))).toEqual([]);
  });

  it('equals — array form (value in list)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'equals', ['BPD', 'BPW'])))).toEqual(['a', 'b']);
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'equals', ['BPW'])))).toEqual(['b']);
  });

  it('notEqual', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'notEqual', 'BPD')))).toEqual(['b']);
  });

  it('inSet — array value', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'inSet', ['BPW', 'BF'])))).toEqual(['b']);
  });

  it('inSet — comma-separated string value (trimmed)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'inSet', 'BPD, BPW')))).toEqual(['a', 'b']);
    expect(ids(applyAdvancedFilter(ROWS, one('trxType', 'inSet', ' BPW ')))).toEqual(['b']);
  });
});

describe('applyAdvancedFilter — numeric operators', () => {
  it('greaterThan', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'greaterThan', 100)))).toEqual(['b']);
  });

  it('greaterOrEqual', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'greaterOrEqual', 100)))).toEqual(['a', 'b']);
  });

  it('lessThan', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'lessThan', 250)))).toEqual(['a']);
  });

  it('lessOrEqual', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'lessOrEqual', 250)))).toEqual(['a', 'b']);
  });

  it('does not match when a numeric side is non-numeric (numCmp guard)', () => {
    expect(applyAdvancedFilter(ROWS, one('amount', 'greaterThan', 'abc'))).toEqual([]);
    const nonNumeric = [{ id: 'x', amount: 'NaN' }];
    expect(applyAdvancedFilter(nonNumeric, one('amount', 'greaterThan', 0))).toEqual([]);
  });
});

describe('applyAdvancedFilter — between', () => {
  it('between on a numeric field (inclusive)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'between', [100, 200])))).toEqual(['a']);
    expect(ids(applyAdvancedFilter(ROWS, one('amount', 'between', [0, 1000])))).toEqual(['a', 'b']);
  });

  it('between on the date field (uses Date.parse)', () => {
    expect(ids(applyAdvancedFilter(ROWS, one('date', 'between', ['2026-05-01', '2026-05-31'])))).toEqual(['a']);
    expect(ids(applyAdvancedFilter(ROWS, one('date', 'between', ['2026-01-01', '2026-12-31'])))).toEqual(['a', 'b']);
  });
});

describe('applyAdvancedFilter — unknown operator', () => {
  it('keeps the row when the operator is unknown (returns true)', () => {
    expect(applyAdvancedFilter(ROWS, one('amount', 'mysteryOp', 5))).toEqual(ROWS);
  });
});

describe('applyAdvancedFilter — statusFamily derivation', () => {
  it('matches against the label key derived from paymentStatus', () => {
    const unreconciledKey = MOVEMENT_STATUS_CONFIG.RPR.labelKey;
    const result = applyAdvancedFilter(ROWS, one('statusFamily', 'iEquals', unreconciledKey));
    expect(ids(result)).toEqual(['a']);
  });

  it('matches the reconciled family via its label key', () => {
    const reconciledKey = MOVEMENT_STATUS_CONFIG.RPPC.labelKey;
    expect(ids(applyAdvancedFilter(ROWS, one('statusFamily', 'equals', reconciledKey)))).toEqual(['b']);
  });
});

describe('buildMovementFilterColumns', () => {
  const ui = (k) => k;
  const cols = buildMovementFilterColumns(ui);

  it('returns 9 columns with the expected keys and types', () => {
    expect(cols).toHaveLength(9);
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c.type]));
    expect(byKey).toEqual({
      date: 'date',
      documentNo: 'string',
      contact: 'selector',
      description: 'string',
      statusFamily: 'enum',
      trxType: 'enum',
      glItem: 'string',
      amount: 'number',
      balance: 'number',
    });
  });

  it('statusFamily column is an enum with one deduped entry per status family', () => {
    const statusCol = cols.find((c) => c.key === 'statusFamily');
    expect(statusCol.type).toBe('enum');

    const expectedFamilies = new Set(
      Object.values(MOVEMENT_STATUS_CONFIG).map((cfg) => cfg.labelKey),
    );
    expect(Object.keys(statusCol.enumLabels).sort()).toEqual([...expectedFamilies].sort());
    // ui(k) returns the key itself, so values equal their keys.
    for (const [k, v] of Object.entries(statusCol.enumLabels)) {
      expect(v).toBe(k);
    }
  });
});
