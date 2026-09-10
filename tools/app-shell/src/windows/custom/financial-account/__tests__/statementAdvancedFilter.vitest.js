import { describe, it, expect } from 'vitest';
import {
  buildStatementFilterColumns,
  applyAdvancedFilter,
  STATEMENT_FILTER_COLUMNS,
} from '../statementAdvancedFilter';

const ui = (key) => key; // identity translator

const STATEMENTS = [
  { id: 's1', documentNo: '1000025', name: 'Test borrador', fileName: 'mayo.csv', notes: 'urgente', importDate: '2026-06-07T00:00:00Z', transactionDate: '2026-06-07T00:00:00Z', lineCount: 1, totalIn: 500, totalOut: 0, totalAmount: 500, status: 'DRAFT' },
  { id: 's2', documentNo: '1000024', name: 'Test', fileName: '', notes: '', importDate: '2026-06-04T00:00:00Z', transactionDate: '2026-06-04T00:00:00Z', lineCount: 2, totalIn: 25, totalOut: 100, totalAmount: 125, status: 'PENDING' },
  { id: 's3', documentNo: '1000019', name: 'extracto-prueba', fileName: 'extracto-prueba.csv', notes: 'revisar', importDate: '2026-06-01T00:00:00Z', transactionDate: '2026-06-01T00:00:00Z', lineCount: 10, totalIn: 14064.05, totalOut: 3200, totalAmount: 17264.05, status: 'RECONCILED' },
];

const filter = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });

describe('buildStatementFilterColumns', () => {
  it('exposes the statement columns including fileName, notes and an enum status', () => {
    const cols = buildStatementFilterColumns(ui);
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]));
    expect(byKey.fileName).toBeTruthy();
    expect(byKey.notes).toBeTruthy();
    expect(byKey.status.type).toBe('enum');
    // The enum maps status codes → (translated) labels.
    expect(Object.keys(byKey.status.enumLabels)).toEqual(
      ['DRAFT', 'PENDING', 'PARTIAL', 'RECONCILED'],
    );
  });

  it('types the numeric and date columns correctly', () => {
    const byKey = Object.fromEntries(buildStatementFilterColumns(ui).map((c) => [c.key, c]));
    expect(byKey.importDate.type).toBe('date');
    expect(byKey.lineCount.type).toBe('number');
    // The list shows Salida/Entrada (out/in), so those are the filterable
    // amount columns — the old single totalAmount column is gone.
    expect(byKey.totalAmount).toBeUndefined();
    expect(byKey.totalOut.type).toBe('number');
    expect(byKey.totalIn.type).toBe('number');
  });
});

