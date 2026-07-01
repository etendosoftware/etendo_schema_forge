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
  it('returns $_identifier for selector columns', () => {
    const row = { bp: 'uuid-1', 'bp$_identifier': 'Acme Corp' };
    const col = { key: 'bp', type: 'selector' };
    expect(getDisplayText(row, col)).toBe('Acme Corp');
  });

  it('returns row[key].name as fallback for object-shaped data', () => {
    const row = { bp: { id: '1', name: 'Acme' } };
    const col = { key: 'bp', type: 'selector' };
    expect(getDisplayText(row, col)).toBe('Acme');
  });

  it('returns raw value when no identifier found', () => {
    const row = { bp: 'some-uuid' };
    const col = { key: 'bp', type: 'selector' };
    expect(getDisplayText(row, col)).toBe('some-uuid');
  });

  it('maps enum labels for status columns', () => {
    const col = { key: 'status', type: 'status', enumLabels: { DR: 'Draft', CO: 'Completed' } };
    expect(getDisplayText({ status: 'DR' }, col)).toBe('Draft');
    expect(getDisplayText({ status: 'CO' }, col)).toBe('Completed');
  });

  it('returns raw code when enum label not found', () => {
    const col = { key: 'status', type: 'status', enumLabels: { DR: 'Draft' } };
    expect(getDisplayText({ status: 'XX' }, col)).toBe('XX');
  });

  it('maps boolean badge labels (plain strings)', () => {
    const col = { key: 'active', type: 'boolean', badgeLabels: { true: 'Yes', false: 'No' } };
    expect(getDisplayText({ active: true }, col)).toBe('Yes');
    expect(getDisplayText({ active: false }, col)).toBe('No');
    expect(getDisplayText({ active: 'Y' }, col)).toBe('Yes');
  });

  it('maps boolean badge labels (multilingual objects) — picks es_ES or en_US', () => {
    const col = {
      key: 'fullyDepreciated', type: 'boolean',
      badgeLabels: {
        true: { es_ES: 'Totalmente depreciado', en_US: 'Fully deprecated' },
        false: { es_ES: 'En progreso', en_US: 'In progress' },
      },
    };
    // tryBooleanText should not return "[object Object]"
    const result = getDisplayText({ fullyDepreciated: true }, col);
    expect(result).toBe('Totalmente depreciado');
    expect(getDisplayText({ fullyDepreciated: false }, col)).toBe('En progreso');
  });

  it('returns empty string for null row or col', () => {
    expect(getDisplayText(null, { key: 'x' })).toBe('');
    expect(getDisplayText({ x: 1 }, null)).toBe('');
    expect(getDisplayText({ x: 1 }, {})).toBe('');
  });

  it('returns empty string for null values', () => {
    expect(getDisplayText({ name: null }, { key: 'name' })).toBe('');
    expect(getDisplayText({ name: undefined }, { key: 'name' })).toBe('');
  });

  it('coerces numbers to string', () => {
    expect(getDisplayText({ amount: 42 }, { key: 'amount' })).toBe('42');
  });
});

// ---------------------------------------------------------------------------
// resolveFilterMode
// ---------------------------------------------------------------------------

describe('resolveFilterMode', () => {
  it('returns text for null col', () => {
    expect(resolveFilterMode(null)).toBe('text');
  });

  it('respects explicit filterMode', () => {
    expect(resolveFilterMode({ key: 'x', filterMode: 'numeric' })).toBe('numeric');
  });

  it('infers identifier for selector type', () => {
    expect(resolveFilterMode({ key: 'bp', type: 'selector' })).toBe('identifier');
  });

  it('infers date for date type', () => {
    expect(resolveFilterMode({ key: 'd', type: 'date' })).toBe('date');
  });

  it('infers enumLabel for status type', () => {
    expect(resolveFilterMode({ key: 's', type: 'status' })).toBe('enumLabel');
  });

  it('infers booleanLabel for boolean type', () => {
    expect(resolveFilterMode({ key: 'b', type: 'boolean' })).toBe('booleanLabel');
  });

  it('infers numeric for number and amount types', () => {
    expect(resolveFilterMode({ key: 'n', type: 'number' })).toBe('numeric');
    expect(resolveFilterMode({ key: 'a', type: 'amount' })).toBe('numeric');
  });

  it('infers identifier for column names ending in _ID', () => {
    expect(resolveFilterMode({ key: 'bp', column: 'C_BPartner_ID' })).toBe('identifier');
  });

  it('defaults to text for unknown type', () => {
    expect(resolveFilterMode({ key: 'x' })).toBe('text');
    expect(resolveFilterMode({ key: 'x', type: 'string' })).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// parseUserFilter
// ---------------------------------------------------------------------------

describe('parseUserFilter', () => {
  it('returns null for empty/null input', () => {
    expect(parseUserFilter({ key: 'x' }, '')).toBeNull();
    expect(parseUserFilter({ key: 'x' }, null)).toBeNull();
    expect(parseUserFilter({ key: 'x' }, '   ')).toBeNull();
  });

  it('parses text mode', () => {
    const result = parseUserFilter({ key: 'name', type: 'string' }, 'hello');
    expect(result).toEqual({ mode: 'text', value: 'hello', originalValue: 'hello' });
  });

  it('parses date with dd/mm/yyyy', () => {
    const col = { key: 'd', type: 'date' };
    const result = parseUserFilter(col, '14/04/2026');
    expect(result).toEqual({ mode: 'date', op: '=', value: '2026-04-14', originalValue: '14/04/2026' });
  });

  it('parses date range with ..', () => {
    const col = { key: 'd', type: 'date' };
    const result = parseUserFilter(col, '2026-01-01..2026-12-31');
    expect(result).toEqual({
      mode: 'date', op: 'range', value: ['2026-01-01', '2026-12-31'],
      originalValue: '2026-01-01..2026-12-31',
    });
  });

  it('parses year-only date', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '2026')).toEqual({
      mode: 'date', op: 'year', value: '2026', originalValue: '2026',
    });
  });

  it('parses date with operators', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '>=2026-04-01').op).toBe('>=');
    expect(parseUserFilter(col, '<2026-04-01').op).toBe('<');
  });

  it('returns null for invalid date range', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, 'abc..def')).toBeNull();
  });

  it('parses enum label matching', () => {
    const col = { key: 's', type: 'status', enumLabels: { DR: 'Draft', CO: 'Completed' } };
    expect(parseUserFilter(col, 'draft')).toEqual({
      mode: 'enumLabel', value: ['DR'], originalValue: 'draft',
    });
  });

  it('parses enum direct code', () => {
    const col = { key: 's', type: 'status', enumLabels: { DR: 'Draft', CO: 'Completed' } };
    expect(parseUserFilter(col, 'DR')).toEqual({
      mode: 'enumLabel', value: ['DR'], originalValue: 'DR',
    });
  });

  it('returns null when no enum label matches', () => {
    const col = { key: 's', type: 'status', enumLabels: { DR: 'Draft' } };
    expect(parseUserFilter(col, 'zzz')).toBeNull();
  });

  it('parses boolean labels', () => {
    const col = { key: 'b', type: 'boolean', badgeLabels: { true: 'Active', false: 'Inactive' } };
    expect(parseUserFilter(col, 'yes').value).toBe(true);
    expect(parseUserFilter(col, 'no').value).toBe(false);
    expect(parseUserFilter(col, 'act').value).toBe(true);
    expect(parseUserFilter(col, 'inact').value).toBe(false);
    expect(parseUserFilter(col, 'unknown')).toBeNull();
  });

  it('parses numeric with operators', () => {
    const col = { key: 'n', type: 'amount' };
    expect(parseUserFilter(col, '>1000')).toEqual({
      mode: 'numeric', op: '>', value: 1000, originalValue: '>1000',
    });
    expect(parseUserFilter(col, '1,234.5')).toEqual({
      mode: 'numeric', op: '=', value: 1234.5, originalValue: '1,234.5',
    });
    expect(parseUserFilter(col, 'abc')).toBeNull();
  });

  it('parses identifier mode', () => {
    const col = { key: 'bp', type: 'selector' };
    expect(parseUserFilter(col, 'acme')).toEqual({
      mode: 'identifier', value: 'acme', originalValue: 'acme',
    });
  });
});

