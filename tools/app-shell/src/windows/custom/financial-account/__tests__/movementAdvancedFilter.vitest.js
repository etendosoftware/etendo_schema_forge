import { describe, it, expect } from 'vitest';
import {
  movementStatusLabelKey,
  buildMovementFilterColumns,
  applyAdvancedFilter,
  MOVEMENT_FILTER_COLUMNS,
  withDerivedFields,
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
      documentNo: 'selector',
      contact: 'selector',
      description: 'string',
      statusFamily: 'enum',
      trxType: 'enum',
      glItem: 'selector',
      amount: 'number',
      balance: 'number',
    });
  });

  // The type is what decides the CONTROL the builder renders, so state the
  // split in those terms: `selector` → identifier mode, whose "Is" / "Is not"
  // is a checkbox picker of the values present in the data; `string` → a plain
  // free-text input for every operator.
  it('offers a value picker for every bounded-value column', () => {
    const pickers = cols.filter((c) => c.type === 'selector').map((c) => c.key);
    // A payment document number and a GL item name cannot realistically be
    // typed out exactly by hand — both used to be `string`, which gave a bare
    // text box (ETP-4956).
    expect(pickers.sort()).toEqual(['contact', 'documentNo', 'glItem']);
  });

  it('keeps free-prose columns as free text', () => {
    const freeText = cols.filter((c) => c.type === 'string').map((c) => c.key);
    // A description is prose: a picker would list one option per row.
    expect(freeText).toEqual(['description']);
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

// ---------------------------------------------------------------------------
// ETP-4956 — filters returned wrong results on the Movimientos tab.
//
// This block uses the fixture shape the reported rows actually had: the date
// arrives as a civil date with a fake UTC-midnight time part, and the balance
// carries more decimals than the grid displays ("1.646,49 €" is 1646.4867).
// Both are what broke the pre-fix evaluator, which string-compared dates and
// string-compared amounts.
// ---------------------------------------------------------------------------

const REPORTED = [
  { id: 'a', date: '2026-09-01T00:00:00Z', documentNo: '1000041', contact: 'Ivan Abedul', description: 'transferencia', glItem: '', amount: 14.6, balance: 1661.01, paymentStatus: 'RPPC', trxType: 'BPD' },
  { id: 'b', date: '2026-08-31T00:00:00Z', documentNo: '1000040', contact: 'Ivan Abedul', description: 'pago', glItem: 'FEES', amount: -6.1341, balance: 1646.4867, paymentStatus: 'RPR', trxType: 'BPW' },
  { id: 'c', date: '2026-08-21T00:00:00Z', documentNo: '1000039', contact: '  Juan Perez ', description: 'cobro', glItem: 'SALES', amount: 100, balance: 1652.54, paymentStatus: 'RPAP', trxType: 'BPD' },
];

describe('MOVEMENT_FILTER_COLUMNS — evaluator metadata', () => {
  it('declares the types the evaluator dispatches on', () => {
    expect(MOVEMENT_FILTER_COLUMNS.date.type).toBe('date');
    expect(MOVEMENT_FILTER_COLUMNS.amount.type).toBe('number');
    expect(MOVEMENT_FILTER_COLUMNS.balance.type).toBe('number');
    expect(MOVEMENT_FILTER_COLUMNS.statusFamily.type).toBe('enum');
    expect(MOVEMENT_FILTER_COLUMNS.documentNo.type).toBe('selector');
    expect(MOVEMENT_FILTER_COLUMNS.contact.type).toBe('selector');
    expect(MOVEMENT_FILTER_COLUMNS.glItem.type).toBe('selector');
    expect(MOVEMENT_FILTER_COLUMNS.description.type).toBe('string');
  });

  it('dispatches every non-date, non-number column through the generic table', () => {
    // `resolveFilterMode` maps both `text` and `identifier` to the same generic
    // operator table, so switching a column from `string` to `selector` changes
    // the CONTROL only — never the matching semantics.
    for (const key of ['documentNo', 'contact', 'glItem', 'description', 'statusFamily', 'trxType']) {
      expect(['date', 'number']).not.toContain(MOVEMENT_FILTER_COLUMNS[key].type);
    }
  });

  it('covers exactly the same keys the builder columns expose', () => {
    const builderKeys = buildMovementFilterColumns((k) => k).map((c) => c.key);
    expect(Object.keys(MOVEMENT_FILTER_COLUMNS).sort()).toEqual([...builderKeys].sort());
  });

  it('declares no emptyWhenZero column — a movement amount of 0 is a real value', () => {
    const flagged = Object.entries(MOVEMENT_FILTER_COLUMNS)
      .filter(([, meta]) => meta.emptyWhenZero)
      .map(([key]) => key);
    expect(flagged).toEqual([]);
  });

  it('is derivable without a translator (no ui() call needed)', () => {
    // The spec is label-free precisely so this metadata can be built at module
    // load and consumed from plain modules and tests.
    for (const meta of Object.values(MOVEMENT_FILTER_COLUMNS)) {
      expect(meta).not.toHaveProperty('label');
      expect(typeof meta.type).toBe('string');
    }
  });
});

describe('buildMovementFilterColumns — labels come from the labelKey', () => {
  it('resolves every label through the translator', () => {
    const seen = [];
    const cols = buildMovementFilterColumns((k) => { seen.push(k); return `T:${k}`; });
    for (const col of cols) expect(col.label).toMatch(/^T:/);
    expect(seen).toContain('financeAccountMovementsColDate');
    expect(seen).toContain('financeAccountMovementsColBalance');
  });

  // `required` drops the "Is empty" / "Is not empty" operators in the builder.
  // Every movement resolves to a status family, so those two could only ever
  // match zero rows there — while a GL item or a description legitimately can
  // be empty and must keep them.
  it('marks statusFamily as required, and nothing else', () => {
    const required = buildMovementFilterColumns((k) => k)
      .filter((c) => c.required)
      .map((c) => c.key);
    expect(required).toEqual(['statusFamily']);
  });

  it('keeps `required` out of the evaluator metadata (it is a builder concern)', () => {
    for (const meta of Object.values(MOVEMENT_FILTER_COLUMNS)) {
      expect(meta).not.toHaveProperty('required');
    }
  });

  it('keeps the same type metadata the evaluator uses', () => {
    const cols = buildMovementFilterColumns((k) => k);
    for (const col of cols) {
      expect(col.type).toBe(MOVEMENT_FILTER_COLUMNS[col.key].type);
    }
  });
});

describe('withDerivedFields', () => {
  it('adds the statusFamily label key without touching the other fields', () => {
    const out = withDerivedFields(REPORTED[0]);
    expect(out.statusFamily).toBe('financeAccountMovementsStatusReconciled');
    expect(out.id).toBe('a');
    expect(out.balance).toBe(1661.01);
  });

  it('does not mutate the movement it projects', () => {
    const row = { ...REPORTED[1] };
    withDerivedFields(row);
    expect(row).not.toHaveProperty('statusFamily');
  });

  it('yields a null statusFamily for an unknown payment status', () => {
    expect(withDerivedFields({ paymentStatus: 'NOPE' }).statusFamily).toBeNull();
    expect(withDerivedFields({}).statusFamily).toBeNull();
  });
});

describe('applyAdvancedFilter — ETP-4956 date operators', () => {
  it('equals matches the picked calendar day despite the stored time part', () => {
    // Pre-fix: "2026-09-01T00:00:00Z" was string-compared against the picker's
    // "2026-09-01", so this returned nothing at all.
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'equals', '2026-09-01')))).toEqual(['a']);
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'equals', '2026-08-31')))).toEqual(['b']);
  });

  it('Before / After discriminate days inside the same year', () => {
    // Pre-fix both sides went through parseFloat, where
    // parseFloat('2026-08-31') === 2026 — every date collapsed to its year, so
    // Before and After returned the same (wrong) set.
    const before = ids(applyAdvancedFilter(REPORTED, one('date', 'lessThan', '2026-08-31')));
    const after = ids(applyAdvancedFilter(REPORTED, one('date', 'greaterThan', '2026-08-31')));
    expect(before).toEqual(['c']);
    expect(after).toEqual(['a']);
    expect(before.filter((id) => after.includes(id))).toEqual([]);
  });

  it('lessOrEqual / greaterOrEqual include the picked day', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'lessOrEqual', '2026-08-31')))).toEqual(['b', 'c']);
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'greaterOrEqual', '2026-08-31')))).toEqual(['a', 'b']);
  });

  it('between is inclusive on both picked days', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'between', ['2026-08-21', '2026-08-31'])))).toEqual(['b', 'c']);
  });

  it('an empty date value matches no row (nothing has been picked yet)', () => {
    expect(applyAdvancedFilter(REPORTED, one('date', 'equals', ''))).toEqual([]);
    expect(ids(applyAdvancedFilter(REPORTED, one('date', 'isNotNull')))).toEqual(['a', 'b', 'c']);
  });
});

