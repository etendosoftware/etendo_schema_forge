import { buildInvoiceFilterColumns, applyInvoiceAdvancedFilter } from '../paymentInvoiceFilter';

describe('paymentInvoiceFilter — buildInvoiceFilterColumns', () => {
  const cols = buildInvoiceFilterColumns();

  it('lists the expected columns in order', () => {
    expect(cols.map((c) => c.key)).toEqual([
      'no', 'metodo', 'bp', 'venc', 'fecha', 'estado', 'total', 'expected', 'pend',
    ]);
  });

  it('assigns the right types to drive the operator set', () => {
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c.type]));
    expect(byKey.no).toBe('string');
    expect(byKey.metodo).toBe('selector');
    expect(byKey.bp).toBe('selector');
    expect(byKey.venc).toBe('date');
    expect(byKey.fecha).toBe('date');
    expect(byKey.estado).toBe('enum');
    expect(byKey.total).toBe('amount');
    expect(byKey.expected).toBe('amount');
    expect(byKey.pend).toBe('amount');
  });

  it('attaches estado enum labels from ESTADOS', () => {
    const estado = cols.find((c) => c.key === 'estado');
    expect(estado.enumLabels).toEqual({
      vencida: 'Vencida', proxima: 'Próxima a vencer', aldia: 'Al día',
    });
  });
});