// ---------------------------------------------------------------------------
// resolveBackendSort
// ---------------------------------------------------------------------------

describe('resolveBackendSort', () => {
  it('uses minus-prefix for identifier desc', () => {
    const col = { key: 'bp', type: 'selector' };
    expect(resolveBackendSort(col, 'desc')).toBe('-bp$_identifier');
    expect(resolveBackendSort(col, 'asc')).toBe('bp$_identifier');
  });

  it('respects explicit backendSortKey', () => {
    const col = { key: 'bp', backendSortKey: 'custom$_identifier' };
    expect(resolveBackendSort(col, 'asc')).toBe('custom$_identifier');
    expect(resolveBackendSort(col, 'desc')).toBe('-custom$_identifier');
  });

  it('uses space suffix for raw sort', () => {
    expect(resolveBackendSort({ key: 'name', type: 'string' }, 'asc')).toBe('name asc');
    expect(resolveBackendSort({ key: 'name', type: 'string' }, 'desc')).toBe('name desc');
  });

  it('uses space suffix for date and amount', () => {
    expect(resolveBackendSort({ key: 'orderDate', type: 'date' }, 'desc')).toBe('orderDate desc');
    expect(resolveBackendSort({ key: 'total', type: 'amount' }, 'asc')).toBe('total asc');
  });

  it('handles null col gracefully', () => {
    expect(resolveBackendSort(null, 'asc')).toBe(' asc');
  });
});

// ---------------------------------------------------------------------------
// buildBackendFilter
// ---------------------------------------------------------------------------