describe('applyAdvancedFilter — ETP-4956 numeric equality', () => {
  it('matches the DISPLAYED amount against a longer stored one', () => {
    // The grid shows "1.646,49 €" for the stored 1646.4867. Typing what is on
    // screen has to match; string equality never did.
    expect(ids(applyAdvancedFilter(REPORTED, one('balance', 'equals', '1646.49')))).toEqual(['b']);
    expect(ids(applyAdvancedFilter(REPORTED, one('balance', 'equals', 1646.49)))).toEqual(['b']);
  });

  it('accepts a locale decimal comma (presets saved before normalization)', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('balance', 'equals', '1646,49')))).toEqual(['b']);
    expect(ids(applyAdvancedFilter(REPORTED, one('balance', 'equals', '1.646,49')))).toEqual(['b']);
  });

  it('does not over-match at a coarser precision than the display', () => {
    expect(applyAdvancedFilter(REPORTED, one('balance', 'equals', '1646'))).toEqual([]);
    expect(applyAdvancedFilter(REPORTED, one('balance', 'equals', '1646.5'))).toEqual([]);
  });

  it('matches a negative amount rounded to the display scale', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('amount', 'equals', '-6.13')))).toEqual(['b']);
  });

  it('keeps the ordering operators numeric', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('balance', 'greaterThan', '1650')))).toEqual(['a', 'c']);
    expect(ids(applyAdvancedFilter(REPORTED, one('amount', 'lessThan', 0)))).toEqual(['b']);
  });
});

