import {
  todayISO, fmtAmount, parseAmount, eur, parseEur,
  FILTER_FIELDS, FILTER_OPS, ESTADOS, fieldType, estadoOf, filterInvoices,
} from '../paymentData';

describe('paymentData — money helpers', () => {
  describe('fmtAmount', () => {
    it('formats a number to two decimals', () => {
      expect(fmtAmount(1250.5)).toBe('1250.50');
      expect(fmtAmount(0)).toBe('0.00');
      expect(fmtAmount(7)).toBe('7.00');
    });

    it('treats null/undefined/empty as zero', () => {
      expect(fmtAmount(null)).toBe('0.00');
      expect(fmtAmount(undefined)).toBe('0.00');
      expect(fmtAmount('')).toBe('0.00');
    });

    it('coerces numeric strings', () => {
      expect(fmtAmount('12.345')).toBe('12.35');
    });
  });

  describe('parseAmount', () => {
    it('parses a plain numeric string', () => {
      expect(parseAmount('1250.5')).toBe(1250.5);
    });

    it('strips commas as thousands separators', () => {
      expect(parseAmount('1,250.50')).toBe(1250.5);
      expect(parseAmount('1,000,000')).toBe(1000000);
    });

    it('returns 0 for non-numeric input', () => {
      expect(parseAmount('abc')).toBe(0);
      expect(parseAmount('')).toBe(0);
    });
  });

  describe('eur', () => {
    it('formats a number as es-ES with two decimals', () => {
      // es-ES uses a dot for thousands and a comma for decimals; use a regex
      // so the test is resilient to NBSP / locale-data variations.
      expect(eur(1250)).toMatch(/^1[.\s]?250,00$/);
      expect(eur(0)).toBe('0,00');
    });

    it('treats null as zero', () => {
      expect(eur(null)).toBe('0,00');
      expect(eur(undefined)).toBe('0,00');
    });
  });

  describe('parseEur', () => {
    it('parses an es-ES formatted amount', () => {
      expect(parseEur('1.250,00')).toBe(1250);
      expect(parseEur('0,00')).toBe(0);
      expect(parseEur('1.000.000,50')).toBe(1000000.5);
    });

    it('returns 0 for non-numeric input', () => {
      expect(parseEur('xyz')).toBe(0);
    });
  });
});

