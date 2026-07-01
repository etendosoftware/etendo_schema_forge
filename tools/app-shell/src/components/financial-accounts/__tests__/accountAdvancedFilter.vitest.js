import { describe, it, expect } from 'vitest';
import {
  buildAccountFilterColumns,
  applyAccountAdvancedFilter,
} from '../accountAdvancedFilter.js';

const ui = (key) => key; // identity translator

const ACCOUNTS = [
  { id: 'a1', name: 'Cuenta de Banco', type: 'B', currentBalance: 83.7, pendingCount: 52 },
  { id: 'a2', name: 'Caja', type: 'C', currentBalance: -226538.85, pendingCount: 0 },
  { id: 'a3', name: 'Tarjeta de prueba', type: 'CA', currentBalance: 0, pendingCount: 0 },
];

const filter = (conditions, rowOperator = 'and') => ({ rowOperator, conditions });

describe('buildAccountFilterColumns', () => {
  it('exposes name (string), type (enum), balance and pending (number) columns', () => {
    const byKey = Object.fromEntries(buildAccountFilterColumns(ui).map((c) => [c.key, c]));
    expect(byKey.name.type).toBe('string');
    expect(byKey.type.type).toBe('enum');
    expect(byKey.currentBalance.type).toBe('number');
    expect(byKey.pendingCount.type).toBe('number');
    // The type enum maps the account-type codes to (translated) labels.
    expect(Object.keys(byKey.type.enumLabels)).toEqual(['B', 'C', 'CA']);
  });
});

describe('applyAccountAdvancedFilter', () => {
  it('returns the input unchanged for a null/empty filter', () => {
    expect(applyAccountAdvancedFilter(ACCOUNTS, null)).toBe(ACCOUNTS);
    expect(applyAccountAdvancedFilter(ACCOUNTS, filter([]))).toBe(ACCOUNTS);
  });

  it('filters by type (enum equals)', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([{ field: 'type', operator: 'equals', value: 'B' }]));
    expect(out.map((a) => a.id)).toEqual(['a1']);
  });

  it('filters by balance (greaterThan)', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([{ field: 'currentBalance', operator: 'greaterThan', value: 0 }]));
    expect(out.map((a) => a.id)).toEqual(['a1']);
  });

  it('filters by pendingCount (greaterThan)', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([{ field: 'pendingCount', operator: 'greaterThan', value: 0 }]));
    expect(out.map((a) => a.id)).toEqual(['a1']);
  });

  it('filters by name (case-insensitive contains)', () => {
    const out = applyAccountAdvancedFilter(ACCOUNTS, filter([{ field: 'name', operator: 'iContains', value: 'caja' }]));
    expect(out.map((a) => a.id)).toEqual(['a2']);
  });
});