describe('buildBackendFilter', () => {
  it('returns null for null parsed or missing key', () => {
    expect(buildBackendFilter({ key: 'x' }, null)).toBeNull();
    expect(buildBackendFilter({}, { mode: 'text', value: 'y' })).toBeNull();
  });

  it('builds text iContains', () => {
    expect(buildBackendFilter({ key: 'name' }, { mode: 'text', value: 'abc' })).toEqual([
      { fieldName: 'name', operator: 'iContains', value: 'abc' },
    ]);
  });

  it('builds identifier iContains with $_identifier suffix', () => {
    expect(buildBackendFilter({ key: 'bp', type: 'selector' }, { mode: 'identifier', value: 'acme' })).toEqual([
      { fieldName: 'bp$_identifier', operator: 'iContains', value: 'acme' },
    ]);
  });

  it('builds identifier with explicit backendFilterKey', () => {
    expect(buildBackendFilter({ key: 'bp', backendFilterKey: 'bp$name' }, { mode: 'identifier', value: 'x' })).toEqual([
      { fieldName: 'bp$name', operator: 'iContains', value: 'x' },
    ]);
  });

  it('builds enumLabel equals for single code', () => {
    expect(buildBackendFilter({ key: 's' }, { mode: 'enumLabel', value: ['DR'] })).toEqual([
      { fieldName: 's', operator: 'equals', value: 'DR' },
    ]);
  });

  it('builds enumLabel inSet for multiple codes', () => {
    expect(buildBackendFilter({ key: 's' }, { mode: 'enumLabel', value: ['DR', 'CO'] })).toEqual([
      { fieldName: 's', operator: 'inSet', value: 'DR,CO' },
    ]);
  });

  it('builds booleanLabel equals', () => {
    expect(buildBackendFilter({ key: 'b' }, { mode: 'booleanLabel', value: true })).toEqual([
      { fieldName: 'b', operator: 'equals', value: true },
    ]);
  });

  it('builds numeric with various operators', () => {
    expect(buildBackendFilter({ key: 'n' }, { mode: 'numeric', op: '>', value: 100 })).toEqual([
      { fieldName: 'n', operator: 'greaterThan', value: 100 },
    ]);
    expect(buildBackendFilter({ key: 'n' }, { mode: 'numeric', op: '<=', value: 50 })).toEqual([
      { fieldName: 'n', operator: 'lessOrEqual', value: 50 },
    ]);
  });

  it('builds date exact as day range', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: '=', value: '2026-04-14' })).toEqual([
      { fieldName: 'd', operator: 'greaterOrEqual', value: '2026-04-14' },
      { fieldName: 'd', operator: 'lessOrEqual', value: '2026-04-14' },
    ]);
  });

  it('builds date year range', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: 'year', value: '2026' })).toEqual([
      { fieldName: 'd', operator: 'greaterOrEqual', value: '2026-01-01' },
      { fieldName: 'd', operator: 'lessOrEqual', value: '2026-12-31' },
    ]);
  });

  it('builds date range with ..', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: 'range', value: ['2026-01-01', '2026-12-31'] })).toEqual([
      { fieldName: 'd', operator: 'greaterOrEqual', value: '2026-01-01' },
      { fieldName: 'd', operator: 'lessOrEqual', value: '2026-12-31' },
    ]);
  });

  it('shifts date for strict > and <', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: '>', value: '2026-04-14' })).toEqual([
      { fieldName: 'd', operator: 'greaterOrEqual', value: '2026-04-15' },
    ]);
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: '<', value: '2026-04-15' })).toEqual([
      { fieldName: 'd', operator: 'lessOrEqual', value: '2026-04-14' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria', () => {
  const columns = [
    { key: 'name', type: 'string' },
    { key: 'amount', type: 'amount' },
    { key: 'bp', type: 'selector' },
  ];

  it('returns null for empty conditions', () => {
    expect(buildAdvancedFilterCriteria({ conditions: [] }, columns)).toBeNull();
    expect(buildAdvancedFilterCriteria(null, columns)).toBeNull();
  });

  it('builds AND criteria flat', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'test' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([
      { fieldName: 'name', operator: 'iContains', value: 'test' },
    ]);
  });

  it('wraps OR conditions in AdvancedCriteria', () => {
    const filter = {
      rowOperator: 'or',
      conditions: [
        { field: 'name', operator: 'iContains', value: 'a' },
        { field: 'name', operator: 'iContains', value: 'b' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toHaveLength(1);
    expect(result[0]._constructor).toBe('AdvancedCriteria');
    expect(result[0].operator).toBe('or');
    expect(result[0].criteria).toHaveLength(2);
  });

  it('skips unknown columns', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'unknown', operator: 'iContains', value: 'x' },
      ],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('handles isNull operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'isNull', value: null },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'isNull' }]);
  });

  it('handles between operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'amount', operator: 'between', value: ['100', '500'] },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([
      { fieldName: 'amount', operator: 'greaterOrEqual', value: 100 },
      { fieldName: 'amount', operator: 'lessOrEqual', value: 500 },
    ]);
  });

  it('handles inSet operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'inSet', value: ['a', 'b', 'c'] },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([
      { fieldName: 'name', operator: 'inSet', value: 'a,b,c' },
    ]);
  });

  it('handles multi-value array with OR composition', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: 'equals', value: ['x', 'y'] },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toHaveLength(1);
    expect(result[0]._constructor).toBe('AdvancedCriteria');
    expect(result[0].operator).toBe('or');
  });

  it('returns null when operator is missing', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'name', operator: null, value: 'x' },
      ],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('uses identifier field for textual ops on selector columns', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'bp', operator: 'iContains', value: 'acme' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([
      { fieldName: 'bp$_identifier', operator: 'iContains', value: 'acme' },
    ]);
  });

  it('uses raw key for discrete ops on selector columns', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'bp', operator: 'equals', value: 'uuid-1' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([
      { fieldName: 'bp', operator: 'equals', value: 'uuid-1' },
    ]);
  });

  it('handles isNotNull operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'isNotNull', value: null }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'notNull' }]);
  });

  it('returns null for between with non-array value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: '100' }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null for between with empty from/to', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['', '500'] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null for between with null from', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: [null, '500'] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null for between with non-numeric coercion failure', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['abc', '500'] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('handles inSet with single value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: ['only'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'equals', value: 'only' }]);
  });

  it('handles inSet with empty array', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('handles inSet with string value (comma-separated)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: 'a,b,c' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'inSet', value: 'a,b,c' }]);
  });

  it('handles multi-value array with single item (no OR wrap)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: ['only'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'equals', value: 'only' }]);
  });

  it('returns null for multi-value array with only empty/null values', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: ['', null] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null for empty string value (non-array, non-null)', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: '' }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('handles numeric mode with string numeric value', () => {
    const cols = [{ key: 'qty', type: 'number' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'greaterThan', value: '42.5' }],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([{ fieldName: 'qty', operator: 'greaterThan', value: 42.5 }]);
  });

  it('returns null for numeric mode with non-numeric string', () => {
    const cols = [{ key: 'qty', type: 'number' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'equals', value: 'abc' }],
    };
    expect(buildAdvancedFilterCriteria(filter, cols)).toBeNull();
  });

  it('handles numeric mode with actual number value', () => {
    const cols = [{ key: 'qty', type: 'number' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'qty', operator: 'equals', value: 100 }],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([{ fieldName: 'qty', operator: 'equals', value: 100 }]);
  });

  it('handles booleanLabel mode with true string value', () => {
    const cols = [{ key: 'active', type: 'boolean' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'active', operator: 'equals', value: 'true' }],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([{ fieldName: 'active', operator: 'equals', value: true }]);
  });

  it('handles booleanLabel mode with false value', () => {
    const cols = [{ key: 'active', type: 'boolean' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'active', operator: 'equals', value: false }],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([{ fieldName: 'active', operator: 'equals', value: false }]);
  });

  it('uses buildCriteria from column when provided', () => {
    const customCol = {
      key: 'custom',
      type: 'string',
      buildCriteria: (row) => [{ fieldName: 'custom_field', operator: 'equals', value: row.value }],
    };
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'custom', operator: 'equals', value: 'test' }],
    };
    const result = buildAdvancedFilterCriteria(filter, [customCol]);
    expect(result).toEqual([{ fieldName: 'custom_field', operator: 'equals', value: 'test' }]);
  });

  it('returns null when buildCriteria returns null', () => {
    const customCol = {
      key: 'custom',
      type: 'string',
      buildCriteria: () => null,
    };
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'custom', operator: 'equals', value: 'test' }],
    };
    expect(buildAdvancedFilterCriteria(filter, [customCol])).toBeNull();
  });

  it('does not wrap OR when only one criterion', () => {
    const filter = {
      rowOperator: 'or',
      conditions: [{ field: 'name', operator: 'iContains', value: 'single' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    // Single item OR is emitted flat (no AdvancedCriteria wrapper)
    expect(result).toEqual([{ fieldName: 'name', operator: 'iContains', value: 'single' }]);
  });

  it('handles identifier column with iNotContains operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'bp', operator: 'iNotContains', value: 'acme' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'bp$_identifier', operator: 'iNotContains', value: 'acme' }]);
  });

  it('handles identifier column with iEquals operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'bp', operator: 'iEquals', value: 'Acme Corp' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'bp$_identifier', operator: 'iEquals', value: 'Acme Corp' }]);
  });

  it('handles identifier column with notEqual (discrete) operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'bp', operator: 'notEqual', value: 'uuid-1' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'bp', operator: 'notEqual', value: 'uuid-1' }]);
  });

  it('handles between for date mode (non-numeric coercion)', () => {
    const cols = [{ key: 'date', type: 'date' }];
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'date', operator: 'between', value: ['2026-01-01', '2026-12-31'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([
      { fieldName: 'date', operator: 'greaterOrEqual', value: '2026-01-01' },
      { fieldName: 'date', operator: 'lessOrEqual', value: '2026-12-31' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getFilteredKey
// ---------------------------------------------------------------------------

describe('getFilteredKey', () => {
  it('returns backendFilterKey when provided', () => {
    const col = { key: 'bp', backendFilterKey: 'bp$name' };
    expect(getFilteredKey(col, 'identifier', 'iContains')).toBe('bp$name');
  });

  it('returns $_identifier for identifier mode with textual op', () => {
    const col = { key: 'bp' };
    expect(getFilteredKey(col, 'identifier', 'iContains')).toBe('bp$_identifier');
    expect(getFilteredKey(col, 'identifier', 'iNotContains')).toBe('bp$_identifier');
    expect(getFilteredKey(col, 'identifier', 'iEquals')).toBe('bp$_identifier');
    expect(getFilteredKey(col, 'identifier', 'iNotEqual')).toBe('bp$_identifier');
  });

  it('returns raw key for identifier mode with discrete op', () => {
    const col = { key: 'bp' };
    expect(getFilteredKey(col, 'identifier', 'equals')).toBe('bp');
    expect(getFilteredKey(col, 'identifier', 'notEqual')).toBe('bp');
    expect(getFilteredKey(col, 'identifier', 'inSet')).toBe('bp');
  });

  it('returns raw key for non-identifier modes', () => {
    const col = { key: 'name' };
    expect(getFilteredKey(col, 'text', 'iContains')).toBe('name');
    expect(getFilteredKey(col, 'numeric', 'equals')).toBe('name');
    expect(getFilteredKey(col, 'date', 'greaterThan')).toBe('name');
  });
});

// ---------------------------------------------------------------------------
// resolveBackendSort — additional edge cases
// ---------------------------------------------------------------------------

describe('resolveBackendSort — edge cases', () => {
  it('infers identifier sort for enumLabels column', () => {
    // inferSortMode returns 'enumLabel' when col.enumLabels exists
    // enumLabel is NOT an identifier sort, so it uses space suffix
    const col = { key: 'status', enumLabels: { DR: 'Draft' } };
    expect(resolveBackendSort(col, 'asc')).toBe('status asc');
  });

  it('infers identifier sort for badgeLabels column', () => {
    const col = { key: 'active', badgeLabels: { true: 'Yes', false: 'No' } };
    expect(resolveBackendSort(col, 'desc')).toBe('active desc');
  });

  it('uses identifier sort for status type', () => {
    // status type -> inferSortMode returns 'enumLabel' which is NOT identifier
    const col = { key: 'docStatus', type: 'status' };
    expect(resolveBackendSort(col, 'asc')).toBe('docStatus asc');
  });

  it('uses identifier sort for boolean type', () => {
    const col = { key: 'active', type: 'boolean' };
    expect(resolveBackendSort(col, 'asc')).toBe('active asc');
  });

  it('respects explicit sortMode=identifier', () => {
    const col = { key: 'org', sortMode: 'identifier' };
    expect(resolveBackendSort(col, 'asc')).toBe('org$_identifier');
    expect(resolveBackendSort(col, 'desc')).toBe('-org$_identifier');
  });

  it('defaults invalid direction to asc', () => {
    expect(resolveBackendSort({ key: 'name' }, 'invalid')).toBe('name asc');
  });
});

// ---------------------------------------------------------------------------
// parseUserFilter — additional edge cases
// ---------------------------------------------------------------------------

describe('parseUserFilter — edge cases', () => {
  it('parses date with dd-mm-yyyy format', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '14-04-2026')).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '14-04-2026',
    });
  });

  it('parses date with dd.mm.yyyy format', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '14.04.2026')).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '14.04.2026',
    });
  });

  it('parses ISO date yyyy-mm-dd', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '2026-04-14')).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026-04-14',
    });
  });

  it('parses ISO datetime prefix', () => {
    const col = { key: 'd', type: 'date' };
    const result = parseUserFilter(col, '2026-04-14T10:30:00');
    expect(result.value).toBe('2026-04-14');
  });

  it('parses date with yyyy/mm/dd format', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '2026/04/14')).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026/04/14',
    });
  });

  it('returns null for unparseable date with operator', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, '>not-a-date')).toBeNull();
  });

  it('returns null for unparseable date string', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, 'hello-world')).toBeNull();
  });

  it('matches multiple enum labels with partial input', () => {
    const col = { key: 's', type: 'status', enumLabels: { DR: 'Draft', CO: 'Complete', CL: 'Closed' } };
    const result = parseUserFilter(col, 'cl');
    // "cl" matches "Closed" and potentially "Complete" (contains 'cl' -> no, 'Complete'.toLowerCase() is 'complete' which doesn't contain 'cl')
    // Actually: 'closed'.includes('cl') -> true, 'complete'.includes('cl') -> false
    expect(result.mode).toBe('enumLabel');
    expect(result.value).toContain('CL');
  });

  it('parses boolean generic keywords (si, 1, y)', () => {
    const col = { key: 'b', type: 'boolean' };
    expect(parseUserFilter(col, 'si').value).toBe(true);
    expect(parseUserFilter(col, 'sí').value).toBe(true);
    expect(parseUserFilter(col, '1').value).toBe(true);
    expect(parseUserFilter(col, 'y').value).toBe(true);
    expect(parseUserFilter(col, '0').value).toBe(false);
    expect(parseUserFilter(col, 'n').value).toBe(false);
  });

  it('returns null for boolean with unrecognized input and no badgeLabels', () => {
    const col = { key: 'b', type: 'boolean' };
    expect(parseUserFilter(col, 'maybe')).toBeNull();
  });

  it('parses numeric with <= operator', () => {
    const col = { key: 'n', type: 'number' };
    expect(parseUserFilter(col, '<=50')).toEqual({
      mode: 'numeric', op: '<=', value: 50, originalValue: '<=50',
    });
  });

  it('parses numeric with >= operator', () => {
    const col = { key: 'n', type: 'number' };
    expect(parseUserFilter(col, '>=100')).toEqual({
      mode: 'numeric', op: '>=', value: 100, originalValue: '>=100',
    });
  });

  it('parses numeric with = operator', () => {
    const col = { key: 'n', type: 'number' };
    expect(parseUserFilter(col, '=42')).toEqual({
      mode: 'numeric', op: '=', value: 42, originalValue: '=42',
    });
  });

  it('parses numeric with comma thousands separator', () => {
    const col = { key: 'n', type: 'number' };
    expect(parseUserFilter(col, '>1,000,000')).toEqual({
      mode: 'numeric', op: '>', value: 1000000, originalValue: '>1,000,000',
    });
  });

  it('handles percent type as numeric', () => {
    const col = { key: 'p', type: 'percent' };
    expect(parseUserFilter(col, '50')).toEqual({
      mode: 'numeric', op: '=', value: 50, originalValue: '50',
    });
  });

  it('preserves originalValue', () => {
    const col = { key: 'n', type: 'string' };
    const result = parseUserFilter(col, '  spaced  ');
    expect(result.originalValue).toBe('  spaced  ');
    expect(result.value).toBe('spaced');
  });

  it('uses filterMode=identifier for _ID column heuristic', () => {
    const col = { key: 'bp', column: 'C_BPartner_ID' };
    const result = parseUserFilter(col, 'acme');
    expect(result.mode).toBe('identifier');
  });

  it('uses filterMode=enumLabel for enum type', () => {
    const col = { key: 's', type: 'enum', enumLabels: { A: 'Active' } };
    const result = parseUserFilter(col, 'act');
    expect(result.mode).toBe('enumLabel');
    expect(result.value).toEqual(['A']);
  });
});