describe('applyAdvancedFilter', () => {
  it('returns the input unchanged for a null/empty filter', () => {
    expect(applyAdvancedFilter(STATEMENTS, null)).toBe(STATEMENTS);
    expect(applyAdvancedFilter(STATEMENTS, filter([]))).toBe(STATEMENTS);
  });

  it('filters by status (enum equals)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'status', operator: 'equals', value: 'DRAFT' }]));
    expect(out.map((s) => s.id)).toEqual(['s1']);
  });

  it('filters by name (case-insensitive contains)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'name', operator: 'iContains', value: 'test' }]));
    expect(out.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('filters by notes (isNotNull drops blank notes)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'notes', operator: 'isNotNull', value: null }]));
    expect(out.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('filters by lineCount (greaterThan)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'lineCount', operator: 'greaterThan', value: 1 }]));
    expect(out.map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('filters by totalOut (greaterThan)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'totalOut', operator: 'greaterThan', value: 50 }]));
    expect(out.map((s) => s.id)).toEqual(['s2', 's3']);
  });

  it('filters by totalIn (greaterThan)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'totalIn', operator: 'greaterThan', value: 100 }]));
    expect(out.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('filters by importDate (between)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{
      field: 'importDate', operator: 'between', value: ['2026-06-03', '2026-06-30'],
    }]));
    expect(out.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('combines conditions with AND', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([
      { field: 'name', operator: 'iContains', value: 'test' },
      { field: 'status', operator: 'equals', value: 'PENDING' },
    ]));
    expect(out.map((s) => s.id)).toEqual(['s2']);
  });

  it('combines conditions with OR', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([
      { field: 'status', operator: 'equals', value: 'DRAFT' },
      { field: 'status', operator: 'equals', value: 'RECONCILED' },
    ], 'or'));
    expect(out.map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('ignores incomplete conditions (missing operator)', () => {
    const out = applyAdvancedFilter(STATEMENTS, filter([{ field: 'name', value: 'x' }]));
    expect(out).toBe(STATEMENTS);
  });
});

// ---------------------------------------------------------------------------
// ETP-4956 — filters returned wrong results on the "Extractos importados" tab.
//
// Fixtures mirror the reported rows: an absent Salida/Entrada arrives as a
// stored 0 (the grid renders it as "—"), and the dates carry a fake
// UTC-midnight time part on some rows and none on others.
// ---------------------------------------------------------------------------

const REPORTED = [
  { id: '1000072', documentNo: '1000072', name: 'Extracto septiembre', fileName: 'sept.csv', notes: '', importDate: '2026-09-01', transactionDate: '2026-09-01T00:00:00Z', lineCount: 8, totalOut: 2319.05, totalIn: 12081.05, status: 'DRAFT' },
  { id: '1000029', documentNo: '1000029', name: 'Extracto agosto', fileName: 'ago.csv', notes: 'revisar', importDate: '2026-08-10', transactionDate: '2026-08-10T00:00:00Z', lineCount: 1, totalOut: 0, totalIn: 14, status: 'RECONCILED' },
  { id: '1000025', documentNo: '1000025', name: 'Extracto julio', fileName: 'jul.csv', notes: '', importDate: '2026-08-06', transactionDate: '2026-08-06T00:00:00Z', lineCount: 0, totalOut: 50, totalIn: 0, status: 'RECONCILED' },
];

const idsOf = (rows) => rows.map((s) => s.id);
const cond = (field, operator, value) => filter([{ field, operator, value }]);

describe('STATEMENT_FILTER_COLUMNS — evaluator metadata', () => {
  it('declares the types the evaluator dispatches on', () => {
    expect(STATEMENT_FILTER_COLUMNS.importDate.type).toBe('date');
    expect(STATEMENT_FILTER_COLUMNS.transactionDate.type).toBe('date');
    expect(STATEMENT_FILTER_COLUMNS.lineCount.type).toBe('number');
    expect(STATEMENT_FILTER_COLUMNS.totalOut.type).toBe('number');
    expect(STATEMENT_FILTER_COLUMNS.totalIn.type).toBe('number');
    expect(STATEMENT_FILTER_COLUMNS.status.type).toBe('enum');
  });

  it('flags emptyWhenZero on totalOut and totalIn ONLY', () => {
    // lineCount is deliberately excluded: an extract with 0 lines is a real
    // value the grid prints as "0", not as "—".
    const flagged = Object.entries(STATEMENT_FILTER_COLUMNS)
      .filter(([, meta]) => meta.emptyWhenZero)
      .map(([key]) => key)
      .sort();
    expect(flagged).toEqual(['totalIn', 'totalOut']);
  });

  it('covers exactly the same keys the builder columns expose', () => {
    const builderKeys = buildStatementFilterColumns(ui).map((c) => c.key);
    expect(Object.keys(STATEMENT_FILTER_COLUMNS).sort()).toEqual([...builderKeys].sort());
  });

  it('is derivable without a translator (no ui() call needed)', () => {
    for (const meta of Object.values(STATEMENT_FILTER_COLUMNS)) {
      expect(meta).not.toHaveProperty('label');
      expect(typeof meta.type).toBe('string');
    }
  });
});

describe('buildStatementFilterColumns — emptyWhenZero reaches the builder', () => {
  it('sets the flag on the amount columns and omits it elsewhere', () => {
    const byKey = Object.fromEntries(buildStatementFilterColumns(ui).map((c) => [c.key, c]));
    expect(byKey.totalOut.emptyWhenZero).toBe(true);
    expect(byKey.totalIn.emptyWhenZero).toBe(true);
    expect(byKey.lineCount).not.toHaveProperty('emptyWhenZero');
    expect(byKey.status).not.toHaveProperty('emptyWhenZero');
  });

  it('resolves every label through the translator', () => {
    const cols = buildStatementFilterColumns((k) => `T:${k}`);
    for (const col of cols) expect(col.label).toMatch(/^T:financeAccountStatements/);
  });
});

describe('applyAdvancedFilter — ETP-4956 "Is empty" on a zero-stored amount', () => {
  it('Salida "is empty" returns exactly the rows the grid renders as "—"', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('totalOut', 'isNull')))).toEqual(['1000029']);
  });

  it('Entrada "is empty" likewise', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('totalIn', 'isNull')))).toEqual(['1000025']);
  });

  it('"is not empty" is the exact complement', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('totalOut', 'isNotNull')))).toEqual(['1000072', '1000025']);
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('totalIn', 'isNotNull')))).toEqual(['1000072', '1000029']);
  });

  it('lineCount is NOT zero-blank — 0 lines is a real value there', () => {
    expect(applyAdvancedFilter(REPORTED, cond('lineCount', 'isNull'))).toEqual([]);
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('lineCount', 'isNotNull')))).toEqual(['1000072', '1000029', '1000025']);
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('lineCount', 'equals', '0')))).toEqual(['1000025']);
  });

  it('a null amount is empty too, not only a stored 0', () => {
    const rows = [{ id: 'n', totalOut: null }, { id: 'z', totalOut: 0 }, { id: 'v', totalOut: 12.5 }];
    expect(idsOf(applyAdvancedFilter(rows, cond('totalOut', 'isNull')))).toEqual(['n', 'z']);
  });
});

