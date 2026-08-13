import { describe, it, expect } from 'vitest';
import {
  buildStatementFilterColumns,
  applyAdvancedFilter,
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