// ---------------------------------------------------------------------------
// buildBackendFilter — additional edge cases
// ---------------------------------------------------------------------------

describe('buildBackendFilter — edge cases', () => {
  it('builds date with >= operator', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: '>=', value: '2026-04-14' })).toEqual([
      { fieldName: 'd', operator: 'greaterOrEqual', value: '2026-04-14' },
    ]);
  });

  it('builds date with <= operator', () => {
    expect(buildBackendFilter({ key: 'd' }, { mode: 'date', op: '<=', value: '2026-04-14' })).toEqual([
      { fieldName: 'd', operator: 'lessOrEqual', value: '2026-04-14' },
    ]);
  });

  it('builds numeric equals', () => {
    expect(buildBackendFilter({ key: 'n' }, { mode: 'numeric', op: '=', value: 42 })).toEqual([
      { fieldName: 'n', operator: 'equals', value: 42 },
    ]);
  });

  it('builds numeric with < operator', () => {
    expect(buildBackendFilter({ key: 'n' }, { mode: 'numeric', op: '<', value: 10 })).toEqual([
      { fieldName: 'n', operator: 'lessThan', value: 10 },
    ]);
  });

  it('builds numeric with >= operator', () => {
    expect(buildBackendFilter({ key: 'n' }, { mode: 'numeric', op: '>=', value: 100 })).toEqual([
      { fieldName: 'n', operator: 'greaterOrEqual', value: 100 },
    ]);
  });

  it('respects backendFilterKey for date columns', () => {
    expect(buildBackendFilter(
      { key: 'd', backendFilterKey: 'orderDate' },
      { mode: 'date', op: '=', value: '2026-01-01' },
    )).toEqual([
      { fieldName: 'orderDate', operator: 'greaterOrEqual', value: '2026-01-01' },
      { fieldName: 'orderDate', operator: 'lessOrEqual', value: '2026-01-01' },
    ]);
  });

  it('respects backendFilterKey for enum columns', () => {
    expect(buildBackendFilter(
      { key: 's', backendFilterKey: 'docStatus' },
      { mode: 'enumLabel', value: ['DR'] },
    )).toEqual([
      { fieldName: 'docStatus', operator: 'equals', value: 'DR' },
    ]);
  });

  it('respects backendFilterKey for boolean columns', () => {
    expect(buildBackendFilter(
      { key: 'b', backendFilterKey: 'isActive' },
      { mode: 'booleanLabel', value: false },
    )).toEqual([
      { fieldName: 'isActive', operator: 'equals', value: false },
    ]);
  });

  it('respects backendFilterKey for numeric columns', () => {
    expect(buildBackendFilter(
      { key: 'n', backendFilterKey: 'grandTotal' },
      { mode: 'numeric', op: '>', value: 1000 },
    )).toEqual([
      { fieldName: 'grandTotal', operator: 'greaterThan', value: 1000 },
    ]);
  });

  it('handles unknown mode as text fallback', () => {
    expect(buildBackendFilter({ key: 'x' }, { mode: 'unknownMode', value: 'abc' })).toEqual([
      { fieldName: 'x', operator: 'iContains', value: 'abc' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// getDisplayText — additional edge cases
// ---------------------------------------------------------------------------

describe('getDisplayText — edge cases', () => {
  it('returns identifier for filterMode=identifier (without type=selector)', () => {
    const row = { org: 'uuid', 'org$_identifier': 'Org Name' };
    const col = { key: 'org', filterMode: 'identifier' };
    expect(getDisplayText(row, col)).toBe('Org Name');
  });

  it('returns enum label for filterMode=enumLabel (without type=status)', () => {
    const col = { key: 'prio', filterMode: 'enumLabel', enumLabels: { 1: 'High', 2: 'Low' } };
    expect(getDisplayText({ prio: 1 }, col)).toBe('High');
  });

  it('returns badge label for filterMode=booleanLabel (without type=boolean)', () => {
    const col = { key: 'flag', filterMode: 'booleanLabel', badgeLabels: { true: 'On', false: 'Off' } };
    expect(getDisplayText({ flag: true }, col)).toBe('On');
  });

  it('handles boolean with "true" string', () => {
    const col = { key: 'active', type: 'boolean', badgeLabels: { true: 'Yes', false: 'No' } };
    expect(getDisplayText({ active: 'true' }, col)).toBe('Yes');
  });

  it('handles boolean badge labels with only en_US locale', () => {
    const col = {
      key: 'flag', type: 'boolean',
      badgeLabels: { true: { en_US: 'Active' }, false: { en_US: 'Inactive' } },
    };
    expect(getDisplayText({ flag: true }, col)).toBe('Active');
  });

  it('handles boolean badge labels with fallback to first value', () => {
    const col = {
      key: 'flag', type: 'boolean',
      badgeLabels: { true: { fr_FR: 'Actif' }, false: { fr_FR: 'Inactif' } },
    };
    // No es_ES or en_US, falls back to Object.values()[0]
    expect(getDisplayText({ flag: true }, col)).toBe('Actif');
  });

  it('returns empty string for boolean with null badgeLabels entry', () => {
    const col = { key: 'flag', type: 'boolean', badgeLabels: { true: null, false: 'No' } };
    // badgeLabels.true is null → label is null → tryBooleanText returns null → falls to raw
    expect(getDisplayText({ flag: true }, col)).toBe('true');
  });

  it('coerces boolean values correctly', () => {
    const col = { key: 'active', type: 'boolean', badgeLabels: { true: 'Yes', false: 'No' } };
    expect(getDisplayText({ active: false }, col)).toBe('No');
    expect(getDisplayText({ active: 'false' }, col)).toBe('No');
  });

  it('returns identifier for filterMode=identifier when type is not selector', () => {
    // filterMode=identifier but type is undefined (not 'selector')
    const row = { warehouse: 'uuid-wh', 'warehouse$_identifier': 'Main Warehouse' };
    const col = { key: 'warehouse', filterMode: 'identifier' };
    expect(getDisplayText(row, col)).toBe('Main Warehouse');
  });

  it('returns enum label for filterMode=enumLabel when type is not status', () => {
    const col = { key: 'priority', type: 'number', filterMode: 'enumLabel', enumLabels: { 1: 'High', 5: 'Low' } };
    expect(getDisplayText({ priority: 1 }, col)).toBe('High');
    expect(getDisplayText({ priority: 5 }, col)).toBe('Low');
    // Falls through to raw when no matching key
    expect(getDisplayText({ priority: 99 }, col)).toBe('99');
  });
});

// ---------------------------------------------------------------------------
// parseDateString — yyyy/mm/dd branch (a > 999)
// ---------------------------------------------------------------------------

describe('parseUserFilter — parseDateString yyyy/mm/dd branch', () => {
  it('parses yyyy/mm/dd (slash-separated ISO-like)', () => {
    const col = { key: 'd', type: 'date' };
    const result = parseUserFilter(col, '2026/04/14');
    expect(result).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026/04/14',
    });
  });

  it('parses yyyy.mm.dd (dot-separated)', () => {
    const col = { key: 'd', type: 'date' };
    const result = parseUserFilter(col, '2026.04.14');
    expect(result).toEqual({
      mode: 'date', op: '=', value: '2026-04-14', originalValue: '2026.04.14',
    });
  });

  it('returns null for date parts containing NaN', () => {
    const col = { key: 'd', type: 'date' };
    expect(parseUserFilter(col, 'ab/cd/efgh')).toBeNull();
  });

  it('returns null for three-part date where no part > 999', () => {
    const col = { key: 'd', type: 'date' };
    // "12/04/99" — c=99, a=12; neither > 999 -> falls through to null
    expect(parseUserFilter(col, '12/04/99')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseNumericExpression — all operators
// ---------------------------------------------------------------------------

describe('parseUserFilter — parseNumericExpression operators', () => {
  const col = { key: 'n', type: 'number' };

  it('parses >= operator', () => {
    const result = parseUserFilter(col, '>=500');
    expect(result).toEqual({ mode: 'numeric', op: '>=', value: 500, originalValue: '>=500' });
  });

  it('parses <= operator', () => {
    const result = parseUserFilter(col, '<=200');
    expect(result).toEqual({ mode: 'numeric', op: '<=', value: 200, originalValue: '<=200' });
  });

  it('parses > operator', () => {
    const result = parseUserFilter(col, '>100');
    expect(result).toEqual({ mode: 'numeric', op: '>', value: 100, originalValue: '>100' });
  });

  it('parses < operator', () => {
    const result = parseUserFilter(col, '<50');
    expect(result).toEqual({ mode: 'numeric', op: '<', value: 50, originalValue: '<50' });
  });

  it('parses = operator', () => {
    const result = parseUserFilter(col, '=42');
    expect(result).toEqual({ mode: 'numeric', op: '=', value: 42, originalValue: '=42' });
  });

  it('parses comma-formatted number without operator', () => {
    const result = parseUserFilter(col, '1,234,567.89');
    expect(result).toEqual({ mode: 'numeric', op: '=', value: 1234567.89, originalValue: '1,234,567.89' });
  });

  it('parses comma-formatted number with operator', () => {
    const result = parseUserFilter(col, '>=1,000');
    expect(result).toEqual({ mode: 'numeric', op: '>=', value: 1000, originalValue: '>=1,000' });
  });

  it('returns null for non-numeric text without operator', () => {
    expect(parseUserFilter(col, 'abc')).toBeNull();
  });

  it('returns NaN value for operator + non-numeric text (parseNumericExpression extracts operator)', () => {
    // parseNumericExpression matches the operator prefix but parseFloat returns NaN
    const result = parseUserFilter(col, '>abc');
    expect(result).not.toBeNull();
    expect(result.op).toBe('>');
    expect(Number.isNaN(result.value)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria — buildCriteria returning null
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — custom buildCriteria edge cases', () => {
  it('returns null when all custom buildCriteria return null', () => {
    const col = {
      key: 'custom',
      type: 'string',
      buildCriteria: () => null,
    };
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'custom', operator: 'equals', value: 'test' },
        { field: 'custom', operator: 'iContains', value: 'foo' },
      ],
    };
    expect(buildAdvancedFilterCriteria(filter, [col])).toBeNull();
  });

  it('skips null buildCriteria results in mixed conditions', () => {
    const cols = [
      { key: 'custom', type: 'string', buildCriteria: () => null },
      { key: 'name', type: 'string' },
    ];
    const filter = {
      rowOperator: 'and',
      conditions: [
        { field: 'custom', operator: 'equals', value: 'x' },
        { field: 'name', operator: 'iContains', value: 'test' },
      ],
    };
    const result = buildAdvancedFilterCriteria(filter, cols);
    expect(result).toEqual([{ fieldName: 'name', operator: 'iContains', value: 'test' }]);
  });
});

// ---------------------------------------------------------------------------
// buildAdvancedFilterCriteria — empty/null value conditions
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — empty/null value edge cases', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('returns null for undefined value', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'iContains', value: undefined }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null for null value with non-null operator', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'equals', value: null }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// inferSortMode — enumLabels vs badgeLabels
// ---------------------------------------------------------------------------

describe('resolveBackendSort — inferSortMode with enumLabels vs badgeLabels', () => {
  it('uses enumLabel sort mode when col has enumLabels (space suffix)', () => {
    const col = { key: 'priority', enumLabels: { 1: 'High', 2: 'Low' } };
    expect(resolveBackendSort(col, 'asc')).toBe('priority asc');
    expect(resolveBackendSort(col, 'desc')).toBe('priority desc');
  });

  it('uses booleanLabel sort mode when col has badgeLabels (space suffix)', () => {
    const col = { key: 'isActive', badgeLabels: { true: 'Active', false: 'Inactive' } };
    expect(resolveBackendSort(col, 'asc')).toBe('isActive asc');
    expect(resolveBackendSort(col, 'desc')).toBe('isActive desc');
  });

  it('enumLabels takes precedence over type for sort mode', () => {
    // col has both type=selector and enumLabels; enumLabels wins in inferSortMode
    const col = { key: 'cat', enumLabels: { A: 'Alpha', B: 'Beta' } };
    // enumLabel sort mode => space suffix, not identifier
    expect(resolveBackendSort(col, 'asc')).toBe('cat asc');
  });

  it('badgeLabels takes precedence over type for sort mode', () => {
    const col = { key: 'flag', badgeLabels: { true: 'On', false: 'Off' } };
    expect(resolveBackendSort(col, 'desc')).toBe('flag desc');
  });
});

// ---------------------------------------------------------------------------
// Coverage: tryBooleanText — empty object badge label fallback
// ---------------------------------------------------------------------------

describe('getDisplayText — boolean badge label edge cases for coverage', () => {
  it('returns empty string when badge label is empty object (no locale keys)', () => {
    const col = {
      key: 'flag', type: 'boolean',
      badgeLabels: { true: {}, false: {} },
    };
    // Object.values({}) is [] → [0] is undefined → ?? '' → ''
    expect(getDisplayText({ flag: true }, col)).toBe('');
    expect(getDisplayText({ flag: false }, col)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Coverage: parseBooleanLabelFilter — undefined badgeLabels.true / .false
// ---------------------------------------------------------------------------

describe('parseUserFilter — boolean label with missing true/false keys', () => {
  it('matches when badgeLabels.true is undefined (covers ?? fallback)', () => {
    const col = { key: 'b', type: 'boolean', badgeLabels: { false: 'Inactive' } };
    // badgeLabels.true is undefined → String(undefined ?? '') → ''
    // Searching for 'inact' should match falseLabel
    expect(parseUserFilter(col, 'inact').value).toBe(false);
    // Searching for something that matches neither → null
    expect(parseUserFilter(col, 'zzz')).toBeNull();
  });

  it('matches when badgeLabels.false is undefined (covers ?? fallback)', () => {
    const col = { key: 'b', type: 'boolean', badgeLabels: { true: 'Active' } };
    expect(parseUserFilter(col, 'act').value).toBe(true);
    expect(parseUserFilter(col, 'zzz')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildBackendFilter numeric — COMPARISON_OP fallback to 'equals'
// ---------------------------------------------------------------------------

describe('buildBackendFilter — numeric op fallback', () => {
  it('falls back to equals when op is not in COMPARISON_OP map', () => {
    // op '!=' is not in the map → COMPARISON_OP['!='] is undefined → ?? 'equals'
    const result = buildBackendFilter(
      { key: 'n' },
      { mode: 'numeric', op: '!=', value: 42 },
    );
    expect(result).toEqual([{ fieldName: 'n', operator: 'equals', value: 42 }]);
  });

  it('falls back to equals when op is null', () => {
    const result = buildBackendFilter(
      { key: 'n' },
      { mode: 'numeric', op: null, value: 10 },
    );
    expect(result).toEqual([{ fieldName: 'n', operator: 'equals', value: 10 }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: buildAdvancedFilterCriteria — columns not an array
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — invalid columns parameter', () => {
  it('returns null when columns is null', () => {
    const filter = { conditions: [{ field: 'x', operator: 'equals', value: 'y' }] };
    expect(buildAdvancedFilterCriteria(filter, null)).toBeNull();
  });

  it('returns null when columns is a string', () => {
    const filter = { conditions: [{ field: 'x', operator: 'equals', value: 'y' }] };
    expect(buildAdvancedFilterCriteria(filter, 'not-an-array')).toBeNull();
  });

  it('returns null when columns is an object', () => {
    const filter = { conditions: [{ field: 'x', operator: 'equals', value: 'y' }] };
    expect(buildAdvancedFilterCriteria(filter, { key: 'x' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Coverage: between with null 'to' value
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — between edge cases for coverage', () => {
  const columns = [{ key: 'amount', type: 'amount' }];

  it('returns null when between to is null', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', null] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null when between to is empty string', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', ''] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('returns null when numeric coercion fails on to', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'amount', operator: 'between', value: ['100', 'xyz'] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Coverage: inSet with null/empty values mixed in array
// ---------------------------------------------------------------------------

describe('buildAdvancedFilterCriteria — inSet filtering edge cases', () => {
  const columns = [{ key: 'name', type: 'string' }];

  it('filters out null and empty values from inSet array', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [null, '', 'valid'] }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'equals', value: 'valid' }]);
  });

  it('returns null when inSet array has only null/empty values', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: [null, '', undefined] }],
    };
    expect(buildAdvancedFilterCriteria(filter, columns)).toBeNull();
  });

  it('handles inSet with string containing commas', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: 'a, b' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'inSet', value: 'a,b' }]);
  });

  it('handles inSet string with single value after trim', () => {
    const filter = {
      rowOperator: 'and',
      conditions: [{ field: 'name', operator: 'inSet', value: 'solo' }],
    };
    const result = buildAdvancedFilterCriteria(filter, columns);
    expect(result).toEqual([{ fieldName: 'name', operator: 'equals', value: 'solo' }]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: resolveFilterMode — enum type
// ---------------------------------------------------------------------------

describe('resolveFilterMode — additional type coverage', () => {
  it('infers numeric for percent type', () => {
    expect(resolveFilterMode({ key: 'p', type: 'percent' })).toBe('numeric');
  });

  it('infers enumLabel for enum type', () => {
    expect(resolveFilterMode({ key: 'e', type: 'enum' })).toBe('enumLabel');
  });

  it('returns text for type=string without _ID column', () => {
    expect(resolveFilterMode({ key: 'name', type: 'string' })).toBe('text');
  });

  it('returns text for type=string with non-matching column name', () => {
    expect(resolveFilterMode({ key: 'name', type: 'string', column: 'Name' })).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Coverage: invertEnumLabels edge cases
// ---------------------------------------------------------------------------

describe('parseUserFilter — invertEnumLabels edge cases', () => {
  it('handles enumLabels being null', () => {
    const col = { key: 's', type: 'status', enumLabels: null };
    expect(parseUserFilter(col, 'anything')).toBeNull();
  });

  it('handles enumLabels being a non-object', () => {
    const col = { key: 's', type: 'status', enumLabels: 'not-an-object' };
    // invertEnumLabels returns empty map → no matches → null
    expect(parseUserFilter(col, 'anything')).toBeNull();
  });
});