describe('paymentData — todayISO', () => {
  it('returns the current local date as yyyy-MM-dd', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(todayISO()).toBe(expected);
  });

  it('matches the ISO date shape', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('paymentData — catalogs', () => {
  it('FILTER_FIELDS exposes the expected keys', () => {
    const keys = FILTER_FIELDS.map((f) => f.key);
    expect(keys).toEqual(['no', 'bp', 'fecha', 'venc', 'estado', 'pend']);
  });

  it('FILTER_OPS has an entry per field type', () => {
    expect(Object.keys(FILTER_OPS).sort()).toEqual(['date', 'estado', 'num', 'text']);
    expect(FILTER_OPS.text).toEqual([['contiene', 'contiene'], ['es', 'es igual a']]);
  });

  it('ESTADOS lists the three due states', () => {
    expect(ESTADOS.map(([k]) => k)).toEqual(['vencida', 'proxima', 'aldia']);
  });
});

describe('paymentData — fieldType', () => {
  it('returns the type of a known field', () => {
    expect(fieldType('no')).toBe('text');
    expect(fieldType('fecha')).toBe('date');
    expect(fieldType('pend')).toBe('num');
    expect(fieldType('estado')).toBe('estado');
  });

  it('falls back to text for an unknown field', () => {
    expect(fieldType('nope')).toBe('text');
    expect(fieldType(undefined)).toBe('text');
  });
});

describe('paymentData — estadoOf', () => {
  it('is vencida when overdue', () => {
    expect(estadoOf({ dias: -1 })).toBe('vencida');
    expect(estadoOf({ dias: -30 })).toBe('vencida');
  });

  it('is proxima when due within 7 days (inclusive)', () => {
    expect(estadoOf({ dias: 0 })).toBe('proxima');
    expect(estadoOf({ dias: 7 })).toBe('proxima');
  });

  it('is aldia when more than 7 days away', () => {
    expect(estadoOf({ dias: 8 })).toBe('aldia');
    expect(estadoOf({ dias: 100 })).toBe('aldia');
  });
});

describe('paymentData — filterInvoices', () => {
  const rows = [
    { id: '1', no: 'FAC-001', bp: 'Acme', desc: 'Servicios', metodo: 'Transferencia', proyecto: 'P1', cc: 'C1', fecha: '01/01/2026', venc: '15/01/2026', dias: -5, pend: 100, total: 120, expected: 110 },
    { id: '2', no: 'FAC-002', bp: 'Globex', desc: '', metodo: 'Efectivo', proyecto: '', cc: '', fecha: '02/02/2026', venc: '20/02/2026', dias: 3, pend: 250, total: 250, expected: 250 },
    { id: '3', no: 'FAC-003', bp: 'Acme', desc: '', metodo: 'Tarjeta', proyecto: '', cc: '', fecha: '03/03/2026', venc: '30/03/2026', dias: 30, pend: 50, total: 50, expected: 50 },
  ];

  it('returns all rows when query and conditions are empty', () => {
    expect(filterInvoices(rows, '', [])).toHaveLength(3);
    expect(filterInvoices(rows, null, null)).toHaveLength(3);
  });

  it('filters by a free-text query across many fields', () => {
    const res = filterInvoices(rows, 'acme', []);
    expect(res.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('matches the query against formatted amounts via eur()', () => {
    // 250 → "250,00"
    const res = filterInvoices(rows, '250,00', []);
    expect(res.map((r) => r.id)).toEqual(['2']);
  });

  it('trims and lowercases the query', () => {
    expect(filterInvoices(rows, '  GLOBEX  ', [])).toHaveLength(1);
  });

  it('returns nothing when the query matches no row', () => {
    expect(filterInvoices(rows, 'zzzz', [])).toHaveLength(0);
  });

  describe('advanced conditions (matchCond)', () => {
    it('skips a condition with no field / empty value', () => {
      expect(filterInvoices(rows, '', [{ field: '', value: 'x' }])).toHaveLength(3);
      expect(filterInvoices(rows, '', [{ field: 'no', value: '' }])).toHaveLength(3);
      expect(filterInvoices(rows, '', [{ field: 'no', value: null }])).toHaveLength(3);
    });

    it('matches an estado condition', () => {
      const res = filterInvoices(rows, '', [{ field: 'estado', value: 'vencida' }]);
      expect(res.map((r) => r.id)).toEqual(['1']);
    });

    it('matches num "mayor"/"menor"/default(igual)', () => {
      expect(filterInvoices(rows, '', [{ field: 'pend', op: 'mayor', value: '100' }]).map((r) => r.id)).toEqual(['2']);
      expect(filterInvoices(rows, '', [{ field: 'pend', op: 'menor', value: '100' }]).map((r) => r.id)).toEqual(['3']);
      expect(filterInvoices(rows, '', [{ field: 'pend', op: 'igual', value: '100' }]).map((r) => r.id)).toEqual(['1']);
    });

    it('treats a non-numeric num value as a pass-through', () => {
      expect(filterInvoices(rows, '', [{ field: 'pend', op: 'mayor', value: 'abc' }])).toHaveLength(3);
    });

    it('parses es-ES numbers in num conditions', () => {
      expect(filterInvoices(rows, '', [{ field: 'pend', op: 'igual', value: '250,00' }]).map((r) => r.id)).toEqual(['2']);
    });

    it('matches date "antes"/"despues"', () => {
      expect(filterInvoices(rows, '', [{ field: 'venc', op: 'antes', value: '01/02/2026' }]).map((r) => r.id)).toEqual(['1']);
      expect(filterInvoices(rows, '', [{ field: 'venc', op: 'despues', value: '01/02/2026' }]).map((r) => r.id)).toEqual(['2', '3']);
    });

    it('passes through when a date is unparseable', () => {
      expect(filterInvoices(rows, '', [{ field: 'venc', op: 'antes', value: 'not-a-date' }])).toHaveLength(3);
    });

    it('matches text "es" (exact) and default (contains)', () => {
      expect(filterInvoices(rows, '', [{ field: 'bp', op: 'es', value: 'acme' }]).map((r) => r.id)).toEqual(['1', '3']);
      expect(filterInvoices(rows, '', [{ field: 'bp', op: 'contiene', value: 'glob' }]).map((r) => r.id)).toEqual(['2']);
    });

    it('AND-combines multiple conditions', () => {
      const res = filterInvoices(rows, '', [
        { field: 'bp', op: 'es', value: 'acme' },
        { field: 'pend', op: 'mayor', value: '60' },
      ]);
      expect(res.map((r) => r.id)).toEqual(['1']);
    });
  });
});
