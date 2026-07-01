import { nonBlank, toIsoDate, buildTaxSearchTerm, buildLineOps, findBp, resolveTaxesForLines, findTax } from '../purchaseInvoiceDescriptor';

// Mock simSearch and contactApi to test findBp/resolveTaxesForLines without network
vi.mock('../../../../../lib/simSearch.js', () => ({
  simSearch: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../contactApi.js', () => ({
  deriveContactsApiBase: (url) => url.replace(/\/[^/]+$/, '/contacts'),
}));

describe('purchaseInvoiceDescriptor', () => {
  describe('nonBlank', () => {
    it('returns true for non-empty strings', () => {
      expect(nonBlank('hello')).toBe(true);
      expect(nonBlank('0')).toBe(true);
    });

    it('returns false for null, undefined, empty, whitespace', () => {
      expect(nonBlank(null)).toBe(false);
      expect(nonBlank(undefined)).toBe(false);
      expect(nonBlank('')).toBe(false);
      expect(nonBlank('   ')).toBe(false);
    });

    it('handles numbers', () => {
      expect(nonBlank(0)).toBe(true);
      expect(nonBlank(123)).toBe(true);
    });
  });

  describe('toIsoDate', () => {
    it('returns null for falsy input', () => {
      expect(toIsoDate(null)).toBeNull();
      expect(toIsoDate('')).toBeNull();
      expect(toIsoDate(undefined)).toBeNull();
    });

    it('returns ISO dates as-is', () => {
      expect(toIsoDate('2024-03-15')).toBe('2024-03-15');
    });

    it('converts dd/mm/yyyy to ISO', () => {
      expect(toIsoDate('15/03/2024')).toBe('2024-03-15');
    });

    it('converts d-m-yyyy to ISO with padding', () => {
      expect(toIsoDate('5-3-2024')).toBe('2024-03-05');
    });

    it('handles two-digit years', () => {
      expect(toIsoDate('01/06/24')).toBe('2024-06-01');
    });

    it('returns unparseable strings as-is', () => {
      expect(toIsoDate('not a date')).toBe('not a date');
    });
  });

  describe('buildTaxSearchTerm', () => {
    it('returns tax_label when present', () => {
      expect(buildTaxSearchTerm({ tax_label: 'IVA 21%', tax_rate: 21 })).toBe('IVA 21%');
    });

    it('returns rate% when label is empty', () => {
      expect(buildTaxSearchTerm({ tax_label: '', tax_rate: 21 })).toBe('21%');
    });

    it('returns null when no label or rate', () => {
      expect(buildTaxSearchTerm({})).toBeNull();
      expect(buildTaxSearchTerm({ tax_label: '', tax_rate: null })).toBeNull();
    });

    it('handles zero rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: 0 })).toBe('0%');
    });

    it('returns null for NaN rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: 'abc' })).toBeNull();
    });

    it('trims label whitespace', () => {
      expect(buildTaxSearchTerm({ tax_label: '  Exento  ' })).toBe('Exento');
    });
  });

  describe('buildLineOps', () => {
    const lines = [
      { description: 'Widget A', quantity: 2, unit_price: 10.5 },
      { description: 'Widget B', quantity: 1, unit_price: 20 },
      { description: 'Unmatched line' },
    ];
    const productByIdx = { 0: 'PROD1', 1: 'PROD2' }; // line 2 has no product

    it('creates line ops for matched products', () => {
      const { lineOps, unmatched } = buildLineOps(lines, productByIdx);
      expect(lineOps).toHaveLength(2);
      expect(lineOps[0].body.product).toBe('PROD1');
      expect(lineOps[0].body.invoicedQuantity).toBe(2);
      expect(lineOps[0].body.unitPrice).toBe(10.5);
      expect(lineOps[0].body.listPrice).toBe(10.5);
      expect(lineOps[0].entity).toBe('Lines');
      expect(lineOps[0].parentRef).toBe('inv');
    });

    it('collects unmatched descriptions', () => {
      const { unmatched } = buildLineOps(lines, productByIdx);
      expect(unmatched).toEqual(['Unmatched line']);
    });

    it('sets tax when taxByIdx is provided', () => {
      const taxByIdx = { 0: 'TAX1' };
      const { lineOps } = buildLineOps(lines, productByIdx, taxByIdx);
      expect(lineOps[0].body.tax).toBe('TAX1');
      expect(lineOps[1].body.tax).toBeUndefined();
    });

    it('returns empty arrays for no lines', () => {
      const { lineOps, unmatched } = buildLineOps([], {});
      expect(lineOps).toHaveLength(0);
      expect(unmatched).toHaveLength(0);
    });

    it('sets description on line body', () => {
      const { lineOps } = buildLineOps(lines, productByIdx);
      expect(lineOps[0].body.description).toBe('Widget A');
    });

    it('generates sequential ids', () => {
      const { lineOps } = buildLineOps(lines, productByIdx);
      expect(lineOps[0].id).toBe('ln0');
      expect(lineOps[1].id).toBe('ln1');
    });

    it('uses fallback description for unmatched lines without description', () => {
      const noDescLines = [{ quantity: 1 }];
      const { unmatched } = buildLineOps(noDescLines, {});
      expect(unmatched[0]).toBe('line 1');
    });

    it('omits description when blank', () => {
      const blankLines = [{ description: '', quantity: 1, unit_price: 5 }];
      const { lineOps } = buildLineOps(blankLines, { 0: 'P1' });
      expect(lineOps[0].body.description).toBeUndefined();
    });

    it('omits quantity and price when blank', () => {
      const noQtyLines = [{ description: 'Item' }];
      const { lineOps } = buildLineOps(noQtyLines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBeUndefined();
      expect(lineOps[0].body.unitPrice).toBeUndefined();
    });
  });

  describe('findBp', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns null when no apiBaseUrl or token', async () => {
      expect(await findBp({ token: null, apiBaseUrl: '/api', taxId: 'X' })).toBeNull();
      expect(await findBp({ token: 'tk', apiBaseUrl: '', taxId: 'X' })).toBeNull();
    });

    it('returns bp id when taxId matches exactly one', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'BP1' }] } }),
      });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/purchase-invoice', taxId: '12345', name: 'Acme' });
      expect(result).toBe('BP1');
    });

    it('returns null when multiple matches (ambiguous)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'BP1' }, { id: 'BP2' }] } }),
      });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: 'X', name: 'Y' });
      expect(result).toBeNull();
    });

    it('falls back to name search when taxId is blank', async () => {
      // When taxId is blank, nonBlank returns false, so only name query fires
      globalThis.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { data: [{ id: 'BP_NAME' }] } }) });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: '', name: 'Acme' });
      expect(result).toBe('BP_NAME');
    });

    it('returns null on fetch error', async () => {
      globalThis.fetch.mockRejectedValue(new Error('network'));
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: 'X' });
      expect(result).toBeNull();
    });

    it('returns null on non-ok response', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('resolveTaxesForLines', () => {
    it('returns empty for no token', async () => {
      expect(await resolveTaxesForLines({ token: null, lines: [{}] })).toEqual([]);
    });

    it('returns empty for empty lines', async () => {
      expect(await resolveTaxesForLines({ token: 'tk', lines: [] })).toEqual([]);
    });

    it('returns null-filled array when all terms are empty', async () => {
      const result = await resolveTaxesForLines({ token: 'tk', lines: [{ tax_label: '', tax_rate: null }] });
      expect(result).toEqual([null]);
    });

    it('returns empty when lines is not an array', async () => {
      expect(await resolveTaxesForLines({ token: 'tk', lines: 'not-array' })).toEqual([]);
    });

    it('returns empty when lines is null', async () => {
      expect(await resolveTaxesForLines({ token: 'tk', lines: null })).toEqual([]);
    });

    it('calls simSearch and maps results to ids when terms exist', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ id: 'TAX-21' }, null, { id: 'TAX-0' }]);
      const lines = [
        { tax_label: 'IVA 21%' },
        { tax_label: '', tax_rate: null },
        { tax_rate: 0 },
      ];
      const result = await resolveTaxesForLines({ token: 'tk', lines });
      expect(result).toEqual(['TAX-21', null, 'TAX-0']);
      expect(simSearch).toHaveBeenCalledWith(expect.objectContaining({
        entityName: 'FinancialMgmtTaxRate',
        items: ['IVA 21%', '', '0%'],
        minSimPercent: 50,
      }));
    });

    it('returns null for entries where simSearch match has no id', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ name: 'no-id-field' }]);
      const result = await resolveTaxesForLines({ token: 'tk', lines: [{ tax_label: 'Exento' }] });
      expect(result).toEqual([null]);
    });
  });

  describe('findTax', () => {
    it('returns null when no token', async () => {
      expect(await findTax({ token: null, value: 'IVA' })).toBeNull();
    });

    it('returns null when no term', async () => {
      expect(await findTax({ token: 'tk', value: '', extracted: {} })).toBeNull();
    });

    it('returns matched tax with id and label when simSearch finds a match', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ id: 'TAX-21', name: 'IVA Compras 21%' }]);
      const result = await findTax({ token: 'tk', value: 'IVA 21%' });
      expect(result).toEqual({ id: 'TAX-21', label: 'IVA Compras 21%' });
    });

    it('uses value term for label when match has no name', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ id: 'TAX-21' }]);
      const result = await findTax({ token: 'tk', value: 'IVA 21%' });
      expect(result).toEqual({ id: 'TAX-21', label: 'IVA 21%' });
    });

    it('returns null when simSearch returns empty match', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([null]);
      const result = await findTax({ token: 'tk', value: 'IVA' });
      expect(result).toBeNull();
    });

    it('returns null when simSearch returns match without id', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ name: 'something' }]);
      const result = await findTax({ token: 'tk', value: 'IVA' });
      expect(result).toBeNull();
    });

    it('falls back to extracted.tax_label when value is null', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([{ id: 'TAX-EX', name: 'Exento' }]);
      const result = await findTax({ token: 'tk', value: null, extracted: { tax_label: 'Exento' } });
      expect(result).toEqual({ id: 'TAX-EX', label: 'Exento' });
    });
  });

  describe('buildLineOps — null/undefined field edge cases', () => {
    it('handles line with null description', () => {
      const lines = [{ description: null, quantity: 3, unit_price: 10 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.description).toBeUndefined();
      expect(lineOps[0].body.invoicedQuantity).toBe(3);
    });

    it('handles line with null quantity', () => {
      const lines = [{ description: 'Item', quantity: null, unit_price: 5 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBeUndefined();
      expect(lineOps[0].body.unitPrice).toBe(5);
    });

    it('handles line with null unit_price', () => {
      const lines = [{ description: 'Item', quantity: 2, unit_price: null }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBe(2);
      expect(lineOps[0].body.unitPrice).toBeUndefined();
      expect(lineOps[0].body.listPrice).toBeUndefined();
    });

    it('handles line with all fields null', () => {
      const lines = [{ description: null, quantity: null, unit_price: null }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.product).toBe('P1');
      expect(lineOps[0].body.description).toBeUndefined();
      expect(lineOps[0].body.invoicedQuantity).toBeUndefined();
      expect(lineOps[0].body.unitPrice).toBeUndefined();
    });

    it('handles line with undefined fields (missing keys)', () => {
      const lines = [{}];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.product).toBe('P1');
      expect(lineOps[0].body.description).toBeUndefined();
    });
  });

  describe('toIsoDate — dash separator', () => {
    it('converts dd-mm-yyyy with dashes', () => {
      expect(toIsoDate('15-03-2024')).toBe('2024-03-15');
    });

    it('converts d-m-yy with dashes and two-digit year', () => {
      expect(toIsoDate('5-3-24')).toBe('2024-03-05');
    });

    it('converts mixed separator dd/mm/yyyy', () => {
      expect(toIsoDate('31/12/2025')).toBe('2025-12-31');
    });
  });

  describe('buildTaxSearchTerm — edge cases', () => {
    it('returns rate% for negative rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: -5 })).toBe('-5%');
    });

    it('returns null for Infinity rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: Infinity })).toBeNull();
    });

    it('returns null for -Infinity rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: -Infinity })).toBeNull();
    });

    it('returns null for undefined line', () => {
      expect(buildTaxSearchTerm(undefined)).toBeNull();
    });

    it('returns null for null line', () => {
      expect(buildTaxSearchTerm(null)).toBeNull();
    });

    it('returns rate% for string numeric rate', () => {
      expect(buildTaxSearchTerm({ tax_rate: '10.5' })).toBe('10.5%');
    });
  });

  describe('findBp — response format variations', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns bp id when response uses .data instead of .response.data', async () => {
      // Some endpoints return { data: [...] } instead of { response: { data: [...] } }
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'BP-DATA' }] }),
      });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/purchase-invoice', taxId: '99999', name: 'Test' });
      expect(result).toBe('BP-DATA');
    });

    it('returns null when taxId matches multiple (ambiguous) via .data format', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'BP1' }, { id: 'BP2' }] }),
      });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: 'DUPE', name: 'X' });
      expect(result).toBeNull();
    });

    it('returns null when json() parsing fails', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => { throw new Error('invalid json'); },
      });
      const result = await findBp({ token: 'tk', apiBaseUrl: '/api/pi', taxId: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('buildLineOps — quantity without unit_price and vice versa', () => {
    it('sets quantity but not price when unit_price is missing', () => {
      const lines = [{ description: 'Item A', quantity: 5 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBe(5);
      expect(lineOps[0].body.unitPrice).toBeUndefined();
      expect(lineOps[0].body.listPrice).toBeUndefined();
    });

    it('sets price but not quantity when quantity is missing', () => {
      const lines = [{ description: 'Item B', unit_price: 25.5 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBeUndefined();
      expect(lineOps[0].body.unitPrice).toBe(25.5);
      expect(lineOps[0].body.listPrice).toBe(25.5);
    });

    it('sets both when both are present', () => {
      const lines = [{ description: 'Item C', quantity: 3, unit_price: 10 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      expect(lineOps[0].body.invoicedQuantity).toBe(3);
      expect(lineOps[0].body.unitPrice).toBe(10);
      expect(lineOps[0].body.listPrice).toBe(10);
    });

    it('sets neither when both are zero (nonBlank returns true for 0)', () => {
      const lines = [{ description: 'Item D', quantity: 0, unit_price: 0 }];
      const { lineOps } = buildLineOps(lines, { 0: 'P1' });
      // nonBlank(0) is true, so both should be set
      expect(lineOps[0].body.invoicedQuantity).toBe(0);
      expect(lineOps[0].body.unitPrice).toBe(0);
    });
  });

  describe('toIsoDate — various separators', () => {
    it('returns dot-separated input as-is (only / and - are recognized)', () => {
      // toIsoDate regex only handles [/-] separators, not dots
      expect(toIsoDate('25.12.2025')).toBe('25.12.2025');
    });

    it('handles mixed digit lengths with slash', () => {
      expect(toIsoDate('1/2/2025')).toBe('2025-02-01');
    });

    it('handles slash separator with two-digit year', () => {
      expect(toIsoDate('15/06/25')).toBe('2025-06-15');
    });

    it('handles dash separator dd-mm-yyyy', () => {
      expect(toIsoDate('25-12-2025')).toBe('2025-12-25');
    });
  });

  // ---------------------------------------------------------------------------
  // buildPurchaseInvoiceBatch — orchestrator coverage
  // ---------------------------------------------------------------------------

  describe('buildPurchaseInvoiceBatch', () => {
    let buildPurchaseInvoiceBatch;
    let simSearchMock;

    beforeEach(async () => {
      const mod = await import('../purchaseInvoiceDescriptor');
      buildPurchaseInvoiceBatch = mod.buildPurchaseInvoiceBatch;
      const simMod = await import('../../../../../lib/simSearch.js');
      simSearchMock = simMod.simSearch;
      simSearchMock.mockReset();
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns ops with header when vendor found via findBp', async () => {
      // findBp finds a match by taxID
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('businessPartner')) {
          return { ok: true, json: async () => ({ response: { data: [{ id: 'bp-1' }] } }) };
        }
        if (url.includes('locationAddress')) {
          return { ok: true, json: async () => ({ response: { data: [{ id: 'loc-1' }] } }) };
        }
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      // simSearch: product match for all lines, no tax
      simSearchMock.mockResolvedValue([{ id: 'prod-1', name: 'Widget' }]);

      const result = await buildPurchaseInvoiceBatch(
        { vendor_name: 'Acme', tax_id: 'B12345', line_items: [{ description: 'Widget', quantity: 2, unit_price: 10 }] },
        { token: 'tok', apiBaseUrl: 'http://test/neo/purchase-invoice' },
      );

      expect(result.cancelled).toBeUndefined();
      expect(result.ops).toBeDefined();
      const header = result.ops.find(o => o.entity === 'Header');
      expect(header).toBeTruthy();
      expect(header.body.businessPartner).toBe('bp-1');
      // partnerAddress is resolved via findBpLocation which also uses the mocked fetch
      expect(header.body.partnerAddress).toBeTruthy();
      const line = result.ops.find(o => o.entity === 'Lines');
      expect(line).toBeTruthy();
      expect(line.body.product).toBe('prod-1');
    });

    it('returns cancelled when user dismisses BP popup', async () => {
      // findBp finds nothing
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      simSearchMock.mockResolvedValue([]);

      const result = await buildPurchaseInvoiceBatch(
        { vendor_name: 'Unknown', line_items: [{ description: 'X' }] },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          askUserForBp: async () => null, // user cancels
        },
      );

      expect(result.cancelled).toBe(true);
    });

    it('creates bpCreate op when user fills popup with location', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      simSearchMock.mockResolvedValue([{ id: 'prod-1' }]);

      const result = await buildPurchaseInvoiceBatch(
        { vendor_name: 'New Co', line_items: [{ description: 'X', quantity: 1, unit_price: 5 }] },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          askUserForBp: async () => ({
            name: 'New Co',
            searchKey: 'NEWCO',
            location: { addressLine1: '123 Main', city: 'Test' },
          }),
        },
      );

      expect(result.cancelled).toBeUndefined();
      const bpOp = result.ops.find(o => o.id === 'bp');
      expect(bpOp).toBeTruthy();
      expect(bpOp.body.name).toBe('New Co');
      const locOp = result.ops.find(o => o.id === 'loc');
      expect(locOp).toBeTruthy();
      expect(locOp.body.businessPartner).toBe('$ref:bp');
      const header = result.ops.find(o => o.entity === 'Header');
      expect(header.body.businessPartner).toBe('$ref:bp');
      expect(header.body.partnerAddress).toBe('$ref:loc');
    });

    it('uses reviewedHeader.vendor when present', async () => {
      simSearchMock.mockResolvedValue([{ id: 'prod-1' }]);

      const result = await buildPurchaseInvoiceBatch(
        { line_items: [{ description: 'X', quantity: 1 }] },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          reviewedHeader: {
            vendor: { bpId: 'bp-reviewed', bpCreate: null, locationCreate: null },
            documentNo: 'INV-001',
            invoiceDate: '2026-01-15',
          },
        },
      );

      // findBpLocation called with bpId from reviewed vendor
      const header = result.ops.find(o => o.entity === 'Header');
      expect(header.body.businessPartner).toBe('bp-reviewed');
      expect(header.body.orderReference).toBe('INV-001');
      expect(header.body.invoiceDate).toBe('2026-01-15');
    });

    it('returns cancelled when user dismisses product popup', async () => {
      // findBp succeeds
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('businessPartner')) return { ok: true, json: async () => ({ response: { data: [{ id: 'bp-1' }] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      // No product matches
      simSearchMock.mockResolvedValue([]);

      const result = await buildPurchaseInvoiceBatch(
        { vendor_name: 'Acme', tax_id: 'B1', line_items: [{ description: 'Unknown product' }] },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          askUserForProducts: async () => null, // user cancels
        },
      );

      expect(result.cancelled).toBe(true);
    });

    it('merges reviewedLines overrides', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('businessPartner')) return { ok: true, json: async () => ({ response: { data: [{ id: 'bp-1' }] } }) };
        if (url.includes('locationAddress')) return { ok: true, json: async () => ({ response: { data: [{ id: 'loc-1' }] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });
      simSearchMock.mockResolvedValue([{ id: 'prod-1' }]);

      const result = await buildPurchaseInvoiceBatch(
        {
          vendor_name: 'A', tax_id: 'B1',
          line_items: [{ description: 'Widget', quantity: 1, unit_price: 10 }],
        },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          reviewedLines: [{ description: 'Edited Widget', quantity: 5, unit_price: 20, tax_id: 'tax-manual' }],
        },
      );

      const lineOp = result.ops.find(o => o.entity === 'Lines');
      expect(lineOp.body.description).toBe('Edited Widget');
      expect(lineOp.body.invoicedQuantity).toBe(5);
      expect(lineOp.body.unitPrice).toBe(20);
      expect(lineOp.body.tax).toBe('tax-manual');
    });

    it('handles null extracted data', async () => {
      simSearchMock.mockResolvedValue([]);

      const result = await buildPurchaseInvoiceBatch(null, {
        token: 'tok',
        apiBaseUrl: 'http://test/neo/purchase-invoice',
      });

      // No lines → no line ops, just header
      expect(result.ops).toBeDefined();
      const header = result.ops.find(o => o.entity === 'Header');
      expect(header).toBeTruthy();
    });

    it('handles null ctx', async () => {
      simSearchMock.mockResolvedValue([]);

      const result = await buildPurchaseInvoiceBatch(
        { line_items: [] },
        null,
      );

      expect(result.ops).toBeDefined();
    });

    it('drops unmatched lines and includes them in unmatched array', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: [{ id: 'bp-1' }] } }) });
      // Only first product matches
      simSearchMock.mockImplementation(async ({ items }) => {
        return items.map((item, i) => i === 0 ? { id: 'prod-1' } : null);
      });

      const result = await buildPurchaseInvoiceBatch(
        {
          vendor_name: 'A', tax_id: 'B1',
          line_items: [
            { description: 'Matched', quantity: 1 },
            { description: 'Unmatched', quantity: 2 },
          ],
        },
        { token: 'tok', apiBaseUrl: 'http://test/neo/purchase-invoice' },
      );

      expect(result.unmatched).toContain('Unmatched');
      const lineOps = result.ops.filter(o => o.entity === 'Lines');
      expect(lineOps).toHaveLength(1);
    });

    it('skips BP popup when askUserForBp is not a function', async () => {
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) });
      simSearchMock.mockResolvedValue([{ id: 'prod-1' }]);

      const result = await buildPurchaseInvoiceBatch(
        { vendor_name: 'X', line_items: [{ description: 'Y', quantity: 1 }] },
        {
          token: 'tok',
          apiBaseUrl: 'http://test/neo/purchase-invoice',
          askUserForBp: 'not-a-function',
        },
      );

      // Should not cancel, just proceed with $ref:bp
      expect(result.cancelled).toBeUndefined();
      const header = result.ops.find(o => o.entity === 'Header');
      expect(header.body.businessPartner).toBe('$ref:bp');
    });

    it('uses tax from simSearch when no reviewedLine _tax_id', async () => {
      globalThis.fetch.mockImplementation(async (url) => {
        if (url.includes('businessPartner')) return { ok: true, json: async () => ({ response: { data: [{ id: 'bp-1' }] } }) };
        return { ok: true, json: async () => ({ response: { data: [] } }) };
      });

      // First call: product simSearch, second call: tax simSearch
      let callCount = 0;
      simSearchMock.mockImplementation(async ({ entityName }) => {
        if (entityName === 'Product') return [{ id: 'prod-1' }];
        if (entityName === 'FinancialMgmtTaxRate') return [{ id: 'tax-sim' }];
        return [];
      });

      const result = await buildPurchaseInvoiceBatch(
        {
          vendor_name: 'A', tax_id: 'B1',
          line_items: [{ description: 'Widget', quantity: 1, tax_label: 'IVA 21%' }],
        },
        { token: 'tok', apiBaseUrl: 'http://test/neo/purchase-invoice' },
      );

      const lineOp = result.ops.find(o => o.entity === 'Lines');
      expect(lineOp.body.tax).toBe('tax-sim');
    });
  });

  describe('resolveTaxesForLines — simSearch returns objects without .id', () => {
    it('returns null for entries where match has no .id property', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([
        { name: 'IVA 21%' },          // no .id
        { similarity: 0.8 },           // no .id
        { id: 'TAX-OK', name: 'OK' }, // has .id
      ]);
      const lines = [
        { tax_label: 'IVA 21%' },
        { tax_rate: 10 },
        { tax_label: 'Exento' },
      ];
      const result = await resolveTaxesForLines({ token: 'tk', lines });
      expect(result).toEqual([null, null, 'TAX-OK']);
    });

    it('returns null for undefined match entries', async () => {
      const { simSearch } = await import('../../../../../lib/simSearch.js');
      simSearch.mockResolvedValueOnce([undefined, null]);
      const lines = [
        { tax_label: 'Missing' },
        { tax_rate: 5 },
      ];
      const result = await resolveTaxesForLines({ token: 'tk', lines });
      expect(result).toEqual([null, null]);
    });
  });
});