describe('applyAdvancedFilter — ETP-4956 whitespace tolerance', () => {
  it('a padded typed value still matches', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('contact', 'iContains', '  Ivan  ')))).toEqual(['a', 'b']);
  });

  it('a padded STORED value still matches an exact search', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('contact', 'iEquals', 'Juan Perez')))).toEqual(['c']);
  });

  it('a whitespace-only stored value counts as empty', () => {
    const rows = [{ id: 'x', glItem: '   ' }, { id: 'y', glItem: 'FEES' }];
    expect(ids(applyAdvancedFilter(rows, one('glItem', 'isNull')))).toEqual(['x']);
    expect(ids(applyAdvancedFilter(rows, one('glItem', 'isNotNull')))).toEqual(['y']);
  });
});

describe('applyAdvancedFilter — ETP-4956 multi-select status', () => {
  it('equals with an array behaves as "is any of" over the derived family', () => {
    const out = applyAdvancedFilter(REPORTED, one('statusFamily', 'equals', [
      'financeAccountMovementsStatusDraft',
      'financeAccountMovementsStatusReconciled',
    ]));
    expect(ids(out).sort()).toEqual(['a', 'c']);
  });

  it('notEqual with an array excludes every selected family', () => {
    const out = applyAdvancedFilter(REPORTED, one('statusFamily', 'notEqual', [
      'financeAccountMovementsStatusDraft',
      'financeAccountMovementsStatusReconciled',
    ]));
    expect(ids(out)).toEqual(['b']);
  });

  it('an empty selection matches nothing', () => {
    expect(applyAdvancedFilter(REPORTED, one('statusFamily', 'equals', []))).toEqual([]);
  });

  it('a single-element array matches the one family', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('statusFamily', 'equals', ['financeAccountMovementsStatusUnreconciled'])))).toEqual(['b']);
  });
});