describe('applyAdvancedFilter — ETP-4956 date operators', () => {
  it('importDate equals matches the picked day', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('importDate', 'equals', '2026-09-01')))).toEqual(['1000072']);
  });

  it('transactionDate equals matches despite the stored time part', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('transactionDate', 'equals', '2026-08-10')))).toEqual(['1000029']);
  });

  it('After discriminates days inside the same month', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('transactionDate', 'greaterThan', '2026-08-06'))))
      .toEqual(['1000072', '1000029']);
  });

  it('Before discriminates days inside the same month', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('importDate', 'lessThan', '2026-08-10')))).toEqual(['1000025']);
  });

  it('between is inclusive on both picked days', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('importDate', 'between', ['2026-08-06', '2026-08-10']))))
      .toEqual(['1000029', '1000025']);
  });
});

describe('applyAdvancedFilter — ETP-4956 amount and text matching', () => {
  it('equals matches the displayed amount of a longer stored value', () => {
    const rows = [{ id: 'x', totalIn: 14064.0512 }];
    expect(idsOf(applyAdvancedFilter(rows, cond('totalIn', 'equals', '14064.05')))).toEqual(['x']);
    expect(applyAdvancedFilter(rows, cond('totalIn', 'equals', '14064'))).toEqual([]);
  });

  it('a padded typed value still matches a text column', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('fileName', 'iContains', '  sept  ')))).toEqual(['1000072']);
  });

  it('status accepts an array (multi-select) as "is any of"', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('status', 'equals', ['DRAFT', 'RECONCILED']))))
      .toEqual(['1000072', '1000029', '1000025']);
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('status', 'equals', ['DRAFT'])))).toEqual(['1000072']);
  });

  it('status still accepts a comma-separated inSet string (older presets)', () => {
    expect(idsOf(applyAdvancedFilter(REPORTED, cond('status', 'inSet', 'DRAFT, RECONCILED'))))
      .toEqual(['1000072', '1000029', '1000025']);
  });

  it('notes "is empty" treats a whitespace-only note as empty', () => {
    const rows = [{ id: 'w', notes: '  ' }, { id: 'r', notes: 'revisar' }];
    expect(idsOf(applyAdvancedFilter(rows, cond('notes', 'isNull')))).toEqual(['w']);
  });
});