describe('paymentInvoiceFilter — applyInvoiceAdvancedFilter', () => {
  const invoices = [
    { id: '1', no: 'FAC-001', metodo: 'Transferencia', bp: 'Acme', venc: '15/01/2026', fecha: '01/01/2026', total: 120, expected: 110, pend: 100, dias: -5, ref: 'R1' },
    { id: '2', no: 'FAC-002', metodo: 'Efectivo', bp: 'Globex', venc: '20/02/2026', fecha: '02/02/2026', total: 250, expected: 250, pend: 250, dias: 3, ref: '' },
    { id: '3', no: 'FAC-003', metodo: 'Tarjeta', bp: 'Acme', venc: '30/03/2026', fecha: '03/03/2026', total: 50, expected: 50, pend: 50, dias: 30, ref: null },
  ];

  const ids = (res) => res.map((r) => r.id);

  describe('empty / invalid filters', () => {
    it('returns the input unchanged for null filter', () => {
      expect(applyInvoiceAdvancedFilter(invoices, null)).toBe(invoices);
    });

    it('returns the input unchanged when conditions is missing or empty', () => {
      expect(applyInvoiceAdvancedFilter(invoices, {})).toBe(invoices);
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [] })).toBe(invoices);
    });

    it('returns the input unchanged when no condition is complete', () => {
      const res = applyInvoiceAdvancedFilter(invoices, {
        conditions: [{ field: 'no' }, { operator: 'iContains', value: 'x' }, null],
      });
      expect(res).toBe(invoices);
    });
  });

  describe('text operators', () => {
    it('iContains (case-insensitive)', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'no', operator: 'iContains', value: 'fac-00' }] }))).toEqual(['1', '2', '3']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'bp', operator: 'iContains', value: 'glob' }] }))).toEqual(['2']);
    });

    it('iNotContains', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'bp', operator: 'iNotContains', value: 'acme' }] }))).toEqual(['2']);
    });

    it('iEquals / iNotEqual', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'iEquals', value: 'efectivo' }] }))).toEqual(['2']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'iNotEqual', value: 'efectivo' }] }))).toEqual(['1', '3']);
    });

    it('iStartsWith (case-insensitive prefix)', () => {
      // 'FAC-00' is a shared prefix → all rows match
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'no', operator: 'iStartsWith', value: 'fac-00' }] }))).toEqual(['1', '2', '3']);
      // Prefix match only: 'trans' is at the start of Transferencia (row 1), not a substring elsewhere
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'iStartsWith', value: 'trans' }] }))).toEqual(['1']);
      // Substring that is not a prefix must not match
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'iStartsWith', value: 'ferencia' }] }))).toEqual([]);
    });
  });

  describe('null operators', () => {
    it('isNull matches null and empty string', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'ref', operator: 'isNull' }] }))).toEqual(['2', '3']);
    });

    it('isNotNull matches present values', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'ref', operator: 'isNotNull' }] }))).toEqual(['1']);
    });
  });

  describe('equals / notEqual (incl. arrays and dates)', () => {
    it('equals with a scalar (case-insensitive)', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'equals', value: 'TARJETA' }] }))).toEqual(['3']);
    });

    it('equals with an array (in-list)', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'equals', value: ['Efectivo', 'Tarjeta'] }] }))).toEqual(['2', '3']);
    });

    it('equals on a date field compares dd/MM/yyyy vs ISO', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'venc', operator: 'equals', value: '2026-02-20' }] }))).toEqual(['2']);
    });

    it('notEqual with scalar and with array', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'notEqual', value: 'efectivo' }] }))).toEqual(['1', '3']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'bp', operator: 'notEqual', value: ['Acme'] }] }))).toEqual(['2']);
    });
  });

  describe('inSet', () => {
    it('matches against an array value', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'bp', operator: 'inSet', value: ['Globex'] }] }))).toEqual(['2']);
    });

    it('matches against a comma-separated string value', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'metodo', operator: 'inSet', value: 'Efectivo, Tarjeta' }] }))).toEqual(['2', '3']);
    });
  });

  describe('numeric comparisons', () => {
    it('greaterThan / lessThan on amount', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'greaterThan', value: 100 }] }))).toEqual(['2']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'lessThan', value: 100 }] }))).toEqual(['3']);
    });

    it('greaterOrEqual / lessOrEqual', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'greaterOrEqual', value: 100 }] }))).toEqual(['1', '2']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'lessOrEqual', value: 100 }] }))).toEqual(['1', '3']);
    });

    it('numeric guard: non-numeric value matches nothing', () => {
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'greaterThan', value: 'x' }] })).toHaveLength(0);
    });

    it('between on amount (inclusive)', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'between', value: [50, 100] }] }))).toEqual(['1', '3']);
    });

    it('between with a missing bound matches nothing', () => {
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'between', value: [50] }] })).toHaveLength(0);
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'pend', operator: 'between', value: 'nope' }] })).toHaveLength(0);
    });
  });

  describe('date comparisons', () => {
    it('greaterThan / lessThan on a date field', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'venc', operator: 'greaterThan', value: '2026-02-01' }] }))).toEqual(['2', '3']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'venc', operator: 'lessThan', value: '2026-02-01' }] }))).toEqual(['1']);
    });

    it('between on a date field (inclusive)', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'fecha', operator: 'between', value: ['2026-01-01', '2026-02-28'] }] }))).toEqual(['1', '2']);
    });

    it('date guard: unparseable bounds match nothing', () => {
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'venc', operator: 'between', value: ['bad', 'bad'] }] })).toHaveLength(0);
      expect(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'venc', operator: 'greaterThan', value: 'bad' }] })).toHaveLength(0);
    });
  });

  describe('derived estado field', () => {
    it('filters by the computed due-state enum', () => {
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'estado', operator: 'equals', value: 'vencida' }] }))).toEqual(['1']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'estado', operator: 'equals', value: 'proxima' }] }))).toEqual(['2']);
      expect(ids(applyInvoiceAdvancedFilter(invoices, { conditions: [{ field: 'estado', operator: 'inSet', value: ['vencida', 'aldia'] }] }))).toEqual(['1', '3']);
    });
  });

  describe('rowOperator (and / or)', () => {
    it('AND requires every condition (default)', () => {
      const res = applyInvoiceAdvancedFilter(invoices, {
        rowOperator: 'and',
        conditions: [
          { field: 'bp', operator: 'iEquals', value: 'Acme' },
          { field: 'pend', operator: 'greaterThan', value: 60 },
        ],
      });
      expect(ids(res)).toEqual(['1']);
    });

    it('OR matches at least one condition', () => {
      const res = applyInvoiceAdvancedFilter(invoices, {
        rowOperator: 'or',
        conditions: [
          { field: 'metodo', operator: 'iEquals', value: 'Efectivo' },
          { field: 'pend', operator: 'lessThan', value: 60 },
        ],
      });
      expect(ids(res)).toEqual(['2', '3']);
    });
  });

  it('ignores incomplete conditions but keeps complete ones', () => {
    const res = applyInvoiceAdvancedFilter(invoices, {
      conditions: [
        { field: 'metodo' }, // incomplete, dropped
        { field: 'bp', operator: 'iEquals', value: 'Globex' },
      ],
    });
    expect(ids(res)).toEqual(['2']);
  });

  it('passes through rows for an unknown operator', () => {
    const res = applyInvoiceAdvancedFilter(invoices, {
      conditions: [{ field: 'no', operator: 'bogusOp', value: 'x' }],
    });
    expect(ids(res)).toEqual(['1', '2', '3']);
  });
});