// ---------------------------------------------------------------------------
// ETP-4956 — "Cuenta contable → Es" and "Pago → Es" gave a plain text box.
//
// `documentNo` and `glItem` are now `type: 'selector'` (identifier mode), so
// "Is" / "Is not" render a checkbox picker of the values present in the data
// and emit an ARRAY of picked values, while "Contains" / "Starts with" stay
// free text. `resolveFilterMode` sends both modes to the same generic operator
// table, so this block pins that the matching semantics did not move: the array
// form must work, and the free-text operators must still work.
// ---------------------------------------------------------------------------

describe('applyAdvancedFilter — picker columns (documentNo / glItem)', () => {
  it('documentNo equals a single picked value', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'equals', ['1000040'])))).toEqual(['b']);
  });

  it('documentNo equals several picked values, as "is any of"', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'equals', ['1000040', '1000039']))))
      .toEqual(['b', 'c']);
  });

  it('glItem equals a single picked value', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['FEES'])))).toEqual(['b']);
  });

  it('glItem equals several picked values, as "is any of"', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['FEES', 'SALES']))))
      .toEqual(['b', 'c']);
  });

  it('glItem equality is case-insensitive', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['fees'])))).toEqual(['b']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['Fees', 'sales']))))
      .toEqual(['b', 'c']);
  });

  it('does not match a row whose glItem is empty', () => {
    // Row "a" has no GL item; picking any value must leave it out.
    const out = ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['FEES', 'SALES'])));
    expect(out).not.toContain('a');
  });

  it('matches nothing when the picked value is present in no row', () => {
    expect(applyAdvancedFilter(REPORTED, one('glItem', 'equals', ['NOPE']))).toEqual([]);
    expect(applyAdvancedFilter(REPORTED, one('documentNo', 'equals', ['9999999']))).toEqual([]);
  });

  it('notEqual excludes every picked value', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'notEqual', ['1000040', '1000039']))))
      .toEqual(['a']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'notEqual', ['FEES']))))
      .toEqual(['a', 'c']);
  });

  it('keeps iContains free-text matching on both columns', () => {
    // The operators the picker does NOT take over must behave exactly as they
    // did while these columns were declared `string`.
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'iContains', '10000'))))
      .toEqual(['a', 'b', 'c']);
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'iContains', '039')))).toEqual(['c']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'iContains', 'ale')))).toEqual(['c']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'iContains', 'fee')))).toEqual(['b']);
  });

  it('keeps iStartsWith free-text matching on both columns', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'iStartsWith', '100004'))))
      .toEqual(['a', 'b']);
    expect(applyAdvancedFilter(REPORTED, one('glItem', 'iStartsWith', 'ale'))).toEqual([]);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'iStartsWith', 'sa')))).toEqual(['c']);
  });

  it('keeps the scalar (non-array) form working for older presets', () => {
    // A filter preset saved before the picker landed carries a bare string.
    expect(ids(applyAdvancedFilter(REPORTED, one('documentNo', 'equals', '1000040')))).toEqual(['b']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'equals', 'SALES')))).toEqual(['c']);
  });

  it('still treats an empty glItem as empty for the null checks', () => {
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'isNull')))).toEqual(['a']);
    expect(ids(applyAdvancedFilter(REPORTED, one('glItem', 'isNotNull')))).toEqual(['b', 'c']);
  });
});
